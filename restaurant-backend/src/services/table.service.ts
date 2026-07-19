// src/services/table.service.ts
import { Pool } from 'pg';
import { AppError } from '../middleware/errorHandler';

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: 'Main Floor' | 'Bar' | 'Patio';
  status: 'Available' | 'Occupied' | 'Reserved';
  currentReservationId?: string | null;
}

export class TableService {
  constructor(private db: Pool) {}

  /**
   * Fetch current floor plan with reactive structural mapping
   */
  async getFloorPlan(): Promise<Table[]> {
    const query = `
      SELECT 
        t.id, 
        t.table_number as "tableNumber", 
        t.capacity, 
        t.zone, 
        t.status,
        r.id as "currentReservationId"
      FROM tables t
      LEFT JOIN reservations r ON r.table_id = t.id AND r.status = 'Seated'
      ORDER BY t.table_number ASC;
    `;
    const { rows } = await this.db.query(query);
    return rows;
  }

  /**
   * Manually update a physical table status (e.g., clearing or turning a table)
   */
  async updateTableStatus(tableId: string, status: 'Available' | 'Occupied' | 'Reserved'): Promise<Table> {
    const query = `
      UPDATE tables 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING id, table_number as "tableNumber", capacity, zone, status;
    `;
    const { rows } = await this.db.query(query, [status, tableId]);
    
    if (rows.length === 0) {
      throw new AppError(404, 'Table not found');
    }
    return rows[0];
  }
}