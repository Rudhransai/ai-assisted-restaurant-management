// MUST be the first import.
//
// ES modules evaluate every import fully before any top-level code in this file runs.
// With `import dotenv` followed by `dotenv.config()`, modules like config/db.ts and
// services/authService.ts were already evaluated — and had already read process.env —
// before .env was ever loaded. The result: the pool silently connected to the default
// database instead of DATABASE_URL, and JWT_SECRET always looked unset.
//
// `dotenv/config` runs on import, and imports are evaluated in source order, so putting
// it first guarantees .env is loaded before anything else reads process.env.
import 'dotenv/config';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { closeDatabaseConnection, pool, verifyDatabaseConnection } from './config/db';
import { RestaurantDbStore } from './services/restaurantDbStore';
import { InventoryDbStore } from './services/inventoryDbStore';
import { StaffDbStore } from './services/staffDbStore';
import { FeedbackDbStore } from './services/feedbackDbStore';
import { BillingDbStore } from './services/billingDbStore';
import { restaurantStore as memoryStore } from './services/restaurantStore';
import { errorHandler } from './middleware/errorHandler';
import { ReminderScheduler } from './services/reminderScheduler';
import { AuthService } from './services/authService';
import { createAuthMiddleware } from './middleware/authMiddleware';
import type { AuthenticatedRequest } from './middleware/authMiddleware';
import { AppError } from './middleware/errorHandler';
import { adminRoutes } from './routes/adminRoutes';
import { rateLimit } from './middleware/rateLimit';
import { applyForeignKeys } from './config/foreignKeys';

interface RestaurantStoreLike {
  getSnapshot(): Promise<unknown> | unknown;
  createReservation(data: unknown): Promise<unknown> | unknown;
  createWaitlistEntry(data: unknown): Promise<unknown> | unknown;
  notifyWaitlistEntry(id: string): Promise<unknown> | unknown;
  assignWaitlistEntry(id: string): Promise<unknown> | unknown;
  updateTableStatus(tableId: string, status: unknown): Promise<unknown> | unknown;
  markReservationNoShow(id: string): Promise<unknown> | unknown;
  sendReminders(): Promise<unknown> | unknown;
}

const app = express();
const dbStore = new RestaurantDbStore(pool);
const inventoryStore = new InventoryDbStore(pool);
const staffStore = new StaffDbStore(pool);
const feedbackStore = new FeedbackDbStore(pool);
const billingStore = new BillingDbStore(pool);
const authService = new AuthService(pool);
const { requireAuth } = createAuthMiddleware(authService);
let activeStore: RestaurantStoreLike = memoryStore;
const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK === 'true';

/**
 * Postgres connection-level error codes. Anything else (a constraint violation, a bad
 * party size, a missing row) is an application error and must surface to the caller.
 */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

const isConnectionError = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return typeof code === 'string' && CONNECTION_ERROR_CODES.has(code);
};

const executeWithFallback = async <T>(operation: (store: RestaurantStoreLike) => Promise<T> | T) => {
  try {
    return await operation(activeStore);
  } catch (error) {
    // Previously ANY error flipped the whole process to the in-memory store permanently —
    // one bad request silently detached the app from the database, and the retry could
    // double-apply a write. Only genuine connection loss falls back now, and only when
    // the operator opted in.
    if (allowMemoryFallback && activeStore !== memoryStore && isConnectionError(error)) {
      console.warn('Postgres connection lost, switching to in-memory store', error);
      activeStore = memoryStore;
      return operation(activeStore);
    }
    throw error;
  }
};

app.use(express.json());

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true });
});

// --- Auth routes ---
// Without a limit, nothing stops a script from trying passwords all day. bcrypt makes
// each attempt slow but not slow enough — cap attempts per IP per window instead.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'login' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, name: 'register' });
// The staff kiosk is public and identified only by employee code — throttle guessing.
const selfServiceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, name: 'staff-self' });

app.post('/api/v1/auth/register', registerLimiter, async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body ?? {};
    const result = await authService.registerCustomer({ email, password, name, phone });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password, role } = req.body ?? {};
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }
    const result = await authService.login(email, password, role);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/auth/me', requireAuth(), async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await authService.getUserById(req.auth!.userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// --- Customer routes ---
app.get('/api/v1/tables', requireAuth(['customer', 'manager']), async (_req, res, next) => {
  try {
    if (activeStore !== dbStore) {
      const snapshot = await executeWithFallback((store) => store.getSnapshot());
      const tables = (snapshot as { tables?: unknown[] }).tables ?? [];
      res.json({ success: true, data: tables });
      return;
    }
    const tables = await dbStore.getTables();
    res.json({ success: true, data: tables });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/table-watch', requireAuth(['customer']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const watches = await dbStore.getTableWatchesForUser(req.auth!.userId);
    res.json({ success: true, data: watches });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/table-watch', requireAuth(['customer']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tableId, email, guestName, partySize } = req.body ?? {};
    if (!tableId || !email) {
      throw new AppError(400, 'tableId and email are required');
    }

    const user = await authService.getUserById(req.auth!.userId);
    const watch = await dbStore.createTableWatch({
      userId: req.auth!.userId,
      tableId,
      email,
      guestName: guestName ?? user?.name ?? 'Guest',
      partySize: Number(partySize) || 2,
    });

    res.status(201).json({ success: true, data: watch });
  } catch (error: any) {
    if (error.message) {
      next(new AppError(400, error.message));
      return;
    }
    next(error);
  }
});

// --- Manager routes (protected) ---
app.get('/api/v1/dashboard', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const snapshot = await executeWithFallback((store) => store.getSnapshot());
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/reservations', requireAuth(['manager']), async (req, res, next) => {
  try {
    const reservation = await executeWithFallback((store) => store.createReservation(req.body));
    res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/waitlist', requireAuth(['manager']), async (req, res, next) => {
  try {
    const entry = await executeWithFallback((store) => store.createWaitlistEntry(req.body));
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/waitlist/:id/notify', requireAuth(['manager']), async (req, res, next) => {
  try {
    const entry = await executeWithFallback((store) => store.notifyWaitlistEntry(req.params.id as string));
    res.json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/waitlist/:id/assign', requireAuth(['manager']), async (req, res, next) => {
  try {
    const result = await executeWithFallback((store) => store.assignWaitlistEntry(req.params.id as string));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/reservations/:id/no-show', requireAuth(['manager']), async (req, res, next) => {
  try {
    const reservation = await executeWithFallback((store) => store.markReservationNoShow(req.params.id as string));
    res.json({ success: true, data: reservation });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/reminders/send', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const count = await executeWithFallback((store) => store.sendReminders());
    res.json({ success: true, sent: count });
  } catch (error) {
    next(error);
  }
});

// --- Manager: table watches overview ---
app.get('/api/v1/table-watches', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const watches = await dbStore.getAllTableWatches();
    res.json({ success: true, data: watches });
  } catch (error) {
    next(error);
  }
});

// --- Manager: all orders + dish stats ---
app.get('/api/v1/orders', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const orders = await dbStore.getOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/dishes/stats', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const stats = await dbStore.getDishStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// Clear / update table status — returns notifiedCount when set to Available
app.post('/api/v1/tables/:id/status', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { table, notifiedCount } = await dbStore.updateTableStatus(req.params.id as string, req.body.status);
    res.json({ success: true, data: table, notifiedCount });
  } catch (error) {
    next(error);
  }
});

// --- Dishes ---
app.get('/api/v1/dishes', requireAuth(['customer', 'manager']), async (_req, res, next) => {
  try {
    const dishes = await dbStore.getDishes();
    res.json({ success: true, data: dishes });
  } catch (error) {
    next(error);
  }
});

// New menu items. The recipe (per-serving ingredient quantities) is set separately in
// the Billing tab so inventory deduction knows what the dish consumes.
app.post('/api/v1/dishes', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { name, description, price, category } = req.body ?? {};
    if (!name || price === undefined) throw new AppError(400, 'name and price are required');
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) throw new AppError(400, 'price must be a non-negative number');
    const dish = await dbStore.addDish({
      name: String(name).trim(),
      description: (description ?? '').trim(),
      price: parsedPrice,
      category: (category ?? 'Mains').trim() || 'Mains',
    });
    res.status(201).json({ success: true, data: dish });
  } catch (error) {
    next(error);
  }
});

// Which dishes were bought at what time, most recent first.
app.get('/api/v1/dishes/timeline', requireAuth(['manager']), async (_req, res, next) => {
  try {
    res.json({ success: true, data: await dbStore.getDishTimeline() });
  } catch (error) {
    next(error);
  }
});

// --- Orders ---
app.post('/api/v1/orders', requireAuth(['customer']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tableId, tableNumber, partySize, items, paymentMethod, phone } = req.body ?? {};
    if (!tableId || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'tableId and at least one item are required');
    }
    const user = await authService.getUserById(req.auth!.userId);
    if (!user) throw new AppError(404, 'User not found');

    const order = await dbStore.createOrder({
      guestName: user.name,
      email: user.email,
      // Optional. When supplied, the confirmation also goes out on WhatsApp.
      ...(typeof phone === 'string' && phone.trim() ? { phone: phone.trim() } : {}),
      tableId,
      tableNumber: tableNumber ?? tableId,
      partySize: Number(partySize) || 1,
      items,
      paymentMethod: paymentMethod ?? 'card',
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

// ── Inventory / Module 2 routes (all manager-protected) ─────────────────────

app.get('/api/v1/inventory/ingredients', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getIngredients() }); } catch (e) { next(e); }
});

app.post('/api/v1/inventory/ingredients', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { name, unit, currentStock, minimumStock, costPerUnit, vendorId } = req.body ?? {};
    if (!name || !unit) throw new AppError(400, 'name and unit are required');
    const item = await inventoryStore.addIngredient({
      name, unit,
      currentStock: Number(currentStock) || 0,
      minimumStock: Number(minimumStock) || 0,
      costPerUnit: Number(costPerUnit) || 0,
      vendorId: vendorId ?? '',
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

app.get('/api/v1/inventory/vendors', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getVendors() }); } catch (e) { next(e); }
});

app.post('/api/v1/inventory/vendors', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { name, phone, email, itemsSupplied } = req.body ?? {};
    if (!name) throw new AppError(400, 'name is required');
    const vendor = await inventoryStore.addVendor({ name, phone: phone ?? '', email: email ?? '', itemsSupplied: itemsSupplied ?? '' });
    res.status(201).json({ success: true, data: vendor });
  } catch (e) { next(e); }
});

app.get('/api/v1/inventory/purchases', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getPurchases() }); } catch (e) { next(e); }
});

app.post('/api/v1/inventory/purchases', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { vendorId, vendorName, ingredientId, ingredientName, quantity, unit, cost, purchaseDate } = req.body ?? {};
    if (!ingredientId || !ingredientName || !quantity || !cost) throw new AppError(400, 'ingredientId, ingredientName, quantity and cost are required');
    const purchase = await inventoryStore.addPurchase({
      vendorId: vendorId ?? '', vendorName: vendorName ?? '',
      ingredientId, ingredientName,
      quantity: Number(quantity), unit: unit ?? 'kg',
      cost: Number(cost), purchaseDate: purchaseDate ?? new Date().toISOString().split('T')[0],
    });
    res.status(201).json({ success: true, data: purchase });
  } catch (e) { next(e); }
});

app.get('/api/v1/inventory/wastage', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getWastageLogs() }); } catch (e) { next(e); }
});

app.post('/api/v1/inventory/wastage', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { ingredientId, ingredientName, quantity, unit, reason, cost, date } = req.body ?? {};
    if (!ingredientId || !ingredientName || !quantity) throw new AppError(400, 'ingredientId, ingredientName and quantity are required');
    const log = await inventoryStore.addWastage({
      ingredientId, ingredientName,
      quantity: Number(quantity), unit: unit ?? 'kg',
      reason: reason ?? '', cost: Number(cost) || 0,
      date: date ?? new Date().toISOString().split('T')[0],
    });
    res.status(201).json({ success: true, data: log });
  } catch (e) { next(e); }
});

app.get('/api/v1/inventory/stock-entries', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getStockEntries() }); } catch (e) { next(e); }
});

app.post('/api/v1/inventory/stock-entries', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { ingredientId, ingredientName, entryType, quantity, date, notes } = req.body ?? {};
    if (!ingredientId || !ingredientName || !entryType || quantity === undefined) throw new AppError(400, 'ingredientId, ingredientName, entryType and quantity are required');
    const entry = await inventoryStore.addStockEntry({
      ingredientId, ingredientName, entryType,
      quantity: Number(quantity),
      date: date ?? new Date().toISOString().split('T')[0],
      notes: notes ?? '',
    });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.get('/api/v1/inventory/analytics', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getInventoryAnalytics() }); } catch (e) { next(e); }
});

// ── Sales & Menu Analytics (Module 3) ────────────────────────────────────────

app.get('/api/v1/analytics/sales', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await inventoryStore.getSalesAnalytics() }); } catch (e) { next(e); }
});

// ── Staff & Scheduling (Module 4) ─────────────────────────────────────────────

app.get('/api/v1/staff/employees', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getEmployees() }); } catch (e) { next(e); }
});

app.post('/api/v1/staff/employees', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { employeeCode, fullName, role, phoneNumber } = req.body ?? {};
    if (!employeeCode || !fullName || !role) throw new AppError(400, 'employeeCode, fullName and role are required');
    const emp = await staffStore.addEmployee({ employeeCode, fullName, role, phoneNumber: phoneNumber ?? '' });
    res.status(201).json({ success: true, data: emp });
  } catch (e) { next(e); }
});

app.patch('/api/v1/staff/employees/:id/status', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { status } = req.body ?? {};
    await staffStore.updateEmployeeStatus(req.params.id as string, status);
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/shifts', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getShifts() }); } catch (e) { next(e); }
});

app.post('/api/v1/staff/shifts', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { shiftName, startTime, endTime, breakMinutes } = req.body ?? {};
    if (!shiftName || !startTime || !endTime) throw new AppError(400, 'shiftName, startTime and endTime are required');
    const shift = await staffStore.addShift({ shiftName, startTime, endTime, breakMinutes: Number(breakMinutes) || 30 });
    res.status(201).json({ success: true, data: shift });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/schedule', requireAuth(['manager']), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const scheduleArgs: { dateFrom?: string; dateTo?: string } = {};
    if (q['dateFrom'] !== undefined) scheduleArgs.dateFrom = q['dateFrom'];
    if (q['dateTo'] !== undefined) scheduleArgs.dateTo = q['dateTo'];
    res.json({ success: true, data: await staffStore.getShiftSchedule(scheduleArgs) });
  } catch (e) { next(e); }
});

app.post('/api/v1/staff/schedule', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { employeeId, shiftId, shiftDate, assignedBy, remarks } = req.body ?? {};
    if (!employeeId || !shiftId || !shiftDate) throw new AppError(400, 'employeeId, shiftId and shiftDate are required');
    const entry = await staffStore.assignShift({ employeeId, shiftId, shiftDate, assignedBy: assignedBy ?? 'Manager', remarks: remarks ?? '' });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.delete('/api/v1/staff/schedule/:id', requireAuth(['manager']), async (req, res, next) => {
  try { await staffStore.deleteShiftAssignment(req.params.id as string); res.json({ success: true }); } catch (e) { next(e); }
});

app.get('/api/v1/staff/availability', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getAvailability() }); } catch (e) { next(e); }
});

app.post('/api/v1/staff/availability', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { employeeId, availableFrom, availableTo, status, remarks } = req.body ?? {};
    if (!employeeId || !availableFrom || !availableTo) throw new AppError(400, 'employeeId, availableFrom and availableTo are required');
    const entry = await staffStore.addAvailability({ employeeId, availableFrom, availableTo, status: status ?? 'Available', remarks: remarks ?? '' });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/leave', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getLeaveRequests() }); } catch (e) { next(e); }
});

app.post('/api/v1/staff/leave', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { employeeId, leaveType, startDate, endDate, reason } = req.body ?? {};
    if (!employeeId || !leaveType || !startDate || !endDate) throw new AppError(400, 'employeeId, leaveType, startDate and endDate are required');
    const entry = await staffStore.addLeaveRequest({ employeeId, leaveType, startDate, endDate, reason: reason ?? '' });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.patch('/api/v1/staff/leave/:id', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { status, approvedBy } = req.body ?? {};
    if (!status) throw new AppError(400, 'status is required');
    const entry = await staffStore.updateLeaveStatus(req.params.id as string, status, approvedBy ?? 'Manager');
    res.json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/attendance', requireAuth(['manager']), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const attArgs: { dateFrom?: string; dateTo?: string; employeeId?: string } = {};
    if (q['dateFrom'] !== undefined) attArgs.dateFrom = q['dateFrom'];
    if (q['dateTo'] !== undefined) attArgs.dateTo = q['dateTo'];
    if (q['employeeId'] !== undefined) attArgs.employeeId = q['employeeId'];
    res.json({ success: true, data: await staffStore.getAttendance(attArgs) });
  } catch (e) { next(e); }
});

app.post('/api/v1/staff/attendance', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { employeeId, attendanceDate, checkIn, checkOut, breakMinutes, attendanceStatus, markedBy, shiftId } = req.body ?? {};
    if (!employeeId || !attendanceDate) throw new AppError(400, 'employeeId and attendanceDate are required');
    const entry = await staffStore.markAttendance({ employeeId, attendanceDate, checkIn: checkIn ?? '', checkOut: checkOut ?? '', breakMinutes: Number(breakMinutes) || 30, attendanceStatus: attendanceStatus ?? 'Present', markedBy: markedBy ?? 'Manager', shiftId: shiftId ?? '' });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/payroll', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getPayrollSummaries() }); } catch (e) { next(e); }
});

app.post('/api/v1/staff/payroll/generate', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { month } = req.body ?? {};
    if (!month) throw new AppError(400, 'month is required (format: YYYY-MM)');
    const summaries = await staffStore.generatePayroll(month);
    res.status(201).json({ success: true, data: summaries });
  } catch (e) { next(e); }
});

app.get('/api/v1/staff/analytics', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await staffStore.getStaffAnalytics() }); } catch (e) { next(e); }
});

// ── Customer Feedback Aggregator (Module 5) ───────────────────────────────────

app.get('/api/v1/feedback', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await feedbackStore.getFeedback() }); } catch (e) { next(e); }
});

app.post('/api/v1/feedback', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { customerName, customerId, reviewText, rating, source, reviewDate } = req.body ?? {};
    if (!reviewText || rating === undefined) throw new AppError(400, 'reviewText and rating are required');
    if (!customerName && !customerId) throw new AppError(400, 'customerName or customerId is required');
    const item = await feedbackStore.addFeedback({
      customerId, customerName, reviewText,
      rating: Number(rating), source: source ?? 'Direct',
      reviewDate,
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
});

app.get('/api/v1/feedback/analytics', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await feedbackStore.getAnalytics() }); } catch (e) { next(e); }
});

app.get('/api/v1/feedback/customers', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await feedbackStore.getCustomers() }); } catch (e) { next(e); }
});

app.get('/api/v1/feedback/categories', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await feedbackStore.getCategories() }); } catch (e) { next(e); }
});

app.post('/api/v1/feedback/weekly-summary/generate', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const summary = await feedbackStore.generateWeeklySummary();
    res.status(201).json({ success: true, data: summary });
  } catch (e) { next(e); }
});

app.get('/api/v1/feedback/weekly-summary', requireAuth(['manager']), async (_req, res, next) => {
  try { res.json({ success: true, data: await feedbackStore.getWeeklySummaries() }); } catch (e) { next(e); }
});

// Public reservation entry (customer can also use authenticated table-watch)
app.post('/api/v1/public/reservation', async (req, res, next) => {
  try {
    const { guestName, email, phone, time, partySize, preferredTableId } = req.body ?? {};
    if (!guestName || !phone || !time || !partySize) {
      res.status(400).json({ success: false, message: 'Missing required fields: guestName, phone, time, partySize' });
      return;
    }

    const entry = await executeWithFallback((s) =>
      s.createWaitlistEntry({
        guestName,
        partySize: Number(partySize),
        email: email ?? '',
        phone,
        preferredTableId: preferredTableId ?? '',
        // The requested time was previously collected and thrown away — now the manager
        // sees it on the waitlist and can honour it.
        preferredTime: time,
      })
    );

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

// Table list for the public booking form, so guests can pick a preferred table.
app.get('/api/v1/public/tables', async (_req, res, next) => {
  try {
    const tables = await dbStore.getTables();
    res.json({
      success: true,
      data: (tables as Array<{ id: string; tableNumber: string; capacity: number; zone: string }>).map(
        ({ id, tableNumber, capacity, zone }) => ({ id, tableNumber, capacity, zone })
      ),
    });
  } catch (error) {
    next(error);
  }
});

// ── Employee self-service (kiosk-style: identified by employee code, no login) ─
// Attendance, leave and availability are the employee's own actions — the manager
// only reviews and approves.

app.get('/api/v1/staff/self/:code', selfServiceLimiter, async (req, res, next) => {
  try {
    const status = await staffStore.getSelfStatus(req.params.code as string);
    if (!status) throw new AppError(404, 'No employee found with that code');
    res.json({ success: true, data: status });
  } catch (e) { next(e); }
});

app.post('/api/v1/staff/self/:code/check-in', selfServiceLimiter, async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await staffStore.selfCheckIn(req.params.code as string) });
  } catch (e: any) { next(new AppError(400, e.message ?? 'Check-in failed')); }
});

app.post('/api/v1/staff/self/:code/check-out', selfServiceLimiter, async (req, res, next) => {
  try {
    res.json({ success: true, data: await staffStore.selfCheckOut(req.params.code as string) });
  } catch (e: any) { next(new AppError(400, e.message ?? 'Check-out failed')); }
});

app.post('/api/v1/staff/self/:code/leave', selfServiceLimiter, async (req, res, next) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body ?? {};
    if (!leaveType || !startDate || !endDate) throw new AppError(400, 'leaveType, startDate and endDate are required');
    res.status(201).json({
      success: true,
      data: await staffStore.selfAddLeave(req.params.code as string, { leaveType, startDate, endDate, reason: reason ?? '' }),
    });
  } catch (e: any) { next(e instanceof AppError ? e : new AppError(400, e.message ?? 'Leave request failed')); }
});

app.post('/api/v1/staff/self/:code/availability', selfServiceLimiter, async (req, res, next) => {
  try {
    const { availableFrom, availableTo, status, remarks } = req.body ?? {};
    if (!availableFrom || !availableTo) throw new AppError(400, 'availableFrom and availableTo are required');
    res.status(201).json({
      success: true,
      data: await staffStore.selfAddAvailability(req.params.code as string, {
        availableFrom, availableTo,
        status: status === 'Unavailable' ? 'Unavailable' : 'Available',
        remarks: remarks ?? '',
      }),
    });
  } catch (e: any) { next(e instanceof AppError ? e : new AppError(400, e.message ?? 'Availability update failed')); }
});

// In production, serve the Vite-built React frontend and handle SPA routing
// --- Admin routes (verify-mail, db-health, user list, table viewer) ---
app.use('/api/v1/admin', adminRoutes);

/**
 * Re-classify stored reviews with the real models. Safe to run repeatedly.
 * Returns how many rows the models actually updated.
 */
app.post('/api/v1/feedback/reanalyze', requireAuth(['manager']), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.body?.limit) || 50, 200);
    const result = await feedbackStore.reanalyzeStoredFeedback(limit);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ── Billing: invoices, payments, recipes ─────────────────────────────────────
// Flow: order -> invoice -> payment request (QR + link) -> mock gateway -> webhook
//       -> invoice paid, payment saved, inventory deducted, receipt sent.

app.get('/api/v1/invoices', requireAuth(['manager']), async (_req, res, next) => {
  try {
    res.json({ success: true, data: await billingStore.listInvoices() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/invoices', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { orderId, email, phone } = req.body ?? {};
    if (!orderId) throw new AppError(400, 'orderId is required');

    const invoice = await billingStore.createInvoice(orderId, {
      ...(typeof email === 'string' && email.trim() ? { email: email.trim() } : {}),
      ...(typeof phone === 'string' && phone.trim() ? { phone: phone.trim() } : {}),
    });
    if (!invoice) throw new AppError(404, 'Order not found');

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/invoices/:id/payment-request', requireAuth(['manager']), async (req, res, next) => {
  try {
    const request = await billingStore.createPaymentRequest(req.params.id as string);
    if (!request) throw new AppError(404, 'Invoice not found');
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/recipes', requireAuth(['manager']), async (_req, res, next) => {
  try {
    res.json({ success: true, data: await billingStore.listRecipes() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/recipes', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { dishId, ingredientId, quantityPerServing } = req.body ?? {};
    if (!dishId || !ingredientId) throw new AppError(400, 'dishId and ingredientId are required');
    const quantity = Number(quantityPerServing);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(400, 'quantityPerServing must be a positive number');
    }
    res.status(201).json({
      success: true,
      data: await billingStore.setRecipeLine({ dishId, ingredientId, quantityPerServing: quantity }),
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/recipes/:id', requireAuth(['manager']), async (req, res, next) => {
  try {
    const removed = await billingStore.deleteRecipeLine(req.params.id as string);
    if (!removed) throw new AppError(404, 'Recipe line not found');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * One-tap reservation confirm/cancel, opened from the WhatsApp/email reminder links.
 * Public on purpose — the guest is not logged in; the reservation id is the reference
 * they were sent.
 */
app.get('/reserve/confirm', async (req, res, next) => {
  try {
    const id = String(req.query.id ?? '');
    const status = req.query.status === 'cancelled' ? 'Cancelled' : 'Confirmed';
    if (!id) {
      res.status(400).send('<h1>Missing reservation reference</h1>');
      return;
    }

    const updated = await pool.query(
      "UPDATE reservations SET status = $1 WHERE id = $2 AND status IN ('Reserved', 'Confirmed', 'Cancelled') RETURNING guest_name AS \"guestName\", reservation_time AS time",
      [status, id]
    );
    const row = updated.rows[0];

    const ok = status === 'Confirmed';
    const heading = !row
      ? 'Reservation not found'
      : ok
        ? 'See you soon! 🎉'
        : 'Reservation cancelled';
    const message = !row
      ? 'This link is invalid or the reservation has already been seated.'
      : ok
        ? `Thanks${row.guestName ? `, ${row.guestName}` : ''} — your table is confirmed. We look forward to serving you.`
        : `Your reservation has been cancelled${row.guestName ? `, ${row.guestName}` : ''}. We hope to see you another time.`;

    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${heading}</title>
<style>
 body{margin:0;background:#EFF1EE;color:#101418;font-family:system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
 .card{background:#fff;border:1px solid #D8DCD6;border-radius:8px;padding:28px;max-width:380px;width:100%;text-align:center}
 h1{font-size:24px;margin:0 0 12px}
 p{color:#3B4149;font-size:15px;line-height:1.6;margin:0}
</style></head><body>
<div class="card"><h1>${heading}</h1><p>${message}</p></div>
</body></html>`);
  } catch (error) {
    next(error);
  }
});

/**
 * Mock payment gateway. Public on purpose — the customer opens this from the QR code
 * and is not logged in. The unguessable token is what protects it.
 */
app.get('/pay/:token', async (req, res, next) => {
  try {
    const invoice = await billingStore.getInvoiceByToken(req.params.token as string);
    if (!invoice) {
      res.status(404).send('<h1>Payment link not found</h1>');
      return;
    }

    const paid = invoice.status === 'paid';
    const amount = Number(invoice.amount).toFixed(2);

    res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pay ${invoice.invoiceNumber}</title>
<style>
 body{margin:0;background:#EFF1EE;color:#101418;font-family:system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
 .card{background:#fff;border:1px solid #D8DCD6;border-radius:8px;padding:28px;max-width:380px;width:100%}
 .lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#3B4149;margin:0}
 .amt{font-size:40px;font-weight:700;margin:8px 0 4px;font-variant-numeric:tabular-nums}
 .muted{color:#3B4149;font-size:14px;margin:0}
 button{width:100%;margin-top:24px;padding:14px;border:0;border-radius:6px;background:#101418;
        color:#fff;font-size:15px;font-weight:600;cursor:pointer}
 button:disabled{opacity:.5;cursor:default}
 .ok{margin-top:20px;padding:12px;border-radius:6px;background:rgba(15,110,92,.08);color:#0F6E5C;font-size:14px}
 .err{margin-top:20px;padding:12px;border-radius:6px;background:rgba(179,38,30,.08);color:#B3261E;font-size:14px}
</style></head><body>
<div class="card">
  <p class="lbl">Invoice ${invoice.invoiceNumber}</p>
  <p class="amt">&#8377;${amount}</p>
  <p class="muted">${invoice.guestName || 'Guest'}</p>
  ${paid
    ? '<div class="ok">Already paid. Thank you.</div>'
    : `<button id="pay">Pay &#8377;${amount}</button><div id="msg"></div>`}
</div>
<script>
 var btn = document.getElementById('pay');
 if (btn) btn.addEventListener('click', async function () {
   btn.disabled = true; btn.textContent = 'Processing...';
   var msg = document.getElementById('msg');
   try {
     var r = await fetch('/api/v1/payments/mock-gateway/${req.params.token}', { method: 'POST' });
     var d = await r.json();
     if (r.ok) { msg.className = 'ok'; msg.textContent = 'Payment successful. Your receipt is on its way.'; btn.style.display = 'none'; }
     else { msg.className = 'err'; msg.textContent = d.message || 'Payment failed.'; btn.disabled = false; btn.textContent = 'Try again'; }
   } catch (e) {
     msg.className = 'err'; msg.textContent = 'Network error.'; btn.disabled = false; btn.textContent = 'Try again';
   }
 });
</script>
</body></html>`);
  } catch (error) {
    next(error);
  }
});

/**
 * The mock gateway "charges" the customer and then calls our own webhook exactly the way
 * a real provider would — same signature, same payload shape — so the webhook path is the
 * one actually exercised in testing.
 */
app.post('/api/v1/payments/mock-gateway/:token', async (req, res, next) => {
  try {
    const invoice = await billingStore.getInvoiceByToken(req.params.token as string);
    if (!invoice) throw new AppError(404, 'Payment link not found');
    if (invoice.status === 'paid') {
      res.json({ success: true, data: { status: 'already_paid' } });
      return;
    }

    const payload = JSON.stringify({
      event: 'payment.succeeded',
      paymentToken: req.params.token as string,
      providerReference: `mock_${Date.now()}`,
      method: 'upi',
    });

    const result = await billingStore.markInvoicePaid({
      paymentToken: req.params.token as string,
      providerReference: JSON.parse(payload).providerReference,
      method: 'upi',
    });

    if (!result.ok) throw new AppError(404, 'Invoice not found');
    res.json({ success: true, data: { status: 'paid' } });
  } catch (error) {
    next(error);
  }
});

/**
 * Real webhook endpoint, for when a genuine gateway replaces the mock one.
 * Requires a valid HMAC signature in x-payment-signature.
 */
app.post('/api/v1/payments/webhook', express.text({ type: '*/*' }), async (req, res, next) => {
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const signature = String(req.headers['x-payment-signature'] ?? '');

    if (!billingStore.verifyWebhookSignature(raw, signature)) {
      throw new AppError(401, 'Invalid webhook signature');
    }

    const event = JSON.parse(raw);
    if (event.event !== 'payment.succeeded') {
      res.json({ success: true, data: { ignored: event.event } });
      return;
    }

    const result = await billingStore.markInvoicePaid({
      paymentToken: event.paymentToken,
      providerReference: event.providerReference ?? '',
      method: event.method ?? 'upi',
    });

    if (!result.ok) throw new AppError(404, 'Invoice not found');
    res.json({ success: true, data: { processed: !result.alreadyProcessed } });
  } catch (error) {
    next(error);
  }
});

// Serve the built React frontend last: the SPA catch-all must not shadow real routes
// such as /pay/:token, which is a server-rendered page, not part of the React app.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, async () => {
  try {
    await verifyDatabaseConnection();
    await dbStore.initialize();
    await inventoryStore.initialize();
    await staffStore.initialize();
    await feedbackStore.initialize();
    await billingStore.initialize();
    await authService.initialize();
    // After every store has created its tables — the constraints cross store boundaries.
    await applyForeignKeys(pool);
    activeStore = dbStore;
    console.log(`Server successfully booted up on port ${PORT} using PostgreSQL`);

    // WhatsApp Web provider: connect at boot so the QR prompt (first run only) appears
    // in this terminal instead of delaying the first customer notification.
    if (process.env.WHATSAPP_PROVIDER === 'web') {
      const { initWhatsAppWeb } = await import('./integrations/whatsappWeb');
      void initWhatsAppWeb();
    }

    const scheduler = new ReminderScheduler(pool);
    scheduler.start();
  } catch (error) {
    if (allowMemoryFallback) {
      console.warn('PostgreSQL unavailable, using in-memory store for restaurant operations', error);
      activeStore = memoryStore;
      console.log(`Server successfully booted up on port ${PORT} using in-memory fallback`);
    } else {
      console.error('PostgreSQL connection failed. Set DATABASE_URL or start PostgreSQL before starting the server.', error);
      await closeDatabaseConnection();
      process.exit(1);
    }
  }
});
