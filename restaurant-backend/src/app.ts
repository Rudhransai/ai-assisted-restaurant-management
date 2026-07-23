import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { closeDatabaseConnection, pool, verifyDatabaseConnection } from './config/db';
import { RestaurantDbStore } from './services/restaurantDbStore';
import { InventoryDbStore } from './services/inventoryDbStore';
import { StaffDbStore } from './services/staffDbStore';
import { FeedbackDbStore } from './services/feedbackDbStore';
import { restaurantStore as memoryStore } from './services/restaurantStore';
import { errorHandler } from './middleware/errorHandler';
import { ReminderScheduler } from './services/reminderScheduler';
import { AuthService } from './services/authService';
import { createAuthMiddleware } from './middleware/authMiddleware';
import type { AuthenticatedRequest } from './middleware/authMiddleware';
import { AppError } from './middleware/errorHandler';
import { adminRoutes } from './routes/adminRoutes';

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
const authService = new AuthService(pool);
const { requireAuth } = createAuthMiddleware(authService);
let activeStore: RestaurantStoreLike = memoryStore;
const allowMemoryFallback = process.env.ALLOW_MEMORY_FALLBACK === 'true';

const executeWithFallback = async <T>(operation: (store: RestaurantStoreLike) => Promise<T> | T) => {
  try {
    return await operation(activeStore);
  } catch (error) {
    if (activeStore !== memoryStore) {
      console.warn('Postgres unavailable, switching to in-memory store', error);
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
app.post('/api/v1/auth/register', async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body ?? {};
    const result = await authService.registerCustomer({ email, password, name, phone });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/login', async (req, res, next) => {
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

// --- Orders ---
app.post('/api/v1/orders', requireAuth(['customer']), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { tableId, tableNumber, partySize, items, paymentMethod } = req.body ?? {};
    if (!tableId || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'tableId and at least one item are required');
    }
    const user = await authService.getUserById(req.auth!.userId);
    if (!user) throw new AppError(404, 'User not found');

    const order = await dbStore.createOrder({
      guestName: user.name,
      email: user.email,
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
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    res.json({ success: true, data: await staffStore.getShiftSchedule({ dateFrom, dateTo }) });
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
    const { dateFrom, dateTo, employeeId } = req.query as Record<string, string>;
    res.json({ success: true, data: await staffStore.getAttendance({ dateFrom, dateTo, employeeId }) });
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
      })
    );

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

// In production, serve the Vite-built React frontend and handle SPA routing
// --- Admin routes (verify-mail, db-health, user list, table viewer) ---
app.use('/api/v1/admin', adminRoutes);

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
    await authService.initialize();
    activeStore = dbStore;
    console.log(`Server successfully booted up on port ${PORT} using PostgreSQL`);

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
