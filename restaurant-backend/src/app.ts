import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { closeDatabaseConnection, pool, verifyDatabaseConnection } from './config/db';
import { RestaurantDbStore } from './services/restaurantDbStore';
import { restaurantStore as memoryStore } from './services/restaurantStore';
import { errorHandler } from './middleware/errorHandler';
import { ReminderScheduler } from './services/reminderScheduler';
import { AuthService } from './services/authService';
import { createAuthMiddleware } from './middleware/authMiddleware';
import type { AuthenticatedRequest } from './middleware/authMiddleware';
import { AppError } from './middleware/errorHandler';

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

app.post('/api/v1/tables/:id/status', requireAuth(['manager']), async (req, res, next) => {
  try {
    const table = await executeWithFallback((store) => store.updateTableStatus(req.params.id as string, req.body.status));
    res.json({ success: true, data: table });
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

app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, async () => {
  try {
    await verifyDatabaseConnection();
    await dbStore.initialize();
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
