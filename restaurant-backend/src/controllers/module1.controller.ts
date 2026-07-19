// src/controllers/module1.controller.ts
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { TableService } from '../services/table.service';
import { WaitlistService } from '../services/waitlist.service';
import { Pool } from 'pg';

export function createModule1Router(db: Pool): Router {
  const router = Router();
  const tableService = new TableService(db);
  const waitlistService = new WaitlistService(db);

  // --- Table Endpoints ---
  router.get('/tables/floor-plan', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await tableService.getFloorPlan();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

  // --- Waitlist Endpoints ---
  router.post('/waitlist', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await waitlistService.addToWaitlist(req.body);
      res.status(201).json({ success: true, data: entry });
    } catch (err) { next(err); }
  });

  router.patch('/waitlist/:id/notify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await waitlistService.notifyGuest(id ?? '');
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  });

  router.post('/waitlist/:id/seat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { tableId } = req.body;
      await waitlistService.seatWaitlistGuest(id ?? '', tableId);
      res.json({ success: true, message: 'Guest successfully seated from queue.' });
    } catch (err) { next(err); }
  });

  return router;
}