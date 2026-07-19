export type TableStatus = 'Available' | 'Occupied' | 'Reserved';

export interface TableItem {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string;
  status: TableStatus;
}

export interface ReservationItem {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
  tableId: string;
  status: 'Reserved' | 'Seated' | 'No-show';
  phone: string;
  reminderSent?: boolean;
}

export interface WaitlistItem {
  id: string;
  guestName: string;
  partySize: number;
  phone: string;
  position: number;
  quotedWaitMinutes: number;
  status: 'Waiting' | 'Notified' | 'Seated';
}

export interface NotificationItem {
  id: string;
  type: 'sms' | 'whatsapp' | 'reminder';
  recipient: string;
  content: string;
  status: 'queued' | 'sent';
  createdAt: string;
}

class RestaurantStore {
  private tables: TableItem[] = [
    { id: 'P1', tableNumber: 'P1', capacity: 2, zone: 'Patio', status: 'Occupied' },
    { id: 'P2', tableNumber: 'P2', capacity: 2, zone: 'Patio', status: 'Available' },
    { id: 'P3', tableNumber: 'P3', capacity: 4, zone: 'Patio', status: 'Available' },
    { id: 'B1', tableNumber: 'B1', capacity: 2, zone: 'Bar', status: 'Occupied' },
    { id: 'B2', tableNumber: 'B2', capacity: 2, zone: 'Bar', status: 'Available' },
    { id: 'M1', tableNumber: 'M1', capacity: 4, zone: 'Main Floor', status: 'Occupied' },
    { id: 'M2', tableNumber: 'M2', capacity: 4, zone: 'Main Floor', status: 'Reserved' },
    { id: 'M3', tableNumber: 'M3', capacity: 6, zone: 'Main Floor', status: 'Reserved' },
    { id: 'M6', tableNumber: 'M6', capacity: 8, zone: 'Main Floor', status: 'Reserved' },
  ];

  private reservations: ReservationItem[] = [
    { id: 'r1', guestName: 'Sharma', partySize: 2, time: '19:30', tableId: 'M6', status: 'Reserved', phone: '555-0123', reminderSent: false },
    { id: 'r2', guestName: 'Verma', partySize: 4, time: '20:00', tableId: 'M2', status: 'Reserved', phone: '555-0456', reminderSent: false },
  ];

  private waitlist: WaitlistItem[] = [
    { id: 'w1', guestName: 'Kapoor Party', partySize: 3, phone: '555-0987', position: 1, quotedWaitMinutes: 15, status: 'Waiting' },
    { id: 'w2', guestName: 'Reddy Group', partySize: 5, phone: '555-0765', position: 2, quotedWaitMinutes: 25, status: 'Notified' },
  ];

  private notifications: NotificationItem[] = [];

  getSnapshot() {
    return {
      tables: this.tables.map((table) => ({ ...table })),
      reservations: this.reservations.map((reservation) => ({ ...reservation })),
      waitlist: this.waitlist.map((entry) => ({ ...entry })),
      notifications: this.notifications.map((notification) => ({ ...notification })),
      stats: {
        occupiedTables: this.tables.filter((table) => table.status === 'Occupied').length,
        reservedTables: this.tables.filter((table) => table.status === 'Reserved').length,
        pendingWaitlist: this.waitlist.filter((entry) => entry.status === 'Waiting').length,
        occupancyRate: Math.round((this.tables.filter((table) => table.status === 'Occupied').length / this.tables.length) * 100),
      },
    };
  }

  updateTableStatus(tableId: string, status: TableStatus) {
    this.tables = this.tables.map((table) => table.id === tableId ? { ...table, status } : table);
    return this.getSnapshot().tables.find((table) => table.id === tableId) ?? null;
  }

  createReservation(data: { guestName: string; partySize: number; time: string; tableId: string; phone: string }) {
    const reservation: ReservationItem = {
      id: `r${Date.now()}`,
      guestName: data.guestName,
      partySize: data.partySize,
      time: data.time,
      tableId: data.tableId,
      status: 'Reserved',
      phone: data.phone,
      reminderSent: false,
    };
    this.reservations = [reservation, ...this.reservations];
    return reservation;
  }

  createWaitlistEntry(data: { guestName: string; partySize: number; phone: string }) {
    const waitlistEntry: WaitlistItem = {
      id: `w${Date.now()}`,
      guestName: data.guestName,
      partySize: data.partySize,
      phone: data.phone,
      position: this.waitlist.length + 1,
      quotedWaitMinutes: 10 + this.waitlist.length * 5,
      status: 'Waiting',
    };
    this.waitlist = [waitlistEntry, ...this.waitlist];
    this.reindexWaitlist();
    return waitlistEntry;
  }

  notifyWaitlistEntry(id: string) {
    this.waitlist = this.waitlist.map((entry) => entry.id === id ? { ...entry, status: 'Notified' } : entry);
    const entry = this.waitlist.find((item) => item.id === id);
    if (entry) {
      this.notifications.unshift({
        id: `n${Date.now()}`,
        type: 'whatsapp',
        recipient: entry.phone,
        content: `Guest notified for table assignment: ${entry.guestName}`,
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    }
    return entry ?? null;
  }

  assignWaitlistEntry(id: string) {
    const availableTable = this.tables.find((table) => table.status === 'Available');
    if (!availableTable) return null;
    this.waitlist = this.waitlist.map((entry) => entry.id === id ? { ...entry, status: 'Seated', position: 0 } : entry);
    this.tables = this.tables.map((table) => table.id === availableTable.id ? { ...table, status: 'Occupied' } : table);
    this.reindexWaitlist();
    return { waitlistEntry: this.waitlist.find((entry) => entry.id === id) ?? null, table: availableTable };
  }

  markReservationNoShow(id: string) {
    this.reservations = this.reservations.map((reservation) => reservation.id === id ? { ...reservation, status: 'No-show' } : reservation);
    return this.reservations.find((reservation) => reservation.id === id) ?? null;
  }

  sendReminders() {
    const reminderTargets = this.reservations.filter((reservation) => reservation.status === 'Reserved' && !reservation.reminderSent);
    reminderTargets.forEach((reservation) => {
      this.notifications.unshift({
        id: `n${Date.now()}-${reservation.id}`,
        type: 'reminder',
        recipient: reservation.phone,
        content: `Reminder for ${reservation.guestName} at ${reservation.time}`,
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    });
    this.reservations = this.reservations.map((reservation) => reservation.status === 'Reserved' && !reservation.reminderSent ? { ...reservation, reminderSent: true } : reservation);
    return reminderTargets.length;
  }

  private reindexWaitlist() {
    const activeEntries = this.waitlist.filter((entry) => entry.status !== 'Seated').map((entry, index) => ({ ...entry, position: index + 1, quotedWaitMinutes: 10 + index * 5 }));
    const seatedEntries = this.waitlist.filter((entry) => entry.status === 'Seated');
    this.waitlist = [...activeEntries, ...seatedEntries];
  }
}

export const restaurantStore = new RestaurantStore();
