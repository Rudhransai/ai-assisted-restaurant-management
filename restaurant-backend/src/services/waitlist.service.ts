// src/services/waitlist.service.ts
import { Pool } from 'pg';
import { AppError } from '../middleware/errorHandler';

export interface WaitlistEntry {
  id: string;
  guestName: string;
  partySize: number;
  phoneNumber: string;
  position: number;
  quotedWaitMinutes: number;
  status: 'Waiting' | 'Notified' | 'Seated' | 'Cancelled';
  createdAt: Date;
}

export class WaitlistService {
  constructor(private db: Pool) {}

  /**
   * Add a walk-in to the running waitlist queue
   */
  async addToWaitlist(data: { guestName: string; partySize: number; phoneNumber: string }): Promise<WaitlistEntry> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // 1. Calculate running queue position & historical delay calculation (10 mins per active group ahead)
      const posResult = await client.query(
        "SELECT COUNT(*) as count FROM waitlist WHERE status IN ('Waiting', 'Notified')"
      );
      const activeGroupsAhead = parseInt(posResult.rows[0].count, 10);
      const position = activeGroupsAhead + 1;
      const quotedWaitMinutes = activeGroupsAhead * 10 + 10; 

      const insertQuery = `
        INSERT INTO waitlist (guest_name, party_size, phone_number, position, quoted_wait_minutes, status)
        VALUES ($1, $2, $3, $4, $5, 'Waiting')
        RETURNING id, guest_name as "guestName", party_size as "partySize", phone_number as "phoneNumber", position, quoted_wait_minutes as "quotedWaitMinutes", status, created_at as "createdAt";
      `;
      
      const { rows } = await client.query(insertQuery, [data.guestName, data.partySize, data.phoneNumber, position, quotedWaitMinutes]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Progress status to 'Notified' (FR-R-04 Notification Hook)
   */
  async notifyGuest(id: string): Promise<WaitlistEntry> {
    const query = `
      UPDATE waitlist 
      SET status = 'Notified', updated_at = NOW() 
      WHERE id = $1 
      RETURNING id, guest_name as "guestName", party_size as "partySize", status;
    `;
    const { rows } = await this.db.query(query, [id]);
    if (rows.length === 0) throw new AppError(404, 'Waitlist record matching ID not found');
    
    // Integration Hook: Trigger SMS Gateway dispatcher here
    return rows[0];
  }

  /**
   * Seat a waitlist guest into an active physical table
   */
  async seatWaitlistGuest(waitlistId: string, tableId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Check table capability safety check
      const tableCheck = await client.query('SELECT capacity, status FROM tables WHERE id = $1 FOR UPDATE', [tableId]);
      if (tableCheck.rows.length === 0) throw new AppError(404, 'Target table not found');
      if (tableCheck.rows[0].status !== 'Available') throw new AppError(400, 'Selected table is currently occupied/reserved');

      const waitlistCheck = await client.query('SELECT party_size FROM waitlist WHERE id = $1 FOR UPDATE', [waitlistId]);
      if (waitlistCheck.rows.length === 0) throw new AppError(404, 'Waitlist entry not found');

      if (waitlistCheck.rows[0].party_size > tableCheck.rows[0].capacity) {
        throw new AppError(400, 'Party size exceeds selected structural table capacity limits');
      }

      // Execute synchronous transition states
      await client.query("UPDATE waitlist SET status = 'Seated', position = 0 WHERE id = $1", [waitlistId]);
      await client.query("UPDATE tables SET status = 'Occupied' WHERE id = $2", [tableId]);
      
      // Cascade/re-index remainder queue index layout tracking positions
      await client.query(`
        UPDATE waitlist 
        SET position = sub.new_position
        FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_position
          FROM waitlist
          WHERE status IN ('Waiting', 'Notified')
        ) sub
        WHERE waitlist.id = sub.id;
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}