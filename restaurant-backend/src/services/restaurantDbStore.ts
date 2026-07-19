import { Pool } from 'pg';
import { sendNotification } from '../integrations/notificationSender';
import { renderRestaurantMailContent, mailSubject } from '../integrations/mailTemplate';

export type TableStatus = 'Available' | 'Occupied' | 'Reserved';

export interface TableItem {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string;
  status: TableStatus;
}

export interface ReservationItem {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
  tableId: string;
  status: 'Reserved' | 'Seated' | 'No-show';
  email: string;
  phone: string;
  reminderSent?: boolean;
}

export interface WaitlistItem {
  id: string;
  guestName: string;
  partySize: number;
  email: string;
  phone: string;
  position: number;
  quotedWaitMinutes: number;
  status: 'Waiting' | 'Notified' | 'Seated';
  preferredTableId?: string;
}

export interface TableWatchItem {
  id: string;
  userId: string;
  tableId: string;
  email: string;
  guestName: string;
  partySize: number;
  status: 'Waiting' | 'Notified' | 'Fulfilled' | 'Cancelled';
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  recipient: string;
  content: string;
  status: string;
  createdAt: string;
}

export interface DishItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
}

export interface OrderLineItem {
  dishId: string;
  dishName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderRecord {
  id: string;
  guestName: string;
  email: string;
  tableId: string;
  tableNumber: string;
  partySize: number;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  items: OrderLineItem[];
}

export class RestaurantDbStore {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        table_number TEXT NOT NULL,
        capacity INT NOT NULL,
        zone TEXT NOT NULL,
        status TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        guest_name TEXT NOT NULL,
        party_size INT NOT NULL,
        reservation_time TEXT NOT NULL,
        table_id TEXT NOT NULL,
        status TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        reminder_sent BOOLEAN DEFAULT FALSE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id TEXT PRIMARY KEY,
        guest_name TEXT NOT NULL,
        party_size INT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        position INT NOT NULL,
        quoted_wait_minutes INT NOT NULL,
        status TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS table_watch (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        table_id TEXT NOT NULL,
        email TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        party_size INT NOT NULL DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'Waiting',
        created_at TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_table_id TEXT DEFAULT ''
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dishes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        category TEXT NOT NULL,
        available BOOLEAN DEFAULT TRUE
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        guest_name TEXT NOT NULL,
        email TEXT NOT NULL,
        table_id TEXT NOT NULL,
        table_number TEXT NOT NULL,
        party_size INT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed',
        payment_method TEXT NOT NULL DEFAULT 'card',
        created_at TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        dish_id TEXT NOT NULL,
        dish_name TEXT NOT NULL,
        quantity INT NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL
      )
    `);

    const dishCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM dishes');
    if ((dishCount.rows[0]?.count ?? 0) === 0) {
      await this.pool.query(`
        INSERT INTO dishes (id, name, description, price, category, available) VALUES
        ('d1','Soup of the Day','Rich, slow-cooked broth with seasonal vegetables',6.50,'Starters',TRUE),
        ('d2','Garlic Bread','Toasted sourdough with herb butter and roasted garlic',4.50,'Starters',TRUE),
        ('d3','Bruschetta','Grilled bread with tomato, basil, and olive oil',5.50,'Starters',TRUE),
        ('d4','Caesar Salad','Crisp romaine, parmesan, croutons, house caesar dressing',8.00,'Starters',TRUE),
        ('d5','Margherita Pizza','San Marzano tomato, fresh mozzarella, basil',14.00,'Mains',TRUE),
        ('d6','Pasta Carbonara','Spaghetti, pancetta, egg, parmesan, black pepper',13.50,'Mains',TRUE),
        ('d7','Grilled Chicken','Herb-marinated breast, seasonal vegetables, lemon jus',16.00,'Mains',TRUE),
        ('d8','Veg Burger','Quinoa-black bean patty, lettuce, tomato, chipotle mayo',12.50,'Mains',TRUE),
        ('d9','Fish & Chips','Beer-battered cod, thick-cut chips, tartare sauce',15.00,'Mains',TRUE),
        ('d10','Chocolate Lava Cake','Warm dark chocolate cake, vanilla ice cream',7.50,'Desserts',TRUE),
        ('d11','Ice Cream Sundae','Three scoops, warm fudge, whipped cream, cherry',6.00,'Desserts',TRUE),
        ('d12','Cheesecake','New York style with strawberry compote',6.50,'Desserts',TRUE),
        ('d13','Lemonade','Freshly squeezed with mint',3.50,'Drinks',TRUE),
        ('d14','Masala Chai','Spiced tea with milk',2.50,'Drinks',TRUE),
        ('d15','Fresh Juice','Orange, apple, or watermelon',3.00,'Drinks',TRUE),
        ('d16','House Wine (glass)','Red or white, ask your server',6.00,'Drinks',TRUE)
      `);
    }

    const tableCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM tables');
    if ((tableCount.rows[0]?.count ?? 0) === 0) {
      await this.pool.query(`
        INSERT INTO tables (id, table_number, capacity, zone, status) VALUES
        ('P1','P1',2,'Patio','Occupied'),
        ('P2','P2',2,'Patio','Available'),
        ('P3','P3',4,'Patio','Available'),
        ('B1','B1',2,'Bar','Occupied'),
        ('B2','B2',2,'Bar','Available'),
        ('M1','M1',4,'Main Floor','Occupied'),
        ('M2','M2',4,'Main Floor','Reserved'),
        ('M3','M3',6,'Main Floor','Reserved'),
        ('M6','M6',8,'Main Floor','Reserved')
      `);
    }

    const reservationCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM reservations');
    if ((reservationCount.rows[0]?.count ?? 0) === 0) {
      await this.pool.query(`
        INSERT INTO reservations (id, guest_name, party_size, reservation_time, table_id, status, email, phone, reminder_sent) VALUES
        ('r1','Sharma',2,'19:30','M6','Reserved','sharma@example.com','555-0123',FALSE),
        ('r2','Verma',4,'20:00','M2','Reserved','verma@example.com','555-0456',FALSE)
      `);
    }

    const waitlistCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM waitlist');
    if ((waitlistCount.rows[0]?.count ?? 0) === 0) {
      await this.pool.query(`
        INSERT INTO waitlist (id, guest_name, party_size, email, phone, position, quoted_wait_minutes, status) VALUES
        ('w1','Kapoor Party',3,'kapoor@example.com','555-0987',1,15,'Waiting'),
        ('w2','Reddy Group',5,'reddy@example.com','555-0765',2,25,'Notified')
      `);
    }
  }

  async getSnapshot() {
    const tables = await this.pool.query(
      'SELECT id, table_number AS "tableNumber", capacity, zone, status FROM tables ORDER BY table_number'
    );
    const reservations = await this.pool.query(
      'SELECT id, guest_name AS "guestName", party_size AS "partySize", reservation_time AS time, table_id AS "tableId", status, email, phone, reminder_sent AS "reminderSent" FROM reservations ORDER BY reservation_time DESC'
    );
    const waitlist = await this.pool.query(
      'SELECT id, guest_name AS "guestName", party_size AS "partySize", email, phone, position, quoted_wait_minutes AS "quotedWaitMinutes", status, preferred_table_id AS "preferredTableId" FROM waitlist ORDER BY position'
    );
    const notifications = await this.pool.query(
      'SELECT id, type, recipient, content, status, created_at AS "createdAt" FROM notifications ORDER BY created_at DESC'
    );

    return {
      tables: tables.rows as TableItem[],
      reservations: reservations.rows as ReservationItem[],
      waitlist: waitlist.rows as WaitlistItem[],
      notifications: notifications.rows as NotificationItem[],
      stats: {
        occupiedTables: tables.rows.filter((t: TableItem) => t.status === 'Occupied').length,
        reservedTables: tables.rows.filter((t: TableItem) => t.status === 'Reserved').length,
        pendingWaitlist: waitlist.rows.filter((w: WaitlistItem) => w.status === 'Waiting').length,
        occupancyRate: Math.round(
          (tables.rows.filter((t: TableItem) => t.status === 'Occupied').length / tables.rows.length) * 100
        ),
      },
    };
  }

  async getTables() {
    const result = await this.pool.query(
      'SELECT id, table_number AS "tableNumber", capacity, zone, status FROM tables ORDER BY table_number'
    );
    return result.rows as TableItem[];
  }

  async getAllTableWatches(): Promise<Array<{ tableId: string; tableNumber: string; waitingCount: number; notifiedCount: number }>> {
    const result = await this.pool.query(`
      SELECT tw.table_id AS "tableId", t.table_number AS "tableNumber",
             COUNT(*) FILTER (WHERE tw.status = 'Waiting') AS "waitingCount",
             COUNT(*) FILTER (WHERE tw.status = 'Notified') AS "notifiedCount"
      FROM table_watch tw
      JOIN tables t ON t.id = tw.table_id
      WHERE tw.status IN ('Waiting', 'Notified')
      GROUP BY tw.table_id, t.table_number
    `);
    return result.rows.map((r) => ({
      tableId: r.tableId,
      tableNumber: r.tableNumber,
      waitingCount: Number(r.waitingCount),
      notifiedCount: Number(r.notifiedCount),
    }));
  }

  async getOrders(): Promise<Array<{
    id: string; guestName: string; email: string; tableNumber: string;
    partySize: number; totalAmount: number; status: string; paymentMethod: string; createdAt: string;
    items: Array<{ dishName: string; quantity: number; unitPrice: number }>;
  }>> {
    const ordersResult = await this.pool.query(`
      SELECT id, guest_name AS "guestName", email, table_number AS "tableNumber",
             party_size AS "partySize", total_amount::float AS "totalAmount",
             status, payment_method AS "paymentMethod", created_at AS "createdAt"
      FROM orders ORDER BY created_at DESC
    `);
    const itemsResult = await this.pool.query(`
      SELECT order_id AS "orderId", dish_name AS "dishName", quantity, unit_price::float AS "unitPrice"
      FROM order_items ORDER BY order_id
    `);
    const itemsByOrder = new Map<string, Array<{ dishName: string; quantity: number; unitPrice: number }>>();
    for (const item of itemsResult.rows) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push({ dishName: item.dishName, quantity: item.quantity, unitPrice: item.unitPrice });
    }
    return ordersResult.rows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));
  }

  async getDishStats(): Promise<Array<{ dishName: string; totalOrdered: number; revenue: number }>> {
    const result = await this.pool.query(`
      SELECT dish_name AS "dishName",
             SUM(quantity)::int AS "totalOrdered",
             SUM(quantity * unit_price)::float AS "revenue"
      FROM order_items
      GROUP BY dish_name
      ORDER BY "totalOrdered" DESC
    `);
    return result.rows;
  }

  async getDishes(): Promise<DishItem[]> {
    const result = await this.pool.query(
      'SELECT id, name, description, price::float AS price, category, available FROM dishes WHERE available = TRUE ORDER BY category, name'
    );
    return result.rows as DishItem[];
  }

  async createOrder(data: {
    guestName: string;
    email: string;
    tableId: string;
    tableNumber: string;
    partySize: number;
    items: Array<{ dishId: string; dishName: string; quantity: number; unitPrice: number }>;
    paymentMethod: string;
  }): Promise<OrderRecord> {
    const orderId = `ord${Date.now()}`;
    const createdAt = new Date().toISOString();
    const totalAmount = data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    await this.pool.query(
      'INSERT INTO orders (id, guest_name, email, table_id, table_number, party_size, total_amount, status, payment_method, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [orderId, data.guestName, data.email, data.tableId, data.tableNumber, data.partySize, totalAmount, 'confirmed', data.paymentMethod, createdAt]
    );

    for (const item of data.items) {
      await this.pool.query(
        'INSERT INTO order_items (id, order_id, dish_id, dish_name, quantity, unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [`oi${Date.now()}-${item.dishId}`, orderId, item.dishId, item.dishName, item.quantity, item.unitPrice]
      );
    }

    // Mark table as Reserved when an order is placed
    await this.pool.query('UPDATE tables SET status = $1 WHERE id = $2', ['Reserved', data.tableId]);

    // Send confirmation email
    const itemsSummary = data.items
      .map((i) => `  - ${i.dishName} x${i.quantity}  ${(i.unitPrice * i.quantity).toFixed(2)}`)
      .join('\n');
    const content = renderRestaurantMailContent({
      guestName: data.guestName,
      action: 'order_confirmation',
      tableNumber: data.tableNumber,
      orderTotal: `${totalAmount.toFixed(2)}`,
      orderItems: itemsSummary,
      orderId,
    });

    if (data.email) {
      const result = await sendNotification({
        type: 'mail',
        recipient: data.email,
        content,
        subject: mailSubject('order_confirmation'),
      });

      await this.pool.query(
        'INSERT INTO notifications (id, type, recipient, content, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          `n${Date.now()}`,
          'mail',
          data.email,
          content,
          result.ok ? 'sent' : `failed:${result.error ?? 'unknown'}`,
          createdAt,
        ]
      );
    }

    return {
      id: orderId,
      guestName: data.guestName,
      email: data.email,
      tableId: data.tableId,
      tableNumber: data.tableNumber,
      partySize: data.partySize,
      totalAmount,
      status: 'confirmed',
      paymentMethod: data.paymentMethod,
      createdAt,
      items: data.items,
    };
  }

  async updateTableStatus(tableId: string, status: TableStatus): Promise<{ table: TableItem | null; notifiedCount: number }> {
    const result = await this.pool.query(
      'UPDATE tables SET status = $1 WHERE id = $2 RETURNING id, table_number AS "tableNumber", capacity, zone, status',
      [status, tableId]
    );
    const table = result.rows[0] ?? null;

    let notifiedCount = 0;
    if (table && status === 'Available') {
      notifiedCount = await this.notifyTableWatchers(tableId, table.tableNumber);
    }

    return { table, notifiedCount };
  }

  async createReservation(data: {
    guestName: string;
    partySize: number;
    time: string;
    tableId: string;
    email: string;
    phone: string;
  }) {
    const reservationId = `r${Date.now()}`;
    await this.pool.query(
      'INSERT INTO reservations (id, guest_name, party_size, reservation_time, table_id, status, email, phone, reminder_sent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [reservationId, data.guestName, data.partySize, data.time, data.tableId, 'Reserved', data.email, data.phone, false]
    );
    return { id: reservationId, ...data, status: 'Reserved' as const, reminderSent: false };
  }

  async createWaitlistEntry(data: {
    guestName: string;
    partySize: number;
    email: string;
    phone: string;
    preferredTableId?: string;
  }) {
    const query = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM waitlist WHERE status IN ($1, $2)',
      ['Waiting', 'Notified']
    );
    const position = (query.rows[0]?.count ?? 0) + 1;
    const waitlistId = `w${Date.now()}`;

    await this.pool.query(
      'INSERT INTO waitlist (id, guest_name, party_size, email, phone, position, quoted_wait_minutes, status, preferred_table_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [waitlistId, data.guestName, data.partySize, data.email, data.phone, position, 10 + (position - 1) * 5, 'Waiting', data.preferredTableId ?? '']
    );

    return {
      id: waitlistId,
      ...data,
      position,
      quotedWaitMinutes: 10 + (position - 1) * 5,
      status: 'Waiting' as const,
    };
  }

  async createTableWatch(data: {
    userId: string;
    tableId: string;
    email: string;
    guestName: string;
    partySize: number;
  }) {
    const tableResult = await this.pool.query(
      'SELECT id, table_number AS "tableNumber", capacity, zone, status FROM tables WHERE id = $1',
      [data.tableId]
    );
    const table = tableResult.rows[0] as TableItem | undefined;
    if (!table) {
      throw new Error('Table not found');
    }

    if (data.partySize > table.capacity) {
      throw new Error(`Party size exceeds table capacity (${table.capacity})`);
    }

    const existing = await this.pool.query(
      'SELECT id FROM table_watch WHERE user_id = $1 AND table_id = $2 AND status = $3',
      [data.userId, data.tableId, 'Waiting']
    );
    if (existing.rows.length > 0) {
      throw new Error('You are already watching this table');
    }

    const watchId = `tw${Date.now()}`;
    const createdAt = new Date().toISOString();

    await this.pool.query(
      'INSERT INTO table_watch (id, user_id, table_id, email, guest_name, party_size, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [watchId, data.userId, data.tableId, data.email, data.guestName, data.partySize, 'Waiting', createdAt]
    );

    if (table.status === 'Available') {
      await this.notifyTableWatchers(data.tableId, table.tableNumber);
    }

    return {
      id: watchId,
      userId: data.userId,
      tableId: data.tableId,
      email: data.email,
      guestName: data.guestName,
      partySize: data.partySize,
      status: table.status === 'Available' ? ('Notified' as const) : ('Waiting' as const),
      createdAt,
      table,
    };
  }

  async getTableWatchesForUser(userId: string) {
    const result = await this.pool.query(
      `SELECT tw.id, tw.user_id AS "userId", tw.table_id AS "tableId", tw.email, tw.guest_name AS "guestName",
              tw.party_size AS "partySize", tw.status, tw.created_at AS "createdAt",
              t.table_number AS "tableNumber", t.capacity, t.zone, t.status AS "tableStatus"
       FROM table_watch tw
       JOIN tables t ON t.id = tw.table_id
       WHERE tw.user_id = $1 AND tw.status IN ('Waiting', 'Notified')
       ORDER BY tw.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async notifyTableWatchers(tableId: string, tableNumber?: string) {
    const watchers = await this.pool.query(
      `SELECT id, user_id AS "userId", table_id AS "tableId", email, guest_name AS "guestName",
              party_size AS "partySize", status, created_at AS "createdAt"
       FROM table_watch
       WHERE table_id = $1 AND status = 'Waiting'`,
      [tableId]
    );

    if (watchers.rows.length === 0) return 0;

    const resolvedTableNumber =
      tableNumber ??
      (
        await this.pool.query('SELECT table_number FROM tables WHERE id = $1', [tableId])
      ).rows[0]?.table_number ??
      tableId;

    let notifiedCount = 0;

    for (const watch of watchers.rows as TableWatchItem[]) {
      const content = renderRestaurantMailContent({
        guestName: watch.guestName,
        action: 'table_available',
        tableNumber: resolvedTableNumber,
      });

      const result = await sendNotification({
        type: 'mail',
        recipient: watch.email,
        content,
      });

      await this.pool.query(
        'INSERT INTO notifications (id, type, recipient, content, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          `n${Date.now()}-${watch.id}`,
          'mail',
          watch.email,
          content,
          result.ok ? 'sent' : `failed:${result.error ?? 'unknown'}`,
          new Date().toISOString(),
        ]
      );

      if (result.ok) {
        await this.pool.query('UPDATE table_watch SET status = $1 WHERE id = $2', ['Notified', watch.id]);
        notifiedCount += 1;
      }
    }

    return notifiedCount;
  }

  async notifyWaitlistEntry(id: string) {
    await this.pool.query('UPDATE waitlist SET status = $1 WHERE id = $2', ['Notified', id]);

    const waitlistResult = await this.pool.query(
      'SELECT id, guest_name AS "guestName", party_size AS "partySize", email, phone, position, quoted_wait_minutes AS "quotedWaitMinutes", status FROM waitlist WHERE id = $1',
      [id]
    );
    const entry = waitlistResult.rows[0] as WaitlistItem | undefined;

    if (!entry) return null;

    const notificationId = `n${Date.now()}`;
    const content = renderRestaurantMailContent({
      guestName: entry.guestName,
      action: 'waitlist_notified',
    });

    // Send by email when available; otherwise fall back to WhatsApp.
    const hasEmail = Boolean(entry.email && entry.email.trim());

    const result = hasEmail
      ? await sendNotification({
          type: 'mail',
          recipient: entry.email,
          content,
        })
      : await sendNotification({
          type: 'whatsapp',
          recipient: entry.phone,
          content,
        });

    await this.pool.query(
      'INSERT INTO notifications (id, type, recipient, content, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        notificationId,
        hasEmail ? 'mail' : 'whatsapp',
        hasEmail ? entry.email : entry.phone,
        content,
        result.ok ? 'sent' : `failed:${result.error ?? 'unknown'}`,
        new Date().toISOString(),
      ]
    );

    return entry;
  }

  async assignWaitlistEntry(id: string) {
    const availableTable = await this.pool.query(
      'SELECT id, table_number AS "tableNumber", capacity, zone, status FROM tables WHERE status = $1 ORDER BY id LIMIT 1',
      ['Available']
    );
    if ((availableTable.rows[0]?.id ?? null) == null) return null;

    const table = availableTable.rows[0];

    await this.pool.query('UPDATE waitlist SET status = $1, position = $2 WHERE id = $3', ['Seated', 0, id]);
    await this.pool.query('UPDATE tables SET status = $1 WHERE id = $2', ['Occupied', table.id]);

    await this.pool.query(
      `UPDATE waitlist 
       SET position = sub.new_position, quoted_wait_minutes = sub.new_wait
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS new_position,
                10 + (ROW_NUMBER() OVER (ORDER BY position) - 1) * 5 AS new_wait
         FROM waitlist
         WHERE status IN ($1, $2)
       ) sub
       WHERE waitlist.id = sub.id`,
      ['Waiting', 'Notified']
    );

    const waitlistEntry = await this.pool.query(
      'SELECT id, guest_name AS "guestName", party_size AS "partySize", email, phone, position, quoted_wait_minutes AS "quotedWaitMinutes", status FROM waitlist WHERE id = $1',
      [id]
    );

    return { waitlistEntry: waitlistEntry.rows[0] ?? null, table };
  }

  async markReservationNoShow(id: string) {
    await this.pool.query('UPDATE reservations SET status = $1 WHERE id = $2', ['No-show', id]);

    return (
      await this.pool.query(
        'SELECT id, guest_name AS "guestName", party_size AS "partySize", reservation_time AS time, table_id AS "tableId", status, email, phone, reminder_sent AS "reminderSent" FROM reservations WHERE id = $1',
        [id]
      )
    ).rows[0] ?? null;
  }

  async sendReminders() {
    const pending = await this.pool.query(
      'SELECT id, guest_name AS "guestName", party_size AS "partySize", reservation_time AS time, table_id AS "tableId", status, COALESCE(email, \'\') AS email, phone, reminder_sent AS "reminderSent" FROM reservations WHERE status = $1 AND reminder_sent = FALSE',
      ['Reserved']
    );

    for (const reservation of pending.rows as ReservationItem[]) {
      const content = renderRestaurantMailContent({
        guestName: reservation.guestName,
        action: 'reservation_reminder',
        time: reservation.time,
      });

      // Send via mail when possible; fall back to WhatsApp if mail fails or email is empty
      let finalResult = await sendNotification({
        type: 'mail',
        recipient: reservation.email,
        content,
      });

      if ((!finalResult.ok || !reservation.email) && reservation.phone) {
        finalResult = await sendNotification({
          type: 'whatsapp',
          recipient: reservation.phone,
          content,
        });
      }


      await this.pool.query(
        'INSERT INTO notifications (id, type, recipient, content, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          `n${Date.now()}-${reservation.id}`,
          finalResult.ok ? 'mail' : 'whatsapp',
          finalResult.ok ? reservation.email : reservation.phone,
          content,
          finalResult.ok ? 'sent' : `failed:${finalResult.error ?? 'unknown'}`,
          new Date().toISOString(),
        ]
      );

      if (finalResult.ok) {
        await this.pool.query('UPDATE reservations SET reminder_sent = TRUE WHERE id = $1', [reservation.id]);
      }
    }

    return pending.rows.length;
  }
}
