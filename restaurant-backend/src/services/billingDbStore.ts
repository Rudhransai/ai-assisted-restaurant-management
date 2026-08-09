import crypto from 'crypto';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import { sendNotification } from '../integrations/notificationSender';
import { renderRestaurantMailContent, mailSubject } from '../integrations/mailTemplate';

/**
 * Billing and payments.
 *
 *   Order -> Invoice (pending_payment) -> Payment request (QR + link)
 *         -> Customer pays on the mock gateway -> Webhook -> Invoice paid
 *         -> Payment saved, inventory deducted, receipt sent
 *
 * The gateway is deliberately fake. Swapping in Razorpay or Stripe later means changing
 * only createPaymentRequest() and the signature check in verifyWebhookSignature() — the
 * rest of the flow already matches how real providers work.
 */

export type InvoiceStatus = 'pending_payment' | 'paid' | 'cancelled';

export interface InvoiceRecord {
  id: string;
  orderId: string;
  invoiceNumber: string;
  guestName: string;
  email: string;
  phone: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
  paidAt: string | null;
}

export class BillingDbStore {
  constructor(private readonly pool: Pool) {}

  private get webhookSecret(): string {
    return process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret-change-me';
  }

  private get publicBaseUrl(): string {
    return (process.env.PUBLIC_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        guest_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending_payment',
        payment_token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        paid_at TEXT
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        method TEXT NOT NULL DEFAULT 'upi',
        provider_reference TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'success',
        created_at TEXT NOT NULL
      )
    `);

    /**
     * Recipes: how much of each ingredient one serving of a dish uses.
     * Without this table "deduct inventory on payment" is impossible — the system has no
     * way to know that one biryani consumes 200g of rice.
     */
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dish_ingredients (
        id TEXT PRIMARY KEY,
        dish_id TEXT NOT NULL,
        ingredient_id TEXT NOT NULL,
        quantity_per_serving NUMERIC(10,3) NOT NULL DEFAULT 0,
        UNIQUE (dish_id, ingredient_id)
      )
    `);

    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices (order_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id)');

    await this.seedRecipes();
  }

  /**
   * Give every seeded dish a recipe so order-time inventory deduction works out of the
   * box. A dish that already has ANY recipe lines is left completely alone — the
   * manager's own entries always win; only dishes with no recipe at all are filled in.
   * Ingredients are matched by name and created (with sensible stock levels) when
   * missing.
   */
  private async seedRecipes() {
    const covered = await this.pool.query('SELECT DISTINCT dish_id FROM dish_ingredients');
    const dishesWithRecipes = new Set<string>(covered.rows.map((r: any) => r.dish_id));

    // name -> [unit, currentStock, minimumStock, costPerUnit] for ingredients we may need to create
    const ingredientDefaults: Record<string, [string, number, number, number]> = {
      'Rice': ['kg', 50, 10, 60], 'Chicken': ['kg', 30, 8, 200], 'Tomato': ['kg', 15, 5, 40],
      'Onion': ['kg', 20, 5, 30], 'Oil': ['L', 10, 3, 120], 'Eggs': ['pieces', 100, 20, 8],
      'Salt': ['kg', 5, 1, 20], 'Garlic': ['kg', 3, 1, 80],
      'Flour': ['kg', 40, 8, 45], 'Bread': ['pieces', 60, 15, 12], 'Mozzarella': ['kg', 12, 3, 450],
      'Pasta': ['kg', 20, 5, 90], 'Butter': ['kg', 10, 2, 500], 'Milk': ['L', 30, 8, 60],
      'Sugar': ['kg', 15, 4, 45], 'Potato': ['kg', 40, 10, 35], 'Fish': ['kg', 15, 4, 350],
      'Chocolate': ['kg', 8, 2, 400], 'Cream': ['L', 8, 2, 180], 'Lettuce': ['kg', 10, 3, 70],
      'Lemon': ['pieces', 80, 20, 5], 'Mixed Vegetables': ['kg', 25, 6, 50],
      'Tea Leaves': ['kg', 3, 1, 300], 'Fruit': ['kg', 20, 5, 80], 'Wine': ['L', 12, 3, 600],
      'Ice Cream': ['L', 15, 4, 200], 'Cheese': ['kg', 10, 3, 400],
    };

    // dish name -> [ingredient name, quantity per serving]
    const recipes: Record<string, Array<[string, number]>> = {
      'Soup of the Day': [['Mixed Vegetables', 0.15], ['Onion', 0.05], ['Garlic', 0.01], ['Oil', 0.02], ['Salt', 0.005]],
      'Garlic Bread': [['Bread', 2], ['Butter', 0.02], ['Garlic', 0.015]],
      'Bruschetta': [['Bread', 2], ['Tomato', 0.1], ['Oil', 0.015], ['Garlic', 0.005]],
      'Caesar Salad': [['Lettuce', 0.15], ['Cheese', 0.03], ['Bread', 1], ['Eggs', 1], ['Oil', 0.02]],
      'Margherita Pizza': [['Flour', 0.25], ['Mozzarella', 0.15], ['Tomato', 0.12], ['Oil', 0.02]],
      'Pasta Carbonara': [['Pasta', 0.12], ['Eggs', 2], ['Cheese', 0.04], ['Oil', 0.01]],
      'Grilled Chicken': [['Chicken', 0.25], ['Mixed Vegetables', 0.12], ['Lemon', 1], ['Oil', 0.02], ['Salt', 0.005]],
      'Veg Burger': [['Bread', 1], ['Lettuce', 0.03], ['Tomato', 0.05], ['Mixed Vegetables', 0.1], ['Oil', 0.02]],
      'Fish & Chips': [['Fish', 0.2], ['Potato', 0.25], ['Flour', 0.05], ['Oil', 0.1]],
      'Chocolate Lava Cake': [['Chocolate', 0.08], ['Flour', 0.05], ['Eggs', 1], ['Butter', 0.03], ['Sugar', 0.04]],
      'Ice Cream Sundae': [['Ice Cream', 0.2], ['Chocolate', 0.03], ['Cream', 0.05]],
      'Cheesecake': [['Cheese', 0.1], ['Sugar', 0.05], ['Butter', 0.03], ['Flour', 0.03], ['Eggs', 1]],
      'Lemonade': [['Lemon', 2], ['Sugar', 0.03]],
      'Masala Chai': [['Tea Leaves', 0.005], ['Milk', 0.15], ['Sugar', 0.02]],
      'Fresh Juice': [['Fruit', 0.3]],
      'House Wine (glass)': [['Wine', 0.15]],
    };

    const dishRows = await this.pool.query('SELECT id, name FROM dishes');
    const dishByName = new Map<string, string>(dishRows.rows.map((r: any) => [r.name, r.id]));

    const ingRows = await this.pool.query('SELECT id, name FROM ingredients');
    const ingByName = new Map<string, string>(ingRows.rows.map((r: any) => [r.name, r.id]));

    // Only ingredients needed by dishes we are actually going to fill in.
    const dishesToSeed = Object.entries(recipes).filter(([dishName]) => {
      const dishId = dishByName.get(dishName);
      return dishId !== undefined && !dishesWithRecipes.has(dishId);
    });
    if (dishesToSeed.length === 0) return;

    let created = 0;
    let idSeq = Date.now();
    for (const [, lines] of dishesToSeed) {
      for (const [ingName] of lines) {
        if (ingByName.has(ingName)) continue;
        const [unit, stock, minimum, cost] = ingredientDefaults[ingName] ?? ['kg', 10, 2, 50];
        const newId = `ing${idSeq++}`;
        await this.pool.query(
          'INSERT INTO ingredients (id, name, unit, current_stock, minimum_stock, cost_per_unit, vendor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [newId, ingName, unit, stock, minimum, cost, '']
        );
        await this.pool.query(
          `INSERT INTO stock_entries (id, ingredient_id, ingredient_name, entry_type, quantity, date, notes)
           VALUES ($1,$2,$3,'opening',$4,$5,'Initial stock (recipe seed)')`,
          [`se_seed_${idSeq}`, newId, ingName, stock, new Date().toISOString().slice(0, 10)]
        );
        ingByName.set(ingName, newId);
        created++;
      }
    }

    let seeded = 0;
    for (const [dishName, lines] of dishesToSeed) {
      const dishId = dishByName.get(dishName);
      if (!dishId) continue;
      for (const [ingName, qty] of lines) {
        const ingredientId = ingByName.get(ingName);
        if (!ingredientId) continue;
        await this.pool.query(
          `INSERT INTO dish_ingredients (id, dish_id, ingredient_id, quantity_per_serving)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (dish_id, ingredient_id) DO NOTHING`,
          [`di${idSeq++}`, dishId, ingredientId, qty]
        );
        seeded++;
      }
    }

    if (seeded > 0) {
      console.log(`[Billing] Seeded ${seeded} recipe line(s) across ${dishesToSeed.length} dishes (${created} new ingredient(s)).`);
    }
  }

  // ── Recipes ────────────────────────────────────────────────────────────────

  async listRecipes() {
    const result = await this.pool.query(`
      SELECT di.id, di.dish_id AS "dishId", d.name AS "dishName",
             di.ingredient_id AS "ingredientId", i.name AS "ingredientName",
             i.unit, di.quantity_per_serving::float AS "quantityPerServing"
        FROM dish_ingredients di
        LEFT JOIN dishes d ON d.id = di.dish_id
        LEFT JOIN ingredients i ON i.id = di.ingredient_id
       ORDER BY d.name, i.name
    `);
    return result.rows;
  }

  async setRecipeLine(data: { dishId: string; ingredientId: string; quantityPerServing: number }) {
    const id = `ri_${data.dishId}_${data.ingredientId}`;
    await this.pool.query(
      `INSERT INTO dish_ingredients (id, dish_id, ingredient_id, quantity_per_serving)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (dish_id, ingredient_id)
       DO UPDATE SET quantity_per_serving = EXCLUDED.quantity_per_serving`,
      [id, data.dishId, data.ingredientId, data.quantityPerServing]
    );
    return { id, ...data };
  }

  async deleteRecipeLine(id: string) {
    const result = await this.pool.query('DELETE FROM dish_ingredients WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(): Promise<InvoiceRecord[]> {
    const result = await this.pool.query(`
      SELECT id, order_id AS "orderId", invoice_number AS "invoiceNumber",
             guest_name AS "guestName", email, phone, amount::float AS amount,
             status, created_at AS "createdAt", paid_at AS "paidAt"
        FROM invoices
       ORDER BY created_at DESC
    `);
    return result.rows;
  }

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const result = await this.pool.query(
      `SELECT id, order_id AS "orderId", invoice_number AS "invoiceNumber",
              guest_name AS "guestName", email, phone, amount::float AS amount,
              status, created_at AS "createdAt", paid_at AS "paidAt"
         FROM invoices WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Turn an existing order into an invoice awaiting payment.
   *
   * One invoice per order: calling this twice returns the invoice already created, so a
   * double click in the dashboard cannot produce two bills for the same table.
   */
  async createInvoice(orderId: string, contact?: { email?: string; phone?: string }) {
    const existing = await this.pool.query('SELECT id FROM invoices WHERE order_id = $1', [orderId]);
    if (existing.rows[0]) {
      return this.getInvoice(existing.rows[0].id);
    }

    const orderResult = await this.pool.query(
      `SELECT id, guest_name AS "guestName", email, total_amount::float AS "totalAmount"
         FROM orders WHERE id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const now = new Date();
    const invoiceId = `inv_${now.getTime()}`;
    // Human-readable, sequential-looking number for the printed bill.
    const countResult = await this.pool.query('SELECT COUNT(*)::int AS c FROM invoices');
    const invoiceNumber = `INV-${now.getFullYear()}-${String((countResult.rows[0]?.c ?? 0) + 1001)}`;

    // Random, unguessable token — the payment link is public, so the id must not be.
    const paymentToken = crypto.randomBytes(24).toString('hex');

    await this.pool.query(
      `INSERT INTO invoices (id, order_id, invoice_number, guest_name, email, phone, amount, status, payment_token, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        invoiceId,
        orderId,
        invoiceNumber,
        order.guestName ?? '',
        contact?.email ?? order.email ?? '',
        contact?.phone ?? '',
        order.totalAmount ?? 0,
        'pending_payment',
        paymentToken,
        now.toISOString(),
      ]
    );

    return this.getInvoice(invoiceId);
  }

  /**
   * Build the payment link and a QR image for it.
   * The QR is returned as a data URL so the dashboard can show it with no extra request.
   */
  async createPaymentRequest(invoiceId: string) {
    const result = await this.pool.query(
      'SELECT payment_token, amount::float AS amount, status, invoice_number FROM invoices WHERE id = $1',
      [invoiceId]
    );
    const row = result.rows[0];
    if (!row) return null;

    if (row.status === 'paid') {
      return { alreadyPaid: true as const, invoiceNumber: row.invoice_number };
    }

    const paymentLink = `${this.publicBaseUrl}/pay/${row.payment_token}`;
    const qrDataUrl = await QRCode.toDataURL(paymentLink, { margin: 1, width: 320 });

    return {
      alreadyPaid: false as const,
      invoiceId,
      invoiceNumber: row.invoice_number,
      amount: row.amount,
      paymentLink,
      qrDataUrl,
    };
  }

  async getInvoiceByToken(token: string) {
    const result = await this.pool.query(
      `SELECT id, invoice_number AS "invoiceNumber", guest_name AS "guestName",
              amount::float AS amount, status
         FROM invoices WHERE payment_token = $1`,
      [token]
    );
    return result.rows[0] ?? null;
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /** Sign a webhook body the way a real provider would. Used by the mock gateway. */
  signWebhookBody(body: string): string {
    return crypto.createHmac('sha256', this.webhookSecret).update(body).digest('hex');
  }

  /**
   * Constant-time signature check. A plain `===` here would leak the secret through
   * response timing, which is exactly how webhook endpoints get forged.
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const expected = this.signWebhookBody(body);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature ?? '', 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Everything that happens once money has actually arrived.
   *
   * Runs inside one transaction: if inventory deduction fails, the invoice does not end up
   * marked paid with the stock untouched. The receipt is sent after the commit, because a
   * mail failure must not roll back a real payment.
   */
  async markInvoicePaid(args: {
    paymentToken: string;
    providerReference: string;
    method?: string;
  }) {
    const client = await this.pool.connect();
    let invoice: any = null;
    let deducted: Array<{ ingredientName: string; quantity: number; unit: string }> = [];

    try {
      await client.query('BEGIN');

      // Lock the row so two webhook deliveries can't both process the same payment.
      const invoiceResult = await client.query(
        `SELECT id, order_id AS "orderId", invoice_number AS "invoiceNumber",
                guest_name AS "guestName", email, phone, amount::float AS amount, status
           FROM invoices WHERE payment_token = $1 FOR UPDATE`,
        [args.paymentToken]
      );
      invoice = invoiceResult.rows[0];

      if (!invoice) {
        await client.query('ROLLBACK');
        return { ok: false as const, reason: 'not_found' as const };
      }

      // Providers retry webhooks. Paying twice must not deduct stock twice.
      if (invoice.status === 'paid') {
        await client.query('ROLLBACK');
        return { ok: true as const, alreadyProcessed: true as const, invoice };
      }

      const paidAt = new Date().toISOString();

      await client.query('UPDATE invoices SET status = $1, paid_at = $2 WHERE id = $3', [
        'paid',
        paidAt,
        invoice.id,
      ]);

      await client.query(
        `INSERT INTO payments (id, invoice_id, amount, method, provider_reference, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          `pay_${Date.now()}`,
          invoice.id,
          invoice.amount,
          args.method ?? 'upi',
          args.providerReference,
          'success',
          paidAt,
        ]
      );

      await client.query("UPDATE orders SET status = 'paid' WHERE id = $1", [invoice.orderId]);

      // Inventory is NOT deducted here. Stock is consumed when the order is placed
      // (RestaurantDbStore.createOrder) — the kitchen uses the ingredients long before
      // the bill is settled. Deducting again on payment would double-count.

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // Receipt goes out after the money is safely recorded.
    await this.sendReceipt(invoice, deducted).catch((err) =>
      console.error('[Billing] Receipt could not be sent', err)
    );

    return { ok: true as const, alreadyProcessed: false as const, invoice, deducted };
  }

  private async sendReceipt(
    invoice: any,
    deducted: Array<{ ingredientName: string; quantity: number; unit: string }>
  ) {
    const content = renderRestaurantMailContent({
      guestName: invoice.guestName,
      action: 'payment_receipt',
      orderId: invoice.invoiceNumber,
      orderTotal: Number(invoice.amount).toFixed(2),
    });

    const log = async (channel: 'mail' | 'whatsapp', recipient: string, ok: boolean, error?: string) => {
      await this.pool
        .query(
          'INSERT INTO notifications (id, type, recipient, content, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            `n${Date.now()}-${channel}-${invoice.id}`,
            channel,
            recipient,
            content,
            ok ? 'sent' : `failed:${error ?? 'unknown'}`,
            new Date().toISOString(),
          ]
        )
        .catch((err) => console.error('[Billing] Could not log receipt', err));
    };

    if (invoice.email) {
      const result = await sendNotification({
        type: 'mail',
        recipient: invoice.email,
        content,
        subject: mailSubject('payment_receipt'),
      });
      await log('mail', invoice.email, result.ok, result.error);
    }

    if (invoice.phone) {
      const result = await sendNotification({
        type: 'whatsapp',
        recipient: invoice.phone,
        content,
        template: {
          name: process.env.WHATSAPP_TEMPLATE_RECEIPT || 'payment_receipt',
          languageCode: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
          params: [invoice.guestName || 'Guest', invoice.invoiceNumber, Number(invoice.amount).toFixed(2)],
        },
      });
      await log('whatsapp', invoice.phone, result.ok, result.error);
    }

    if (deducted.length > 0) {
      console.log(`[Billing] ${invoice.invoiceNumber}: deducted ${deducted.length} ingredient line(s).`);
    }
  }
}
