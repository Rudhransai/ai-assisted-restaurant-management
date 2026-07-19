import React, { useEffect, useState } from 'react';
import { authFetch, clearAuth, getStoredUser } from './auth';

type TableStatus = 'Available' | 'Occupied' | 'Reserved';

type TableItem = {
  id: string;
  tableNumber: string;
  capacity: number;
  zone: string;
  status: TableStatus;
};

type TableWatchItem = {
  id: string;
  userId: string;
  tableId: string;
  email: string;
  guestName: string;
  partySize: number;
  status: 'Waiting' | 'Notified' | 'Fulfilled' | 'Cancelled';
  createdAt: string;
  tableNumber?: string;
  capacity?: number;
  zone?: string;
  tableStatus?: string;
};

export function CustomerDashboard() {
  const user = getStoredUser();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [watches, setWatches] = useState<TableWatchItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Watch form fields (prefilled with user details)
  const [watchForm, setWatchForm] = useState({
    email: user?.email ?? '',
    guestName: user?.name ?? '',
    partySize: '2',
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch tables
      const tablesRes = await authFetch('/api/v1/tables');
      const tablesPayload = await tablesRes.json().catch(() => ({}));
      if (tablesRes.ok) {
        setTables(tablesPayload.data ?? []);
      } else {
        setError(tablesPayload.message ?? 'Failed to load tables');
      }

      // Fetch watches
      const watchesRes = await authFetch('/api/v1/table-watch');
      const watchesPayload = await watchesRes.json().catch(() => ({}));
      if (watchesRes.ok) {
        setWatches(watchesPayload.data ?? []);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleOpenWatchModal = (table: TableItem) => {
    setSelectedTable(table);
    setSuccessMsg(null);
    setError(null);
  };

  const handleWatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await authFetch('/api/v1/table-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable.id,
          email: watchForm.email,
          guestName: watchForm.guestName,
          partySize: Number(watchForm.partySize),
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload.message ?? 'Failed to watch table');
        return;
      }

      setSuccessMsg(`Successfully subscribed! We will notify you at ${watchForm.email} once Table ${selectedTable.tableNumber} becomes Available.`);
      setSelectedTable(null);
      await fetchData();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  const statusChip = (status: TableStatus) => {
    if (status === 'Available') return 'bg-emerald-100 border-emerald-200 text-emerald-800';
    if (status === 'Occupied') return 'bg-rose-100 border-rose-200 text-rose-800';
    return 'bg-sky-100 border-sky-200 text-sky-800';
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        
        {/* Header */}
        <header className="mb-8 rounded-3xl border border-amber-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-1 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Customer Dashboard
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
                Welcome, {user?.name || 'Guest'}!
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Select your table, see its live status, and get instant email alerts when it becomes free.
              </p>
            </div>
            <div>
              <button 
                onClick={handleLogout}
                className="rounded-2xl border border-rose-600/20 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successMsg}
          </div>
        )}

        <main className="grid gap-8 lg:grid-cols-3">
          
          {/* Live Floor Map */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Select a Table</h2>
                <p className="text-sm text-slate-500">View real-time status and set up email notifications.</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 font-semibold">Available</span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 font-semibold">Occupied</span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700 font-semibold">Reserved</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => {
                const isAvailable = table.status === 'Available';
                return (
                  <div 
                    key={table.id} 
                    className={`rounded-2xl border p-5 flex flex-col justify-between transition hover:-translate-y-0.5 ${statusChip(table.status)}`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">{table.tableNumber}</span>
                        <span className="rounded-full bg-white/75 border border-inherit px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {table.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm opacity-80">{table.zone}</p>
                      <p className="mt-4 text-sm font-medium">Capacity: {table.capacity} guests</p>
                    </div>

                    <div className="mt-4">
                      {isAvailable ? (
                        <div className="text-xs text-emerald-800 font-semibold bg-white/50 border border-emerald-300 rounded-xl px-3 py-2 text-center">
                          Ready for seating! Ask host.
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenWatchModal(table)}
                          className="w-full text-center rounded-xl bg-slate-900 border border-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                        >
                          Notify Me When Free
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active watches and Form */}
          <div className="space-y-6">
            
            {/* Watch Form Modal / Inline */}
            {selectedTable && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800">
                    Watch Table {selectedTable.tableNumber}
                  </h3>
                  <button 
                    onClick={() => setSelectedTable(null)}
                    className="text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    ✕
                  </button>
                </div>
                
                <form onSubmit={handleWatchSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Email address to notify
                    </label>
                    <input 
                      type="email"
                      required
                      value={watchForm.email}
                      onChange={(e) => setWatchForm({ ...watchForm, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="your-email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Guest name
                    </label>
                    <input 
                      type="text"
                      required
                      value={watchForm.guestName}
                      onChange={(e) => setWatchForm({ ...watchForm, guestName: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Party size
                    </label>
                    <input 
                      type="number"
                      required
                      min="1"
                      max={selectedTable.capacity}
                      value={watchForm.partySize}
                      onChange={(e) => setWatchForm({ ...watchForm, partySize: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <span className="text-[10px] text-slate-400">
                      Table max capacity is {selectedTable.capacity}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-amber-700 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? 'Setting watch...' : 'Confirm Subscription'}
                  </button>
                </form>
              </div>
            )}

            {/* Active Watches List */}
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800">Your Active Watches</h2>
              <p className="text-sm text-slate-500 mb-4">We are monitoring these tables for you.</p>

              {watches.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No active table watches.</p>
              ) : (
                <div className="space-y-3">
                  {watches.map((watch) => (
                    <div 
                      key={watch.id} 
                      className="rounded-xl border border-slate-150 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">
                          Table {watch.tableNumber}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          watch.status === 'Notified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {watch.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        <p>Zone: {watch.zone} • Capacity: {watch.capacity} guests</p>
                        <p className="mt-1 text-slate-400">
                          Created at: {new Date(watch.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
