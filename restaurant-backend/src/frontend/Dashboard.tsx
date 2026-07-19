import React, { useEffect, useMemo, useState } from 'react';
import { authFetch, clearAuth } from './auth';

type TableStatus = 'Available' | 'Occupied' | 'Reserved';

type TableItem = {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string;
  status: TableStatus;
};

type ReservationItem = {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
  tableId: string;
  status: string;
  phone: string;
  reminderSent?: boolean;
};

type WaitlistItem = {
  id: string;
  guestName: string;
  partySize: number;
  phone: string;
  position: number;
  quotedWaitMinutes: number;
  status: 'Waiting' | 'Notified' | 'Seated';
};

type NotificationItem = {
  id: string;
  type: string;
  recipient: string;
  content: string;
  status: string;
  createdAt: string;
};

const tabLabels: Record<'floor' | 'reservations' | 'waitlist' | 'analytics', string> = {
  floor: 'Floor plan',
  reservations: 'Reservations',
  waitlist: 'Waitlist',
  analytics: 'Analytics',
};

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<'floor' | 'reservations' | 'waitlist' | 'analytics'>('floor');
  const [tables, setTables] = useState<TableItem[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationForm, setReservationForm] = useState({ guestName: '', partySize: '2', time: '20:00', tableId: 'M2', phone: '' });
  const [walkInForm, setWalkInForm] = useState({ guestName: '', partySize: '2', phone: '' });
  const [stats, setStats] = useState({ occupiedTables: 0, reservedTables: 0, pendingWaitlist: 0, occupancyRate: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const refreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      const response = await authFetch('/api/v1/dashboard');
      const payload = await response.json();
      setTables(payload.tables ?? []);
      setReservations(payload.reservations ?? []);
      setWaitlist(payload.waitlist ?? []);
      setNotifications(payload.notifications ?? []);
      setStats(payload.stats ?? { occupiedTables: 0, reservedTables: 0, pendingWaitlist: 0, occupancyRate: 0 });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      if (!payload.tables?.length) return;
      setSelectedTable((current) => current ?? payload.tables[0] ?? null);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshDashboard();
  }, []);

  const occupiedCount = stats.occupiedTables;
  const reservedCount = stats.reservedTables;
  const pendingWaitlist = stats.pendingWaitlist;
  const occupancyRate = stats.occupancyRate;

  const occupancyLabel = useMemo(() => {
    if (occupancyRate >= 80) return 'Peak service';
    if (occupancyRate >= 60) return 'Busy but balanced';
    return 'Comfortable flow';
  }, [occupancyRate]);

  const handleSeatTable = async (tableId: string) => {
    await authFetch(`/api/v1/tables/${tableId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Occupied' }),
    });
    await refreshDashboard();
  };

  const handleClearTable = async (tableId: string) => {
    await authFetch(`/api/v1/tables/${tableId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Available' }),
    });
    await refreshDashboard();
  };

  const handleNotifyWaitlist = async (id: string) => {
    await authFetch(`/api/v1/waitlist/${id}/notify`, { method: 'POST' });
    await refreshDashboard();
  };

  const handleAssignSeating = async (id: string) => {
    await authFetch(`/api/v1/waitlist/${id}/assign`, { method: 'POST' });
    await refreshDashboard();
  };

  const handleCreateReservation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reservationForm.guestName.trim()) return;

    await authFetch('/api/v1/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: reservationForm.guestName,
        partySize: Number(reservationForm.partySize),
        time: reservationForm.time,
        tableId: reservationForm.tableId,
        phone: reservationForm.phone,
      }),
    });
    setReservationForm({ guestName: '', partySize: '2', time: '20:00', tableId: 'M2', phone: '' });
    setShowReservationForm(false);
    setActiveTab('reservations');
    await refreshDashboard();
  };

  const handleCreateWalkIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!walkInForm.guestName.trim()) return;

    await authFetch('/api/v1/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: walkInForm.guestName,
        partySize: Number(walkInForm.partySize),
        phone: walkInForm.phone,
      }),
    });
    setWalkInForm({ guestName: '', partySize: '2', phone: '' });
    setShowWalkInForm(false);
    setActiveTab('waitlist');
    await refreshDashboard();
  };

  const handleMarkNoShow = async (id: string) => {
    await authFetch(`/api/v1/reservations/${id}/no-show`, { method: 'POST' });
    await refreshDashboard();
  };

  const handleSendReminders = async () => {
    await authFetch('/api/v1/reminders/send', { method: 'POST' });
    await refreshDashboard();
  };

  const statusChip = (status: string) => {
    if (status === 'Available') return 'bg-emerald-100 text-emerald-800';
    if (status === 'Occupied') return 'bg-rose-100 text-rose-800';
    return 'bg-sky-100 text-sky-800';
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-amber-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                Demo-ready service console
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
                Restaurant floor & guest operations, refined for daily service
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                Manage reservations, waitlist arrivals, table status, and reminders from one polished workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleSendReminders} className="rounded-2xl border border-emerald-600/20 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
                Send reminders
              </button>
              <button onClick={() => setShowWalkInForm((prev) => !prev)} className="rounded-2xl border border-amber-600/20 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">
                {showWalkInForm ? 'Hide walk-in form' : '+ Walk-in entry'}
              </button>
              <button onClick={() => setShowReservationForm((prev) => !prev)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800">
                {showReservationForm ? 'Hide reservation form' : 'New reservation'}
              </button>
              <button onClick={() => { clearAuth(); window.location.href = '/login'; }} className="rounded-2xl border border-rose-600/20 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
                Sign out
              </button>
            </div>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Occupied tables', value: occupiedCount, tone: 'text-amber-700' },
            { label: 'Reserved tables', value: reservedCount, tone: 'text-sky-700' },
            { label: 'Pending waitlist', value: pendingWaitlist, tone: 'text-emerald-700' },
            { label: 'Occupancy', value: `${occupancyRate}%`, tone: 'text-slate-800' },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mb-8 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Service pulse</p>
                <h2 className="text-xl font-semibold text-slate-800">{occupancyLabel}</h2>
              </div>
              <button onClick={() => void refreshDashboard()} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">
                {isRefreshing ? 'Refreshing…' : `Updated ${lastUpdated || 'just now'}`}
              </button>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${occupancyRate}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              The front-of-house team is currently balancing {occupiedCount} occupied tables and {pendingWaitlist} guests waiting for seating.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <p className="text-sm font-semibold text-slate-300">Quick overview</p>
            <h2 className="mt-2 text-xl font-semibold">Ready for service</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• Reservations stay synced in one clean view</li>
              <li>• Waitlist guests can be notified instantly</li>
              <li>• Tables can be updated with a single tap</li>
            </ul>
          </div>
        </section>

        <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(Object.keys(tabLabels) as Array<'floor' | 'reservations' | 'waitlist' | 'analytics'>).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>

        {showWalkInForm && (
          <form onSubmit={handleCreateWalkIn} className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <input value={walkInForm.guestName} onChange={(event) => setWalkInForm({ ...walkInForm, guestName: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Guest name" />
              <input value={walkInForm.partySize} onChange={(event) => setWalkInForm({ ...walkInForm, partySize: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={walkInForm.phone} onChange={(event) => setWalkInForm({ ...walkInForm, phone: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">Add to waitlist</button>
            </div>
          </form>
        )}

        {showReservationForm && (
          <form onSubmit={handleCreateReservation} className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <input value={reservationForm.guestName} onChange={(event) => setReservationForm({ ...reservationForm, guestName: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Guest name" />
              <input value={reservationForm.partySize} onChange={(event) => setReservationForm({ ...reservationForm, partySize: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={reservationForm.time} onChange={(event) => setReservationForm({ ...reservationForm, time: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Time" />
              <input value={reservationForm.phone} onChange={(event) => setReservationForm({ ...reservationForm, phone: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800">Save reservation</button>
            </div>
          </form>
        )}

        <main>
          {activeTab === 'floor' && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">Live floor map</h2>
                    <p className="text-sm text-slate-500">Tap any table to inspect it quickly.</p>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1">Available</span>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1">Occupied</span>
                    <span className="rounded-full bg-sky-100 px-2.5 py-1">Reserved</span>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {tables.map((table) => (
                    <button key={table.id} onClick={() => setSelectedTable(table)} className={`rounded-2xl border p-5 text-left transition ${selectedTable?.id === table.id ? 'ring-2 ring-amber-400' : 'hover:-translate-y-0.5'} ${statusChip(table.status)}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold">{table.tableNumber}</span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{table.status}</span>
                      </div>
                      <p className="mt-2 text-sm opacity-80">{table.zone}</p>
                      <p className="mt-4 text-sm font-medium">Up to {table.capacity} guests</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Table controls</h2>
                {selectedTable ? (
                  <div className="mt-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Selected table</p>
                      <h3 className="mt-1 text-2xl font-semibold text-slate-800">Table {selectedTable.tableNumber}</h3>
                      <p className="mt-2 text-sm text-slate-600">{selectedTable.zone} • {selectedTable.capacity} seats</p>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Current status</p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">{selectedTable.status}</p>
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                      {selectedTable.status === 'Available' && <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Mark as occupied</button>}
                      {selectedTable.status === 'Reserved' && <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">Confirm seating</button>}
                      {selectedTable.status === 'Occupied' && <button onClick={() => handleClearTable(selectedTable.id)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Clear table</button>}
                    </div>
                  </div>
                ) : (
                  <p className="mt-8 text-center text-sm text-slate-500">Select a table to manage it.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reservations' && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-4">Guest</th>
                    <th className="p-4">Party</th>
                    <th className="p-4">Booking time</th>
                    <th className="p-4">Table</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {reservations.map((reservation) => (
                    <tr key={reservation.id} className="hover:bg-slate-50">
                      <td className="p-4 font-semibold text-slate-800">{reservation.guestName}</td>
                      <td className="p-4">{reservation.partySize} guests</td>
                      <td className="p-4">{reservation.time}</td>
                      <td className="p-4 font-mono text-slate-700">{reservation.tableId}</td>
                      <td className="p-4 text-slate-500">{reservation.phone}</td>
                      <td className="p-4"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">{reservation.status}</span></td>
                      <td className="p-4"><button onClick={() => void handleMarkNoShow(reservation.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">No-show</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'waitlist' && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-4">Queue</th>
                    <th className="p-4">Party</th>
                    <th className="p-4">Party size</th>
                    <th className="p-4">Wait</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {waitlist.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="p-4 font-semibold text-amber-700">#{entry.position}</td>
                      <td className="p-4 font-semibold text-slate-800">{entry.guestName}</td>
                      <td className="p-4">{entry.partySize} guests</td>
                      <td className="p-4 text-slate-500">~{entry.quotedWaitMinutes} mins</td>
                      <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === 'Notified' || entry.status === 'Seated' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{entry.status}</span></td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          {entry.status === 'Waiting' && <button onClick={() => handleNotifyWaitlist(entry.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Notify</button>}
                          {entry.status !== 'Seated' && <button onClick={() => handleAssignSeating(entry.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Assign</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800">Service load</h3>
                <p className="mt-2 text-sm text-slate-600">The team is managing {pendingWaitlist} waiting guests and {occupiedCount} occupied tables.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-800">Occupancy trend</h3>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${occupancyRate}%` }} />
                </div>
                <p className="mt-3 text-sm text-slate-600">Current occupancy is {occupancyRate}% with {reservedCount} reserved tables.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-semibold text-slate-800">Recent notifications</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-800">{notification.type}</div>
                      <div>{notification.content}</div>
                      <div className="mt-1 text-xs text-slate-500">{notification.recipient} • {notification.status}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}