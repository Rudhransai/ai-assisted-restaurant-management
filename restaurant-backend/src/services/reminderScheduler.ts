// src/services/reminderScheduler.ts
import { Pool } from 'pg';
import { RestaurantDbStore } from './restaurantDbStore';

/**
 * Background reminder scheduler.
 *
 * Note: the previous implementation referenced tables/columns that don't exist in this repo's
 * schema. For Feature A we delegate to RestaurantDbStore.sendReminders(), which is schema-compatible
 * and already logs delivery results to the notifications table.
 */
export class ReminderScheduler {
  private intervalId?: NodeJS.Timeout;

  constructor(private readonly pool: Pool) {}

  start() {
    console.log('[Scheduler] Background reminder engine initialized.');
    this.intervalId = setInterval(() => this.processReminders(), 5 * 60 * 1000);
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
}

