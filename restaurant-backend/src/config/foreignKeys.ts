import { Pool } from 'pg';

/**
 * Foreign keys, applied after every store has created its tables.
 *
 * The tables were originally created without any constraints, so existing databases may
 * contain orphaned rows (an order_item whose order was seeded away, a reservation for a
 * table id typed by hand). Every constraint is therefore added NOT VALID: Postgres
 * enforces it for new writes but does not scan existing rows, so adding the constraint
 * can never stop the app from booting on a database with historic bad data.
 *
 * Columns that use '' as a "no reference" sentinel (ingredients.vendor_id,
 * purchases.vendor_id, waitlist.preferred_table_id) deliberately get NO constraint —
 * a foreign key would reject the sentinel and break normal inserts.
 */
const FOREIGN_KEYS: Array<{
  constraint: string;
  table: string;
  column: string;
  references: string;
  onDelete?: 'CASCADE';
}> = [
  { constraint: 'fk_reservations_table', table: 'reservations', column: 'table_id', references: 'tables(id)' },
  { constraint: 'fk_order_items_order', table: 'order_items', column: 'order_id', references: 'orders(id)', onDelete: 'CASCADE' },
  { constraint: 'fk_order_items_dish', table: 'order_items', column: 'dish_id', references: 'dishes(id)' },
  { constraint: 'fk_invoices_order', table: 'invoices', column: 'order_id', references: 'orders(id)' },
  { constraint: 'fk_payments_invoice', table: 'payments', column: 'invoice_id', references: 'invoices(id)', onDelete: 'CASCADE' },
  { constraint: 'fk_dish_ingredients_dish', table: 'dish_ingredients', column: 'dish_id', references: 'dishes(id)', onDelete: 'CASCADE' },
  { constraint: 'fk_dish_ingredients_ingredient', table: 'dish_ingredients', column: 'ingredient_id', references: 'ingredients(id)', onDelete: 'CASCADE' },
  { constraint: 'fk_stock_entries_ingredient', table: 'stock_entries', column: 'ingredient_id', references: 'ingredients(id)' },
  { constraint: 'fk_wastage_logs_ingredient', table: 'wastage_logs', column: 'ingredient_id', references: 'ingredients(id)' },
  { constraint: 'fk_table_watch_table', table: 'table_watch', column: 'table_id', references: 'tables(id)' },
  { constraint: 'fk_table_watch_user', table: 'table_watch', column: 'user_id', references: 'users(id)' },
];

export async function applyForeignKeys(pool: Pool): Promise<void> {
  for (const fk of FOREIGN_KEYS) {
    const existing = await pool.query('SELECT convalidated FROM pg_constraint WHERE conname = $1', [
      fk.constraint,
    ]);

    if (existing.rows.length === 0) {
      const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      try {
        await pool.query(
          `ALTER TABLE ${fk.table} ADD CONSTRAINT ${fk.constraint} FOREIGN KEY (${fk.column}) REFERENCES ${fk.references}${onDelete} NOT VALID`
        );
        console.log(`[DB] Added foreign key ${fk.constraint}`);
      } catch (error) {
        // A failed constraint is a data-quality warning, not a reason to refuse to serve.
        console.warn(`[DB] Could not add foreign key ${fk.constraint}:`, (error as Error).message);
        continue;
      }
    } else if (existing.rows[0].convalidated) {
      continue;
    }

    // Try to upgrade NOT VALID to fully validated. Succeeds when the existing rows are
    // clean; fails (harmlessly, retried next boot) when historic orphans remain.
    try {
      await pool.query(`ALTER TABLE ${fk.table} VALIDATE CONSTRAINT ${fk.constraint}`);
    } catch (error) {
      console.warn(
        `[DB] ${fk.table}.${fk.column} has rows that do not match ${fk.references}: ${(error as Error).message}`
      );
    }
  }
}
