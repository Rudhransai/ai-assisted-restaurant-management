import { Pool } from 'pg';

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  itemsSupplied: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  vendorId: string;
  vendorName?: string;
}

export interface StockEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  entryType: 'opening' | 'closing';
  quantity: number;
  date: string;
  notes: string;
}

export interface Purchase {
  id: string;
  vendorId: string;
  vendorName: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  cost: number;
  purchaseDate: string;
}

export interface WastageLog {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  reason: string;
  cost: number;
  date: string;
}

export interface InventoryAnalytics {
  totalInventoryValue: number;
  lowStockItems: Ingredient[];
  monthlyWastageCost: number;
  monthlyPurchaseCost: number;
  topConsumedIngredients: Array<{ name: string; consumption: number; unit: string }>;
  reorderAlerts: Ingredient[];
  stockMovement: Array<{ date: string; openingTotal: number; closingTotal: number }>;
  vendorPerformance: Array<{ vendorName: string; totalPurchases: number; totalCost: number }>;
}

export class InventoryDbStore {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        items_supplied TEXT NOT NULL DEFAULT ''
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        current_stock NUMERIC(10,3) NOT NULL DEFAULT 0,
        minimum_stock NUMERIC(10,3) NOT NULL DEFAULT 0,
        cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
        vendor_id TEXT NOT NULL DEFAULT ''
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stock_entries (
        id TEXT PRIMARY KEY,
        ingredient_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        quantity NUMERIC(10,3) NOT NULL,
        date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL DEFAULT '',
        vendor_name TEXT NOT NULL,
        ingredient_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        quantity NUMERIC(10,3) NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        cost NUMERIC(10,2) NOT NULL,
        purchase_date TEXT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wastage_logs (
        id TEXT PRIMARY KEY,
        ingredient_id TEXT NOT NULL,
        ingredient_name TEXT NOT NULL,
        quantity NUMERIC(10,3) NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        reason TEXT NOT NULL DEFAULT '',
        cost NUMERIC(10,2) NOT NULL DEFAULT 0,
        date TEXT NOT NULL
      )
    `);

    // Add ingredient_cost to dishes for contribution margin (if not exists)
    await this.pool.query(`
      ALTER TABLE dishes ADD COLUMN IF NOT EXISTS ingredient_cost NUMERIC(10,2) NOT NULL DEFAULT 0
    `);

    // Seed some sample data if empty
    const vendorCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM vendors');
    if ((vendorCount.rows[0]?.count ?? 0) === 0) {
      await this.pool.query(`
        INSERT INTO vendors (id, name, phone, email, items_supplied) VALUES
        ('v1', 'Fresh Farm', '9876543210', 'freshfarm@example.com', 'Chicken, Eggs, Milk'),
        ('v2', 'Green Grocers', '9876543211', 'green@example.com', 'Rice, Tomato, Onion, Garlic'),
        ('v3', 'Spice World', '9876543212', 'spice@example.com', 'Oil, Salt, Spices')
      `);
    }

    const ingCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM ingredients');
    if ((ingCount.rows[0]?.count ?? 0) === 0) {
      const today = new Date().toISOString().split('T')[0];
      await this.pool.query(`
        INSERT INTO ingredients (id, name, unit, current_stock, minimum_stock, cost_per_unit, vendor_id) VALUES
        ('i1', 'Rice', 'kg', 50, 10, 60, 'v2'),
        ('i2', 'Chicken', 'kg', 30, 8, 200, 'v1'),
        ('i3', 'Tomato', 'kg', 15, 5, 40, 'v2'),
        ('i4', 'Onion', 'kg', 20, 5, 30, 'v2'),
        ('i5', 'Oil', 'L', 10, 3, 120, 'v3'),
        ('i6', 'Eggs', 'pieces', 100, 20, 8, 'v1'),
        ('i7', 'Salt', 'kg', 5, 1, 20, 'v3'),
        ('i8', 'Garlic', 'kg', 3, 1, 80, 'v2')
      `);

      // Seed opening stock entries
      await this.pool.query(`
        INSERT INTO stock_entries (id, ingredient_id, ingredient_name, entry_type, quantity, date, notes) VALUES
        ('se1', 'i1', 'Rice', 'opening', 50, $1, 'Initial stock'),
        ('se2', 'i2', 'Chicken', 'opening', 30, $1, 'Initial stock'),
        ('se3', 'i3', 'Tomato', 'opening', 15, $1, 'Initial stock'),
        ('se4', 'i4', 'Onion', 'opening', 20, $1, 'Initial stock')
      `, [today]);

      // Seed a sample purchase
      await this.pool.query(`
        INSERT INTO purchases (id, vendor_id, vendor_name, ingredient_id, ingredient_name, quantity, unit, cost, purchase_date) VALUES
        ('p1', 'v1', 'Fresh Farm', 'i2', 'Chicken', 20, 'kg', 4000, $1),
        ('p2', 'v2', 'Green Grocers', 'i1', 'Rice', 25, 'kg', 1500, $1)
      `, [today]);

      // Seed a sample wastage
      await this.pool.query(`
        INSERT INTO wastage_logs (id, ingredient_id, ingredient_name, quantity, unit, reason, cost, date) VALUES
        ('w1', 'i3', 'Tomato', 3, 'kg', 'Rotten', 120, $1),
        ('w2', 'i1', 'Rice', 2, 'kg', 'Burnt', 120, $1)
      `, [today]);
    }

    // Update ingredient costs in dishes table for contribution margin
    await this.pool.query(`
      UPDATE dishes SET ingredient_cost = CASE
        WHEN id = 'd1' THEN 2.50
        WHEN id = 'd2' THEN 1.20
        WHEN id = 'd3' THEN 1.80
        WHEN id = 'd4' THEN 2.50
        WHEN id = 'd5' THEN 5.00
        WHEN id = 'd6' THEN 5.50
        WHEN id = 'd7' THEN 7.00
        WHEN id = 'd8' THEN 4.50
        WHEN id = 'd9' THEN 6.00
        WHEN id = 'd10' THEN 2.50
        WHEN id = 'd11' THEN 1.80
        WHEN id = 'd12' THEN 2.00
        WHEN id = 'd13' THEN 0.80
        WHEN id = 'd14' THEN 0.60
        WHEN id = 'd15' THEN 0.90
        WHEN id = 'd16' THEN 2.50
        ELSE ingredient_cost
      END
      WHERE ingredient_cost = 0
    `);
  }

  // ── Vendors ──────────────────────────────────────────────────────────────

  async getVendors(): Promise<Vendor[]> {
    const result = await this.pool.query(
      'SELECT id, name, phone, email, items_supplied AS "itemsSupplied" FROM vendors ORDER BY name'
    );
    return result.rows as Vendor[];
  }

  async addVendor(data: { name: string; phone: string; email: string; itemsSupplied: string }): Promise<Vendor> {
    const id = `v${Date.now()}`;
    await this.pool.query(
      'INSERT INTO vendors (id, name, phone, email, items_supplied) VALUES ($1, $2, $3, $4, $5)',
      [id, data.name, data.phone || '', data.email || '', data.itemsSupplied || '']
    );
    return { id, ...data };
  }

  // ── Ingredients ──────────────────────────────────────────────────────────

  async getIngredients(): Promise<Ingredient[]> {
    const result = await this.pool.query(`
      SELECT i.id, i.name, i.unit, i.current_stock::float AS "currentStock",
             i.minimum_stock::float AS "minimumStock", i.cost_per_unit::float AS "costPerUnit",
             i.vendor_id AS "vendorId", COALESCE(v.name, '') AS "vendorName"
      FROM ingredients i
      LEFT JOIN vendors v ON v.id = i.vendor_id
      ORDER BY i.name
    `);
    return result.rows as Ingredient[];
  }

  async addIngredient(data: {
    name: string; unit: string; currentStock: number;
    minimumStock: number; costPerUnit: number; vendorId: string;
  }): Promise<Ingredient> {
    const id = `i${Date.now()}`;
    await this.pool.query(
      'INSERT INTO ingredients (id, name, unit, current_stock, minimum_stock, cost_per_unit, vendor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, data.name, data.unit, data.currentStock, data.minimumStock, data.costPerUnit, data.vendorId || '']
    );
    return { id, ...data };
  }

  async updateIngredientStock(id: string, newStock: number): Promise<void> {
    await this.pool.query('UPDATE ingredients SET current_stock = $1 WHERE id = $2', [newStock, id]);
  }

  // ── Stock Entries (Opening / Closing) ─────────────────────────────────────

  async getStockEntries(): Promise<StockEntry[]> {
    const result = await this.pool.query(`
      SELECT id, ingredient_id AS "ingredientId", ingredient_name AS "ingredientName",
             entry_type AS "entryType", quantity::float AS quantity, date, notes
      FROM stock_entries ORDER BY date DESC, id DESC LIMIT 100
    `);
    return result.rows as StockEntry[];
  }

  async addStockEntry(data: {
    ingredientId: string; ingredientName: string;
    entryType: 'opening' | 'closing'; quantity: number; date: string; notes: string;
  }): Promise<StockEntry> {
    const id = `se${Date.now()}`;
    await this.pool.query(
      'INSERT INTO stock_entries (id, ingredient_id, ingredient_name, entry_type, quantity, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, data.ingredientId, data.ingredientName, data.entryType, data.quantity, data.date, data.notes || '']
    );
    // Update current stock based on entry type
    if (data.entryType === 'opening' || data.entryType === 'closing') {
      await this.pool.query('UPDATE ingredients SET current_stock = $1 WHERE id = $2', [data.quantity, data.ingredientId]);
    }
    return { id, ...data };
  }

  // ── Purchases ─────────────────────────────────────────────────────────────

  async getPurchases(): Promise<Purchase[]> {
    const result = await this.pool.query(`
      SELECT id, vendor_id AS "vendorId", vendor_name AS "vendorName",
             ingredient_id AS "ingredientId", ingredient_name AS "ingredientName",
             quantity::float AS quantity, unit, cost::float AS cost, purchase_date AS "purchaseDate"
      FROM purchases ORDER BY purchase_date DESC, id DESC LIMIT 200
    `);
    return result.rows as Purchase[];
  }

  async addPurchase(data: {
    vendorId: string; vendorName: string; ingredientId: string; ingredientName: string;
    quantity: number; unit: string; cost: number; purchaseDate: string;
  }): Promise<Purchase> {
    const id = `p${Date.now()}`;
    await this.pool.query(
      'INSERT INTO purchases (id, vendor_id, vendor_name, ingredient_id, ingredient_name, quantity, unit, cost, purchase_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, data.vendorId || '', data.vendorName, data.ingredientId, data.ingredientName, data.quantity, data.unit, data.cost, data.purchaseDate]
    );
    // Update current stock (add purchased quantity)
    await this.pool.query(
      'UPDATE ingredients SET current_stock = current_stock + $1 WHERE id = $2',
      [data.quantity, data.ingredientId]
    );
    return { id, ...data };
  }

  // ── Wastage ───────────────────────────────────────────────────────────────

  async getWastageLogs(): Promise<WastageLog[]> {
    const result = await this.pool.query(`
      SELECT id, ingredient_id AS "ingredientId", ingredient_name AS "ingredientName",
             quantity::float AS quantity, unit, reason, cost::float AS cost, date
      FROM wastage_logs ORDER BY date DESC, id DESC LIMIT 200
    `);
    return result.rows as WastageLog[];
  }

  async addWastage(data: {
    ingredientId: string; ingredientName: string;
    quantity: number; unit: string; reason: string; cost: number; date: string;
  }): Promise<WastageLog> {
    const id = `wl${Date.now()}`;
    await this.pool.query(
      'INSERT INTO wastage_logs (id, ingredient_id, ingredient_name, quantity, unit, reason, cost, date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, data.ingredientId, data.ingredientName, data.quantity, data.unit, data.reason || '', data.cost, data.date]
    );
    // Reduce current stock
    await this.pool.query(
      'UPDATE ingredients SET current_stock = GREATEST(0, current_stock - $1) WHERE id = $2',
      [data.quantity, data.ingredientId]
    );
    return { id, ...data };
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getInventoryAnalytics() {
    const ingredients = await this.getIngredients();

    const totalInventoryValue = ingredients.reduce(
      (sum, i) => sum + i.currentStock * i.costPerUnit, 0
    );

    const lowStockItems = ingredients.filter(i => i.currentStock < i.minimumStock);
    const reorderAlerts = lowStockItems;

    // Monthly wastage cost
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const wastageCostRes = await this.pool.query(
      'SELECT COALESCE(SUM(cost), 0)::float AS total FROM wastage_logs WHERE date >= $1',
      [monthStartStr]
    );
    const monthlyWastageCost = wastageCostRes.rows[0]?.total ?? 0;

    // Monthly purchase cost
    const purchaseCostRes = await this.pool.query(
      'SELECT COALESCE(SUM(cost), 0)::float AS total FROM purchases WHERE purchase_date >= $1',
      [monthStartStr]
    );
    const monthlyPurchaseCost = purchaseCostRes.rows[0]?.total ?? 0;

    // Top consumed (opening - closing per ingredient this month via stock entries)
    const consumptionRes = await this.pool.query(`
      SELECT ingredient_name AS name,
             COALESCE(SUM(CASE WHEN entry_type = 'opening' THEN quantity ELSE 0 END), 0)::float AS opening,
             COALESCE(SUM(CASE WHEN entry_type = 'closing' THEN quantity ELSE 0 END), 0)::float AS closing,
             (SELECT unit FROM ingredients WHERE name = ingredient_name LIMIT 1) AS unit
      FROM stock_entries
      WHERE date >= $1
      GROUP BY ingredient_name
      ORDER BY (SUM(CASE WHEN entry_type = 'opening' THEN quantity ELSE 0 END) -
                SUM(CASE WHEN entry_type = 'closing' THEN quantity ELSE 0 END)) DESC
      LIMIT 8
    `, [monthStartStr]);

    const topConsumedIngredients = consumptionRes.rows.map(r => ({
      name: r.name,
      consumption: Math.max(0, r.opening - r.closing),
      unit: r.unit ?? 'kg',
    }));

    // Vendor performance
    const vendorRes = await this.pool.query(`
      SELECT vendor_name AS "vendorName",
             COUNT(*)::int AS "totalPurchases",
             SUM(cost)::float AS "totalCost"
      FROM purchases
      GROUP BY vendor_name
      ORDER BY "totalCost" DESC
    `);

    // Stock movement last 7 days
    const stockMovementRes = await this.pool.query(`
      SELECT date,
             SUM(CASE WHEN entry_type = 'opening' THEN quantity ELSE 0 END)::float AS "openingTotal",
             SUM(CASE WHEN entry_type = 'closing' THEN quantity ELSE 0 END)::float AS "closingTotal"
      FROM stock_entries
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
    `);

    return {
      totalInventoryValue,
      lowStockItems,
      reorderAlerts,
      monthlyWastageCost,
      monthlyPurchaseCost,
      topConsumedIngredients,
      vendorPerformance: vendorRes.rows,
      stockMovement: stockMovementRes.rows.reverse(),
    };
  }

  // ── Sales Analytics (Module 3) ────────────────────────────────────────────

  async getSalesAnalytics() {
    // Total revenue and orders
    const totalsRes = await this.pool.query(`
      SELECT COUNT(*)::int AS "totalOrders",
             COALESCE(SUM(total_amount), 0)::float AS "totalRevenue",
             COALESCE(AVG(total_amount), 0)::float AS "avgBillValue"
      FROM orders
    `);
    const totals = totalsRes.rows[0] ?? { totalOrders: 0, totalRevenue: 0, avgBillValue: 0 };

    // Revenue by dish with contribution margin
    const dishRevenueRes = await this.pool.query(`
      SELECT oi.dish_name AS "dishName",
             SUM(oi.quantity)::int AS "totalOrdered",
             SUM(oi.quantity * oi.unit_price)::float AS revenue,
             COALESCE(MAX(d.price), MAX(oi.unit_price))::float AS price,
             COALESCE(MAX(d.ingredient_cost), 0)::float AS "ingredientCost",
             (COALESCE(MAX(d.price), MAX(oi.unit_price)) - COALESCE(MAX(d.ingredient_cost), 0))::float AS "contributionMargin"
      FROM order_items oi
      LEFT JOIN dishes d ON d.name = oi.dish_name
      GROUP BY oi.dish_name
      ORDER BY revenue DESC
    `);

    const dishRevenue = dishRevenueRes.rows;
    const topItems = dishRevenue.slice(0, 5);
    const lowItems = [...dishRevenue].reverse().slice(0, 5);

    // Meal period analysis (based on hour of order creation)
    const mealPeriodRes = await this.pool.query(`
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM created_at::timestamptz) BETWEEN 6 AND 10 THEN 'Breakfast'
          WHEN EXTRACT(HOUR FROM created_at::timestamptz) BETWEEN 11 AND 14 THEN 'Lunch'
          WHEN EXTRACT(HOUR FROM created_at::timestamptz) BETWEEN 15 AND 17 THEN 'Snacks'
          WHEN EXTRACT(HOUR FROM created_at::timestamptz) BETWEEN 18 AND 23 THEN 'Dinner'
          ELSE 'Other'
        END AS period,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_amount), 0)::float AS revenue,
        COALESCE(AVG(total_amount), 0)::float AS "avgBill"
      FROM orders
      GROUP BY period
      ORDER BY revenue DESC
    `);

    // Daily sales trend (last 30 days)
    const dailyTrendRes = await this.pool.query(`
      SELECT DATE(created_at::timestamptz) AS date,
             COUNT(*)::int AS orders,
             COALESCE(SUM(total_amount), 0)::float AS revenue
      FROM orders
      WHERE created_at::timestamptz >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at::timestamptz)
      ORDER BY date ASC
    `);

    // Revenue by table zone/area
    const zoneRevenueRes = await this.pool.query(`
      SELECT t.zone,
             COUNT(o.id)::int AS orders,
             COALESCE(SUM(o.total_amount), 0)::float AS revenue,
             COALESCE(AVG(o.total_amount), 0)::float AS "avgBill"
      FROM orders o
      JOIN tables t ON t.id = o.table_id
      GROUP BY t.zone
      ORDER BY revenue DESC
    `);

    // Reservation analytics
    const reservationAnalyticsRes = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Reserved')::int AS reserved,
        COUNT(*) FILTER (WHERE status = 'No-show')::int AS "noShow",
        COUNT(*) FILTER (WHERE status = 'Seated')::int AS seated,
        COALESCE(AVG(party_size), 0)::float AS "avgPartySize"
      FROM reservations
    `);

    // Peak reservation time
    const peakTimeRes = await this.pool.query(`
      SELECT reservation_time AS time, COUNT(*)::int AS count
      FROM reservations
      GROUP BY reservation_time
      ORDER BY count DESC
      LIMIT 1
    `);

    return {
      totals,
      dishRevenue,
      topItems,
      lowItems,
      mealPeriods: mealPeriodRes.rows,
      dailyTrend: dailyTrendRes.rows,
      zoneRevenue: zoneRevenueRes.rows,
      reservationAnalytics: reservationAnalyticsRes.rows[0] ?? {},
      peakTime: peakTimeRes.rows[0]?.time ?? 'N/A',
    };
  }
}
