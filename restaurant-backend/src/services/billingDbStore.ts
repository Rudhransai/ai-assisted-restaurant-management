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

      deducted = await this.deductInventory(client, invoice.orderId, invoice.invoiceNumber, paidAt);

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

  /**
   * Subtract the ingredients used by every item on the order, and log each subtraction
   * as a stock entry so the inventory reports still add up.
   *
   * Dishes with no recipe are skipped and reported — that is a data gap, not an error,
   * and it must not block a payment that has already been taken.
   */
  private async deductInventory(client: any, orderId: string, invoiceNumber: string, at: string) {
    const itemsResult = await client.query(
      'SELECT dish_id AS "dishId", dish_name AS "dishName", quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );

    const deducted: Array<{ ingredientName: string; quantity: number; unit: string }> = [];

    for (const item of itemsResult.rows) {
      const recipeResult = await client.query(
        `SELECT di.ingredient_id AS "ingredientId", di.quantity_per_serving::float AS "perServing",
                i.name AS "ingredientName", i.unit
           FROM dish_ingredients di
           JOIN ingredients i ON i.id = di.ingredient_id
          WHERE di.dish_id = $1`,
        [item.dishId]
      );

      if (recipeResult.rows.length === 0) {
        console.warn(`[Billing] No recipe for dish "${item.dishName}" — inventory not deducted.`);
        continue;
      }

      for (const line of recipeResult.rows) {
        const used = Number(line.perServing) * Number(item.quantity);
        if (!used) continue;

        await client.query(
          'UPDATE ingredients SET current_stock = GREATEST(current_stock - $1, 0) WHERE id = $2',
          [used, line.ingredientId]
        );

        await client.query(
          `INSERT INTO stock_entries (id, ingredient_id, ingredient_name, entry_type, quantity, date, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            `se_${Date.now()}_${line.ingredientId}`,
            line.ingredientId,
            line.ingredientName,
            'consumption',
            used,
            at.slice(0, 10),
            `Auto-deducted for ${invoiceNumber}`,
          ]
        );

        deducted.push({ ingredientName: line.ingredientName, quantity: used, unit: line.unit });
      }
    }

    return deducted;
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
