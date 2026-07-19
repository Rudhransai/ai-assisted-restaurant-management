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

type TableWatchSummary = {
  tableId: string;
  tableNumber: string;
  waitingCount: number;
  notifiedCount: number;
};

type OrderItem = {
  dishName: string;
  quantity: number;
  unitPrice: number;
};

type OrderRecord = {
  id: string;
  guestName: string;
  email: string;
  tableNumber: string;
  partySize: number;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  items: OrderItem[];
};

type DishStat = {
  dishName: string;
  totalOrdered: number;
  revenue: number;
};

type ActiveTab = 'floor' | 'reservations' | 'waitlist' | 'orders' | 'analytics';

const tabLabels: Record<ActiveTab, string> = {
  floor: 'Floor plan',
  reservations: 'Reservations',
  waitlist: 'Waitlist',
  orders: 'Orders & Stock',
  analytics: 'Analytics',
};

function fmt(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('floor');
  const [tables, setTables] = useState<TableItem[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tableWatches, setTableWatches] = useState<TableWatchSummary[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [dishStats, setDishStats] = useState<DishStat[]>([]);

  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

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
      const [dashRes, watchesRes] = await Promise.all([
        authFetch('/api/v1/dashboard'),
        authFetch('/api/v1/table-watches'),
      ]);
      const payload = await dashRes.json();
      setTables(payload.tables ?? []);
      setReservations(payload.reservations ?? []);
      setWaitlist(payload.waitlist ?? []);
      setNotifications(payload.notifications ?? []);
      setStats(payload.stats ?? { occupiedTables: 0, reservedTables: 0, pendingWaitlist: 0, occupancyRate: 0 });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      if (!payload.tables?.length) return;
      setSelectedTable((current) => current ?? payload.tables[0] ?? null);

      const watchesPayload = await watchesRes.json().catch(() => ({}));
      if (watchesRes.ok) setTableWatches(watchesPayload.data ?? []);
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshOrders = async () => {
    const [ordersRes, statsRes] = await Promise.all([
      authFetch('/api/v1/orders'),
      authFetch('/api/v1/dishes/stats'),
    ]);
    const ordersPayload = await ordersRes.json().catch(() => ({}));
    const statsPayload = await statsRes.json().catch(() => ({}));
    if (ordersRes.ok) setOrders(ordersPayload.data ?? []);
    if (statsRes.ok) setDishStats(statsPayload.data ?? []);
  };

  useEffect(() => {
    void refreshDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') void refreshOrders();
  }, [activeTab]);

  const watchMap = useMemo(() => {
    const m = new Map<string, TableWatchSummary>();
    for (const w of tableWatches) m.set(w.tableId, w);
    return m;
  }, [tableWatches]);

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
    setClearMsg(null);
    await refreshDashboard();
  };

  const handleClearTable = async (tableId: string) => {
    setClearMsg(null);
    const res = await authFetch(`/api/v1/tables/${tableId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Available' }),
    });
    const payload = await res.json().catch(() => ({}));
    const n: number = payload.notifiedCount ?? 0;
    setClearMsg(
      n > 0
        ? `✅ Table cleared — ${n} customer${n > 1 ? 's' : ''} notified by email!`
        : '✅ Table cleared. No customers were watching this table.'
    );
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

  const totalOrderRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-amber-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                Manager Console
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
                Restaurant floor & guest operations
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                Manage reservations, waitlist, table status, orders, and reminders from one workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleSendReminders} className="rounded-2xl border border-emerald-600/20 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer">
                Send reminders
              </button>
              <button onClick={() => setShowWalkInForm((prev) => !prev)} className="rounded-2xl border border-amber-600/20 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 cursor-pointer">
                {showWalkInForm ? 'Hide walk-in form' : '+ Walk-in entry'}
              </button>
              <button onClick={() => setShowReservationForm((prev) => !prev)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 cursor-pointer">
                {showReservationForm ? 'Hide reservation form' : 'New reservation'}
              </button>
              <button onClick={() => { clearAuth(); window.location.href = '/login'; }} className="rounded-2xl border border-rose-600/20 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 cursor-pointer">
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
              <button onClick={() => void refreshDashboard()} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 cursor-pointer">
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
              <li>• Tables cleared → watchers emailed automatically</li>
              <li>• Orders & dish stock tracked in real time</li>
            </ul>
          </div>
        </section>

        <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(Object.keys(tabLabels) as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition cursor-pointer ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
            >
              {tabLabels[tab]}
              {tab === 'orders' && orders.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>

        {showWalkInForm && (
          <form onSubmit={handleCreateWalkIn} className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <input value={walkInForm.guestName} onChange={(e) => setWalkInForm({ ...walkInForm, guestName: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Guest name" />
              <input value={walkInForm.partySize} onChange={(e) => setWalkInForm({ ...walkInForm, partySize: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={walkInForm.phone} onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 cursor-pointer">Add to waitlist</button>
            </div>
          </form>
        )}

        {showReservationForm && (
          <form onSubmit={handleCreateReservation} className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <input value={reservationForm.guestName} onChange={(e) => setReservationForm({ ...reservationForm, guestName: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Guest name" />
              <input value={reservationForm.partySize} onChange={(e) => setReservationForm({ ...reservationForm, partySize: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={reservationForm.time} onChange={(e) => setReservationForm({ ...reservationForm, time: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Time (HH:MM)" />
              <input value={reservationForm.phone} onChange={(e) => setReservationForm({ ...reservationForm, phone: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 cursor-pointer">Save reservation</button>
            </div>
          </form>
        )}

        <main>
          {/* ── Floor plan ─────────────────────────────────────────────────────── */}
          {activeTab === 'floor' && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">Live floor map</h2>
                    <p className="text-sm text-slate-500">Tap a table to manage it. Bell icons show how many customers are waiting to be notified.</p>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1">Available</span>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1">Occupied</span>
                    <span className="rounded-full bg-sky-100 px-2.5 py-1">Reserved</span>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {tables.map((table) => {
                    const watch = watchMap.get(table.id);
                    const waitingCount = watch?.waitingCount ?? 0;
                    return (
                      <button
                        key={table.id}
                        onClick={() => { setSelectedTable(table); setClearMsg(null); }}
                        className={`rounded-2xl border p-5 text-left transition relative ${selectedTable?.id === table.id ? 'ring-2 ring-amber-400' : 'hover:-translate-y-0.5'} ${statusChip(table.status)}`}
                      >
                        {waitingCount > 0 && (
                          <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                            🔔 {waitingCount} waiting
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-semibold">{table.tableNumber}</span>
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{table.status}</span>
                        </div>
                        <p className="mt-2 text-sm opacity-80">{table.zone}</p>
                        <p className="mt-4 text-sm font-medium">Up to {table.capacity} guests</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Table controls</h2>

                {clearMsg && (
                  <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium border ${clearMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    {clearMsg}
                  </div>
                )}

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

                    {/* Watcher info */}
                    {(() => {
                      const w = watchMap.get(selectedTable.id);
                      if (!w || (w.waitingCount === 0 && w.notifiedCount === 0)) return null;
                      return (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                          <p className="font-semibold mb-1">🔔 Table watchers</p>
                          {w.waitingCount > 0 && <p>{w.waitingCount} customer{w.waitingCount > 1 ? 's' : ''} waiting to be notified</p>}
                          {w.notifiedCount > 0 && <p className="text-amber-600">{w.notifiedCount} already notified</p>}
                          {w.waitingCount > 0 && (
                            <p className="mt-1 text-xs text-amber-700">Clearing this table will email {w.waitingCount > 1 ? 'all of them' : 'them'} automatically.</p>
                          )}
                        </div>
                      );
                    })()}

                    <div className="mt-5 flex flex-col gap-2">
                      {selectedTable.status === 'Available' && (
                        <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer">
                          Mark as occupied
                        </button>
                      )}
                      {selectedTable.status === 'Reserved' && (
                        <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer">
                          Confirm seating
                        </button>
                      )}
                      {selectedTable.status === 'Occupied' && (
                        <button onClick={() => handleClearTable(selectedTable.id)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                          Clear table
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-8 text-center text-sm text-slate-500">Select a table to manage it.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Reservations ─────────────────────────────────────────────────── */}
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
                      <td className="p-4"><button onClick={() => void handleMarkNoShow(reservation.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer">No-show</button></td>
                    </tr>
                  ))}
                  {reservations.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-400 italic">No reservations yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Waitlist ──────────────────────────────────────────────────────── */}
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
                          {entry.status === 'Waiting' && <button onClick={() => handleNotifyWaitlist(entry.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer">Notify</button>}
                          {entry.status !== 'Seated' && <button onClick={() => handleAssignSeating(entry.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">Assign</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {waitlist.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-sm text-slate-400 italic">No waitlist entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Orders & Stock ────────────────────────────────────────────────── */}
          {activeTab === 'orders' && (
            <div className="space-y-8">
              {/* Dish stock summary */}
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">Dish order counts</h2>
                    <p className="text-sm text-slate-500">Total quantities ordered across all customer orders.</p>
                  </div>
                  <button onClick={() => void refreshOrders()} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 cursor-pointer">Refresh</button>
                </div>
                {dishStats.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No orders placed yet.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {dishStats.map((d) => (
                      <div key={d.dishName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800 leading-tight">{d.dishName}</span>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">×{d.totalOrdered}</span>
                        </div>
                        <p className="mt-2 text-sm text-emerald-700 font-medium">{fmt(d.revenue)} revenue</p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, (d.totalOrdered / Math.max(...dishStats.map((x) => x.totalOrdered))) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order list */}
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">Customer orders</h2>
                    <p className="text-sm text-slate-500">
                      {orders.length} order{orders.length !== 1 ? 's' : ''} · Total revenue: <span className="font-semibold text-emerald-700">{fmt(totalOrderRevenue)}</span>
                    </p>
                  </div>
                </div>
                {orders.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No orders yet. Customers place orders via the customer dashboard.</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{order.guestName}</span>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">{order.status}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Table {order.tableNumber} · {order.partySize} guests · {new Date(order.createdAt).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-400">{order.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-700">{fmt(order.totalAmount)}</p>
                            <p className="text-xs text-slate-400 capitalize">{order.paymentMethod}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.items.map((item, i) => (
                            <span key={i} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                              {item.dishName} <span className="text-slate-400">×{item.quantity}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Analytics ─────────────────────────────────────────────────────── */}
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
                  {notifications.length === 0 && <li className="text-slate-400 italic">No notifications yet.</li>}
                  {notifications.map((n) => (
                    <li key={n.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 uppercase text-xs">{n.type}</span>
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${n.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {n.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{n.recipient}</div>
                      <div className="mt-1 text-slate-600 truncate">{n.content.split('\n')[0]}</div>
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
