// src/services/reminderScheduler.ts
import { Pool } from 'pg';
import { RestaurantDbStore } from './restaurantDbStore';
import { sendNotification } from '../integrations/notificationSender';
import { renderRestaurantMailContent, mailSubject } from '../integrations/mailTemplate';

/**
 * Background jobs.
 *
 *  - Guest reservation reminders (delegated to RestaurantDbStore.sendReminders)
 *  - Manager low-stock alerts
 *
 * Both run on the same 5-minute tick. Reminders are guarded by their own lead-time
 * window and a reminder_sent flag; low-stock alerts are guarded by the once-a-day
 * check below.
 */
export class ReminderScheduler {
  private intervalId?: NodeJS.Timeout;

  /** Date (YYYY-MM-DD) the manager was last told about low stock. */
  private lastStockAlertDate = '';

  constructor(private readonly pool: Pool) {}

  start() {
    console.log('[Scheduler] Background reminder engine initialized.');
    this.intervalId = setInterval(() => {
      void this.processReminders();
      void this.processLowStockAlerts();
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async processReminders(): Promise<void> {
    try {
      const store = new RestaurantDbStore(this.pool);
      await store.sendReminders();
    } catch (err) {
      console.error('[Scheduler Error] sendReminders failed:', err);
    }
  }

  /**
   * Tell the manager which ingredients have dropped below their minimum stock level.
   *
   * The dashboard already showed these, but nothing was ever sent, so a manager who
   * wasn't looking at the screen never found out. Sent at most once per calendar day
   * to avoid a message every five minutes for the same items.
   */
  private async processLowStockAlerts(): Promise<void> {
    const managerEmail = process.env.MANAGER_ALERT_EMAIL;
    const managerPhone = process.env.MANAGER_ALERT_PHONE;
    if (!managerEmail && !managerPhone) return; // feature is opt-in

    const today = new Date().toISOString().slice(0, 10);
    if (this.lastStockAlertDate === today) return;

    try {
      const result = await this.pool.query(
        `SELECT name, current_stock AS "currentStock", minimum_stock AS "minimumStock", unit
           FROM ingredients
          WHERE current_stock < minimum_stock
          ORDER BY name`
      );

      if (result.rows.length === 0) {
        this.lastStockAlertDate = today; // nothing to report; don't re-check all day
        return;
      }

      const alertItems = result.rows
        .map((r: any) => `  - ${r.name}: ${r.currentStock}${r.unit ?? ''} (minimum ${r.minimumStock}${r.unit ?? ''})`)
        .join('\n');

      const content = renderRestaurantMailContent({ action: 'low_stock_alert', alertItems });

      if (managerEmail) {
        await sendNotification({
          type: 'mail',
          recipient: managerEmail,
          content,
          subject: mailSubject('low_stock_alert'),
        });
      }

      if (managerPhone) {
        await sendNotification({
          type: 'whatsapp',
          recipient: managerPhone,
          content,
          template: {
            name: process.env.WHATSAPP_TEMPLATE_LOW_STOCK || 'low_stock_alert',
            languageCode: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
            params: [String(result.rows.length)],
          },
        });
      }

      this.lastStockAlertDate = today;
      console.log(`[Scheduler] Low stock alert sent for ${result.rows.length} ingredient(s).`);
    } catch (err) {
      console.error('[Scheduler Error] low stock alert failed:', err);
    }
  }
}
