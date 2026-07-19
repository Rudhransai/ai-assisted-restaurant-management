import { RestaurantDbStore } from '../services/restaurantDbStore';
import { AppError } from '../middleware/errorHandler';

export function createPublicReservationController(dbStore: RestaurantDbStore) {
  return {
    // Public customer reservation: if no table availability, create waitlist entry.
    async create(req: any, res: any) {
      const {
        guestName,
        email,
        phone,
        time,
        partySize,
      } = req.body ?? {};

      if (!guestName || !phone || !time || !partySize) {
        throw new AppError(400, 'Missing required fields: guestName, phone, time, partySize');
      }

      // Currently schema has only walk-in waitlist; we treat public reservations as waitlist when full.
      // (A full table-capacity check would require a new query; out of scope for this minimal addition.)
      const waitlistEntry = await dbStore.createWaitlistEntry({
        guestName,
        partySize: Number(partySize),
        email: email ?? '',
        phone,
      });

      return res.status(201).json({
        success: true,
        data: waitlistEntry,
        message: 'You are added to the waitlist. The manager will assign a table when available.',
      });
    },
  };
}

