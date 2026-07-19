import React, { useEffect, useState } from 'react';
import { authFetch, clearAuth, getStoredUser } from './auth';

// ── Types ────────────────────────────────────────────────────────────────────
type TableStatus = 'Available' | 'Occupied' | 'Reserved';
type View = 'tables' | 'menu' | 'checkout' | 'confirmed';

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

type DishItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
};

type CartEntry = { dish: DishItem; quantity: number };

type OrderResult = {
  id: string;
  totalAmount: number;
  tableNumber: string;
  email: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const statusChip = (status: TableStatus) => {
  if (status === 'Available') return 'bg-emerald-100 border-emerald-200 text-emerald-800';
  if (status === 'Occupied') return 'bg-rose-100 border-rose-200 text-rose-800';
  return 'bg-sky-100 border-sky-200 text-sky-800';
};

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function cartTotal(cart: CartEntry[]) {
  return cart.reduce((s, e) => s + e.dish.price * e.quantity, 0);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CustomerDashboard() {
  const user = getStoredUser();

  // view state
  const [view, setView] = useState<View>('tables');

  // tables + watches
  const [tables, setTables] = useState<TableItem[]>([]);
  const [watches, setWatches] = useState<TableWatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // selected table (for booking or watch)
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  // watch modal state
  const [watchModalTable, setWatchModalTable] = useState<TableItem | null>(null);
  const [watchForm, setWatchForm] = useState({
    email: user?.email ?? '',
    guestName: user?.name ?? '',
    partySize: '2',
  });

  // menu
  const [dishes, setDishes] = useState<DishItem[]>([]);
  const [cart, setCart] = useState<CartEntry[]>([]);

  // checkout
  const [payForm, setPayForm] = useState({
    nameOnCard: user?.name ?? '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // confirmed order
  const [confirmedOrder, setConfirmedOrder] = useState<OrderResult | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tablesRes, watchesRes] = await Promise.all([
        authFetch('/api/v1/tables'),
        authFetch('/api/v1/table-watch'),
      ]);
      const tablesPayload = await tablesRes.json().catch(() => ({}));
      if (tablesRes.ok) setTables(tablesPayload.data ?? []);
      else setError(tablesPayload.message ?? 'Failed to load tables');

      const watchesPayload = await watchesRes.json().catch(() => ({}));
      if (watchesRes.ok) setWatches(watchesPayload.data ?? []);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchDishes = async () => {
    try {
      const res = await authFetch('/api/v1/dishes');
      const payload = await res.json().catch(() => ({}));
      if (res.ok) setDishes(payload.data ?? []);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => { void fetchData(); }, []);

  // ── Watch modal handlers ──────────────────────────────────────────────────────
  const handleOpenWatchModal = (table: TableItem) => {
    setWatchModalTable(table);
    setSuccessMsg(null);
    setError(null);
  };

  const handleWatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!watchModalTable) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await authFetch('/api/v1/table-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: watchModalTable.id,
          email: watchForm.email,
          guestName: watchForm.guestName,
          partySize: Number(watchForm.partySize),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload.message ?? 'Failed to watch table'); return; }
      setSuccessMsg(`Subscribed! We'll email you at ${watchForm.email} when Table ${watchModalTable.tableNumber} is free.`);
      setWatchModalTable(null);
      await fetchData();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Book & Order flow ─────────────────────────────────────────────────────────
  const handleBookTable = async (table: TableItem) => {
    setSelectedTable(table);
    setCart([]);
    setError(null);
    setView('menu');
    if (dishes.length === 0) await fetchDishes();
  };

  // cart helpers
  const addToCart = (dish: DishItem) => {
    setCart((prev) => {
      const existing = prev.find((e) => e.dish.id === dish.id);
      if (existing) return prev.map((e) => e.dish.id === dish.id ? { ...e, quantity: e.quantity + 1 } : e);
      return [...prev, { dish, quantity: 1 }];
    });
  };

  const removeFromCart = (dishId: string) => {
    setCart((prev) => {
      const existing = prev.find((e) => e.dish.id === dishId);
      if (!existing) return prev;
      if (existing.quantity <= 1) return prev.filter((e) => e.dish.id !== dishId);
      return prev.map((e) => e.dish.id === dishId ? { ...e, quantity: e.quantity - 1 } : e);
    });
  };

  const cartQty = (dishId: string) => cart.find((e) => e.dish.id === dishId)?.quantity ?? 0;

  // checkout submit
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || cart.length === 0) return;

    setPayLoading(true);
    setPayError(null);

    try {
      const res = await authFetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable.id,
          tableNumber: selectedTable.tableNumber,
          partySize: cart.reduce((s, e) => s + e.quantity, 0),
          paymentMethod: 'card',
          items: cart.map((e) => ({
            dishId: e.dish.id,
            dishName: e.dish.name,
            quantity: e.quantity,
            unitPrice: e.dish.price,
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPayError(payload.message ?? 'Order failed. Please try again.');
        return;
      }
      setConfirmedOrder({
        id: payload.data.id,
        totalAmount: payload.data.totalAmount,
        tableNumber: payload.data.tableNumber,
        email: payload.data.email,
      });
      setView('confirmed');
      await fetchData(); // refresh table statuses
    } catch (err: any) {
      setPayError(err?.message ?? String(err));
    } finally {
      setPayLoading(false);
    }
  };

  const handleLogout = () => { clearAuth(); window.location.href = '/login'; };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const categories = Array.from(new Set(dishes.map((d) => d.category)));
  const total = cartTotal(cart);

  // ── Render helpers ────────────────────────────────────────────────────────────
  const Header = ({ title, subtitle, back }: { title: string; subtitle?: string; back?: () => void }) => (
    <header className="mb-8 rounded-3xl border border-amber-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {back && (
            <button onClick={back} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
              ← Back
            </button>
          )}
          <div>
            <p className="mb-1 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Customer Dashboard
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
        </div>
        <button onClick={handleLogout} className="self-start rounded-2xl border border-rose-600/20 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 cursor-pointer">
          Sign out
        </button>
      </div>
    </header>
  );

  // ── VIEWS ─────────────────────────────────────────────────────────────────────

  // ── Tables view ───────────────────────────────────────────────────────────────
  if (view === 'tables') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <Header
            title={`Welcome, ${user?.name || 'Guest'}!`}
            subtitle="Select an available table to book & order, or get notified when your preferred table is free."
          />

          {error && <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {successMsg && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMsg}</div>}

          <main className="grid gap-8 lg:grid-cols-3">
            {/* Live Floor Map */}
            <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Live Floor Map</h2>
                  <p className="text-sm text-slate-500">Real-time table status.</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 font-semibold">Available</span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 font-semibold">Occupied</span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700 font-semibold">Reserved</span>
                </div>
              </div>

              {loading && <p className="text-sm text-slate-400">Loading tables…</p>}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tables.map((table) => {
                  const isAvailable = table.status === 'Available';
                  return (
                    <div key={table.id} className={`rounded-2xl border p-5 flex flex-col justify-between transition hover:-translate-y-0.5 ${statusChip(table.status)}`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold">{table.tableNumber}</span>
                          <span className="rounded-full bg-white/75 border border-inherit px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{table.status}</span>
                        </div>
                        <p className="mt-2 text-sm opacity-80">{table.zone}</p>
                        <p className="mt-4 text-sm font-medium">Capacity: {table.capacity} guests</p>
                      </div>
                      <div className="mt-4">
                        {isAvailable ? (
                          <button
                            onClick={() => handleBookTable(table)}
                            className="w-full text-center rounded-xl bg-emerald-700 border border-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition cursor-pointer"
                          >
                            🍽️ Book & Order
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenWatchModal(table)}
                            className="w-full text-center rounded-xl bg-slate-900 border border-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
                          >
                            🔔 Notify Me When Free
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Watch modal inline */}
              {watchModalTable && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Watch Table {watchModalTable.tableNumber}</h3>
                    <button onClick={() => setWatchModalTable(null)} className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer">✕</button>
                  </div>
                  <form onSubmit={handleWatchSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Email to notify</label>
                      <input type="email" required value={watchForm.email} onChange={(e) => setWatchForm({ ...watchForm, email: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="your@email.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Guest name</label>
                      <input type="text" required value={watchForm.guestName} onChange={(e) => setWatchForm({ ...watchForm, guestName: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Party size</label>
                      <input type="number" required min="1" max={watchModalTable.capacity} value={watchForm.partySize} onChange={(e) => setWatchForm({ ...watchForm, partySize: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                      <span className="text-[10px] text-slate-400">Max {watchModalTable.capacity}</span>
                    </div>
                    <button type="submit" disabled={loading} className="w-full rounded-xl bg-amber-700 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60 cursor-pointer">
                      {loading ? 'Setting watch…' : 'Confirm Subscription'}
                    </button>
                  </form>
                </div>
              )}

              {/* Active watches */}
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800">Your Active Watches</h2>
                <p className="text-sm text-slate-500 mb-4">We'll email you when these free up.</p>
                {watches.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No active table watches.</p>
                ) : (
                  <div className="space-y-3">
                    {watches.map((watch) => (
                      <div key={watch.id} className="rounded-xl border border-slate-150 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-800">Table {watch.tableNumber}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${watch.status === 'Notified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {watch.status}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          <p>Zone: {watch.zone} • Capacity: {watch.capacity}</p>
                          <p className="mt-1 text-slate-400">{new Date(watch.createdAt).toLocaleString()}</p>
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

  // ── Menu view ─────────────────────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <Header
            title={`Menu — Table ${selectedTable?.tableNumber}`}
            subtitle={`${selectedTable?.zone} · Capacity ${selectedTable?.capacity} guests`}
            back={() => { setView('tables'); setCart([]); }}
          />

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Dishes */}
            <div className="lg:col-span-2 space-y-8">
              {categories.map((cat) => (
                <div key={cat}>
                  <h3 className="mb-4 text-lg font-bold text-slate-700 border-b border-slate-200 pb-2">{cat}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {dishes.filter((d) => d.category === cat).map((dish) => {
                      const qty = cartQty(dish.id);
                      return (
                        <div key={dish.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between shadow-sm hover:-translate-y-0.5 transition">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-slate-800 leading-tight">{dish.name}</h4>
                              <span className="shrink-0 text-sm font-bold text-amber-700">{fmt(dish.price)}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 leading-relaxed">{dish.description}</p>
                          </div>
                          <div className="mt-4 flex items-center justify-end gap-2">
                            {qty > 0 ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => removeFromCart(dish.id)} className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-lg leading-none flex items-center justify-center hover:bg-slate-200 transition cursor-pointer">−</button>
                                <span className="text-sm font-semibold w-4 text-center">{qty}</span>
                                <button onClick={() => addToCart(dish)} className="w-7 h-7 rounded-full bg-amber-700 text-white font-bold text-lg leading-none flex items-center justify-center hover:bg-amber-800 transition cursor-pointer">+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(dish)} className="rounded-xl bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition cursor-pointer">
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {dishes.length === 0 && <p className="text-sm text-slate-400 italic">Loading menu…</p>}
            </div>

            {/* Cart */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-3xl border border-amber-200 bg-white/95 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 mb-4">🛒 Your Order</h2>
                {cart.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nothing added yet. Pick some dishes!</p>
                ) : (
                  <>
                    <div className="space-y-3 mb-4">
                      {cart.map((e) => (
                        <div key={e.dish.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center justify-center">{e.quantity}</span>
                            <span className="text-slate-700 truncate">{e.dish.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-slate-600">{fmt(e.dish.price * e.quantity)}</span>
                            <button onClick={() => removeFromCart(e.dish.id)} className="text-rose-400 hover:text-rose-600 text-xs cursor-pointer">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-800">
                      <span>Total</span>
                      <span>{fmt(total)}</span>
                    </div>
                    <button
                      onClick={() => setView('checkout')}
                      className="mt-4 w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 transition cursor-pointer"
                    >
                      Proceed to Checkout →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Checkout view ─────────────────────────────────────────────────────────────
  if (view === 'checkout') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
        <div className="mx-auto max-w-3xl">
          <Header
            title="Checkout"
            subtitle={`Table ${selectedTable?.tableNumber} · ${selectedTable?.zone}`}
            back={() => setView('menu')}
          />

          {payError && <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{payError}</div>}

          <div className="grid gap-8 md:grid-cols-2">
            {/* Order summary */}
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Order Summary</h2>
              <div className="space-y-3">
                {cart.map((e) => (
                  <div key={e.dish.id} className="flex justify-between text-sm">
                    <span className="text-slate-700">{e.dish.name} <span className="text-slate-400">×{e.quantity}</span></span>
                    <span className="font-medium text-slate-800">{fmt(e.dish.price * e.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span><span>{fmt(total)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax (10%)</span><span>{fmt(total * 0.1)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 text-base pt-1">
                  <span>Total</span><span>{fmt(total * 1.1)}</span>
                </div>
              </div>
            </div>

            {/* Payment form */}
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">💳 Payment Details</h2>
              <form onSubmit={handlePaySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Name on card</label>
                  <input
                    required
                    value={payForm.nameOnCard}
                    onChange={(e) => setPayForm({ ...payForm, nameOnCard: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Card number</label>
                  <input
                    required
                    value={payForm.cardNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                      const spaced = v.match(/.{1,4}/g)?.join(' ') ?? v;
                      setPayForm({ ...payForm, cardNumber: spaced });
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono tracking-widest"
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Expiry (MM/YY)</label>
                    <input
                      required
                      value={payForm.expiry}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
                        setPayForm({ ...payForm, expiry: v });
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono"
                      placeholder="MM/YY"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">CVV</label>
                    <input
                      required
                      value={payForm.cvv}
                      onChange={(e) => setPayForm({ ...payForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono"
                      placeholder="123"
                      maxLength={4}
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                  🔒 Demo checkout — no real charge is made.
                </div>

                <button
                  type="submit"
                  disabled={payLoading}
                  className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition cursor-pointer"
                >
                  {payLoading ? 'Processing…' : `Confirm & Pay ${fmt(total * 1.1)}`}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirmed view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900 flex items-center justify-center">
      <div className="mx-auto max-w-lg w-full">
        <div className="rounded-3xl border border-emerald-200 bg-white/95 p-8 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.2)] text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-emerald-800 mb-2">Order Confirmed!</h1>
          <p className="text-slate-600 mb-6">Your table and dishes are reserved. See you soon!</p>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Order ID</span>
              <span className="font-mono font-semibold text-slate-800">{confirmedOrder?.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Table</span>
              <span className="font-semibold text-slate-800">{confirmedOrder?.tableNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total paid</span>
              <span className="font-semibold text-emerald-700">{fmt((confirmedOrder?.totalAmount ?? 0) * 1.1)}</span>
            </div>
          </div>

          {confirmedOrder?.email && (
            <p className="text-sm text-slate-500 mb-6">
              📧 A confirmation has been sent to <strong>{confirmedOrder.email}</strong>
            </p>
          )}

          <button
            onClick={() => {
              setView('tables');
              setSelectedTable(null);
              setCart([]);
              setConfirmedOrder(null);
              setSuccessMsg(null);
            }}
            className="w-full rounded-xl bg-amber-700 py-3 text-sm font-semibold text-white hover:bg-amber-800 transition cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
