import React, { useEffect, useMemo, useState } from 'react';
import { authFetch, clearAuth } from './auth';

// ── Types ───────────────────────────────────────────────────────────────────

type TableStatus = 'Available' | 'Occupied' | 'Reserved';
type TableItem = { id: string; tableNumber: string; capacity: number; zone: string; status: TableStatus };
type ReservationItem = { id: string; guestName: string; partySize: number; time: string; tableId: string; status: string; phone: string; reminderSent?: boolean };
type WaitlistItem = { id: string; guestName: string; partySize: number; phone: string; position: number; quotedWaitMinutes: number; status: 'Waiting' | 'Notified' | 'Seated' };
type NotificationItem = { id: string; type: string; recipient: string; content: string; status: string; createdAt: string };
type TableWatchSummary = { tableId: string; tableNumber: string; waitingCount: number; notifiedCount: number };
type OrderItem = { dishName: string; quantity: number; unitPrice: number };
type OrderRecord = { id: string; guestName: string; email: string; tableNumber: string; partySize: number; totalAmount: number; status: string; paymentMethod: string; createdAt: string; items: OrderItem[] };
type DishStat = { dishName: string; totalOrdered: number; revenue: number };

// Inventory types
type Vendor = { id: string; name: string; phone: string; email: string; itemsSupplied: string };
type Ingredient = { id: string; name: string; unit: string; currentStock: number; minimumStock: number; costPerUnit: number; vendorId: string; vendorName?: string };
type StockEntry = { id: string; ingredientId: string; ingredientName: string; entryType: 'opening' | 'closing'; quantity: number; date: string; notes: string };
type Purchase = { id: string; vendorId: string; vendorName: string; ingredientId: string; ingredientName: string; quantity: number; unit: string; cost: number; purchaseDate: string };
type WastageLog = { id: string; ingredientId: string; ingredientName: string; quantity: number; unit: string; reason: string; cost: number; date: string };

// Analytics types
type MealPeriod = { period: string; orders: number; revenue: number; avgBill: number };
type DailyTrend = { date: string; orders: number; revenue: number };
type ZoneRevenue = { zone: string; orders: number; revenue: number; avgBill: number };
type DishRevenue = { dishName: string; totalOrdered: number; revenue: number; price: number; ingredientCost: number; contributionMargin: number };
type SalesAnalytics = {
  totals: { totalOrders: number; totalRevenue: number; avgBillValue: number };
  dishRevenue: DishRevenue[];
  topItems: DishRevenue[];
  lowItems: DishRevenue[];
  mealPeriods: MealPeriod[];
  dailyTrend: DailyTrend[];
  zoneRevenue: ZoneRevenue[];
  reservationAnalytics: { total: number; reserved: number; noShow: number; seated: number; avgPartySize: number };
  peakTime: string;
};
type InventoryAnalytics = {
  totalInventoryValue: number;
  lowStockItems: Ingredient[];
  reorderAlerts: Ingredient[];
  monthlyWastageCost: number;
  monthlyPurchaseCost: number;
  topConsumedIngredients: { name: string; consumption: number; unit: string }[];
  vendorPerformance: { vendorName: string; totalPurchases: number; totalCost: number }[];
  stockMovement: { date: string; openingTotal: number; closingTotal: number }[];
};

type ActiveTab = 'floor' | 'reservations' | 'waitlist' | 'orders' | 'inventory' | 'analytics';

const tabLabels: Record<ActiveTab, string> = {
  floor: '🏠 Floor Plan',
  reservations: '📅 Reservations',
  waitlist: '⏳ Waitlist',
  orders: '🧾 Orders',
  inventory: '📦 Inventory',
  analytics: '📊 Analytics',
};

const MEAL_PERIOD_COLORS: Record<string, string> = {
  Breakfast: 'bg-yellow-100 text-yellow-800',
  Lunch: 'bg-green-100 text-green-800',
  Snacks: 'bg-orange-100 text-orange-800',
  Dinner: 'bg-purple-100 text-purple-800',
  Other: 'bg-slate-100 text-slate-700',
};

function fmt(n: number) { return `₹${Number(n).toFixed(2)}`; }
function fmtPct(a: number, b: number) { return b === 0 ? '0%' : `${Math.round((a / b) * 100)}%`; }

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, tone, sub }: { label: string; value: string | number; tone: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function AlertBadge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">{children}</span>;
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('floor');

  // Existing state
  const [tables, setTables] = useState<TableItem[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tableWatches, setTableWatches] = useState<TableWatchSummary[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [dishStats, setDishStats] = useState<DishStat[]>([]);
  const [stats, setStats] = useState({ occupiedTables: 0, reservedTables: 0, pendingWaitlist: 0, occupancyRate: 0 });
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [clearMsg, setClearMsg] = useState<string | null>(null);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationForm, setReservationForm] = useState({ guestName: '', partySize: '2', time: '20:00', tableId: 'M2', phone: '', email: '' });
  const [walkInForm, setWalkInForm] = useState({ guestName: '', partySize: '2', phone: '' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  // Inventory state
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [wastageLogs, setWastageLogs] = useState<WastageLog[]>([]);
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
  const [invAnalytics, setInvAnalytics] = useState<InventoryAnalytics | null>(null);
  const [invSubTab, setInvSubTab] = useState<'overview' | 'stock' | 'purchases' | 'wastage' | 'vendors'>('overview');

  // Forms for inventory
  const today = new Date().toISOString().split('T')[0];
  const [ingForm, setIngForm] = useState({ name: '', unit: 'kg', currentStock: '0', minimumStock: '0', costPerUnit: '0', vendorId: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', email: '', itemsSupplied: '' });
  const [purchaseForm, setPurchaseForm] = useState({ vendorId: '', ingredientId: '', quantity: '', cost: '', purchaseDate: today });
  const [wastageForm, setWastageForm] = useState({ ingredientId: '', quantity: '', reason: '', cost: '', date: today });
  const [stockEntryForm, setStockEntryForm] = useState({ ingredientId: '', entryType: 'opening' as 'opening' | 'closing', quantity: '', date: today, notes: '' });
  const [showIngForm, setShowIngForm] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [invMsg, setInvMsg] = useState<string | null>(null);

  // Analytics state
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAnalytics | null>(null);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'sales' | 'menu' | 'reservations'>('sales');

  // ── Data fetching ────────────────────────────────────────────────────────

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
      if (payload.tables?.length) setSelectedTable((c) => c ?? payload.tables[0] ?? null);
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
    const op = await ordersRes.json().catch(() => ({}));
    const sp = await statsRes.json().catch(() => ({}));
    if (ordersRes.ok) setOrders(op.data ?? []);
    if (statsRes.ok) setDishStats(sp.data ?? []);
  };

  const refreshInventory = async () => {
    const [ingRes, venRes, purRes, wasRes, seRes, anaRes] = await Promise.all([
      authFetch('/api/v1/inventory/ingredients'),
      authFetch('/api/v1/inventory/vendors'),
      authFetch('/api/v1/inventory/purchases'),
      authFetch('/api/v1/inventory/wastage'),
      authFetch('/api/v1/inventory/stock-entries'),
      authFetch('/api/v1/inventory/analytics'),
    ]);
    const parse = async (r: Response) => { const d = await r.json().catch(() => ({})); return r.ok ? (d.data ?? d) : null; };
    const [ing, ven, pur, was, se, ana] = await Promise.all([parse(ingRes), parse(venRes), parse(purRes), parse(wasRes), parse(seRes), parse(anaRes)]);
    if (ing) setIngredients(ing);
    if (ven) setVendors(ven);
    if (pur) setPurchases(pur);
    if (was) setWastageLogs(was);
    if (se) setStockEntries(se);
    if (ana) setInvAnalytics(ana);
  };

  const refreshSalesAnalytics = async () => {
    const res = await authFetch('/api/v1/analytics/sales');
    const d = await res.json().catch(() => ({}));
    if (res.ok) setSalesAnalytics(d.data ?? null);
  };

  useEffect(() => { void refreshDashboard(); }, []);
  useEffect(() => {
    if (activeTab === 'orders') void refreshOrders();
    if (activeTab === 'inventory') void refreshInventory();
    if (activeTab === 'analytics') { void refreshOrders(); void refreshSalesAnalytics(); }
  }, [activeTab]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const watchMap = useMemo(() => {
    const m = new Map<string, TableWatchSummary>();
    for (const w of tableWatches) m.set(w.tableId, w);
    return m;
  }, [tableWatches]);

  const vendorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors) m.set(v.id, v.name);
    return m;
  }, [vendors]);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  const statusChip = (status: string) => {
    if (status === 'Available') return 'bg-emerald-100 text-emerald-800';
    if (status === 'Occupied') return 'bg-rose-100 text-rose-800';
    return 'bg-sky-100 text-sky-800';
  };

  const occupancyLabel = useMemo(() => {
    if (stats.occupancyRate >= 80) return 'Peak service';
    if (stats.occupancyRate >= 60) return 'Busy but balanced';
    return 'Comfortable flow';
  }, [stats.occupancyRate]);

  const totalOrderRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSeatTable = async (tableId: string) => {
    await authFetch(`/api/v1/tables/${tableId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Occupied' }) });
    setClearMsg(null); await refreshDashboard();
  };

  const handleClearTable = async (tableId: string) => {
    setClearMsg(null);
    const res = await authFetch(`/api/v1/tables/${tableId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Available' }) });
    const payload = await res.json().catch(() => ({}));
    const n: number = payload.notifiedCount ?? 0;
    setClearMsg(n > 0 ? `✅ Table cleared — ${n} customer${n > 1 ? 's' : ''} notified by email!` : '✅ Table cleared. No customers were watching this table.');
    await refreshDashboard();
  };

  const handleNotifyWaitlist = async (id: string) => { await authFetch(`/api/v1/waitlist/${id}/notify`, { method: 'POST' }); await refreshDashboard(); };
  const handleAssignSeating = async (id: string) => { await authFetch(`/api/v1/waitlist/${id}/assign`, { method: 'POST' }); await refreshDashboard(); };
  const handleMarkNoShow = async (id: string) => { await authFetch(`/api/v1/reservations/${id}/no-show`, { method: 'POST' }); await refreshDashboard(); };
  const handleSendReminders = async () => { await authFetch('/api/v1/reminders/send', { method: 'POST' }); await refreshDashboard(); };

  const handleCreateReservation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reservationForm.guestName.trim()) return;
    await authFetch('/api/v1/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestName: reservationForm.guestName, partySize: Number(reservationForm.partySize), time: reservationForm.time, tableId: reservationForm.tableId, phone: reservationForm.phone, email: reservationForm.email }) });
    setReservationForm({ guestName: '', partySize: '2', time: '20:00', tableId: 'M2', phone: '', email: '' });
    setShowReservationForm(false); setActiveTab('reservations'); await refreshDashboard();
  };

  const handleCreateWalkIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!walkInForm.guestName.trim()) return;
    await authFetch('/api/v1/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestName: walkInForm.guestName, partySize: Number(walkInForm.partySize), phone: walkInForm.phone }) });
    setWalkInForm({ guestName: '', partySize: '2', phone: '' }); setShowWalkInForm(false); setActiveTab('waitlist'); await refreshDashboard();
  };

  // Inventory handlers
  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok;
  };

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/inventory/ingredients', { name: ingForm.name, unit: ingForm.unit, currentStock: Number(ingForm.currentStock), minimumStock: Number(ingForm.minimumStock), costPerUnit: Number(ingForm.costPerUnit), vendorId: ingForm.vendorId });
    if (ok) { setIngForm({ name: '', unit: 'kg', currentStock: '0', minimumStock: '0', costPerUnit: '0', vendorId: '' }); setShowIngForm(false); setInvMsg('✅ Ingredient added'); await refreshInventory(); }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/inventory/vendors', vendorForm);
    if (ok) { setVendorForm({ name: '', phone: '', email: '', itemsSupplied: '' }); setShowVendorForm(false); setInvMsg('✅ Vendor added'); await refreshInventory(); }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const ing = ingMap.get(purchaseForm.ingredientId);
    if (!ing) return;
    const ven = vendorMap.get(purchaseForm.vendorId) ?? '';
    const ok = await post('/api/v1/inventory/purchases', { vendorId: purchaseForm.vendorId, vendorName: ven, ingredientId: purchaseForm.ingredientId, ingredientName: ing.name, quantity: Number(purchaseForm.quantity), unit: ing.unit, cost: Number(purchaseForm.cost), purchaseDate: purchaseForm.purchaseDate });
    if (ok) { setPurchaseForm({ vendorId: '', ingredientId: '', quantity: '', cost: '', purchaseDate: today }); setInvMsg('✅ Purchase recorded & stock updated'); await refreshInventory(); }
  };

  const handleAddWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    const ing = ingMap.get(wastageForm.ingredientId);
    if (!ing) return;
    const ok = await post('/api/v1/inventory/wastage', { ingredientId: wastageForm.ingredientId, ingredientName: ing.name, quantity: Number(wastageForm.quantity), unit: ing.unit, reason: wastageForm.reason, cost: Number(wastageForm.cost), date: wastageForm.date });
    if (ok) { setWastageForm({ ingredientId: '', quantity: '', reason: '', cost: '', date: today }); setInvMsg('✅ Wastage logged & stock adjusted'); await refreshInventory(); }
  };

  const handleAddStockEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const ing = ingMap.get(stockEntryForm.ingredientId);
    if (!ing) return;
    const ok = await post('/api/v1/inventory/stock-entries', { ingredientId: stockEntryForm.ingredientId, ingredientName: ing.name, entryType: stockEntryForm.entryType, quantity: Number(stockEntryForm.quantity), date: stockEntryForm.date, notes: stockEntryForm.notes });
    if (ok) { setStockEntryForm({ ingredientId: '', entryType: 'opening', quantity: '', date: today, notes: '' }); setInvMsg(`✅ ${stockEntryForm.entryType === 'opening' ? 'Opening' : 'Closing'} stock recorded`); await refreshInventory(); }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-8 text-slate-900">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <header className="mb-8 rounded-3xl border border-amber-200/70 bg-white/90 p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">Manager Console</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">Restaurant Management</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Reservations · Waitlist · Inventory · Sales Analytics — all in one workspace.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleSendReminders} className="rounded-2xl border border-emerald-600/20 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 cursor-pointer">Send reminders</button>
              <button onClick={() => setShowWalkInForm(p => !p)} className="rounded-2xl border border-amber-600/20 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 cursor-pointer">{showWalkInForm ? 'Hide walk-in form' : '+ Walk-in entry'}</button>
              <button onClick={() => setShowReservationForm(p => !p)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showReservationForm ? 'Hide reservation form' : 'New reservation'}</button>
              <button onClick={() => { clearAuth(); window.location.href = '/login'; }} className="rounded-2xl border border-rose-600/20 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer">Sign out</button>
            </div>
          </div>
        </header>

        {/* KPI strip */}
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Occupied tables" value={stats.occupiedTables} tone="text-amber-700" />
          <StatCard label="Reserved tables" value={stats.reservedTables} tone="text-sky-700" />
          <StatCard label="Pending waitlist" value={stats.pendingWaitlist} tone="text-emerald-700" />
          <StatCard label="Occupancy" value={`${stats.occupancyRate}%`} tone="text-slate-800" sub={occupancyLabel} />
        </section>

        {/* Service pulse */}
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
              <div className="h-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${stats.occupancyRate}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-600">Managing {stats.occupiedTables} occupied tables and {stats.pendingWaitlist} guests waiting.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <p className="text-sm font-semibold text-slate-300">Quick overview</p>
            <h2 className="mt-2 text-xl font-semibold">Ready for service</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• Reservations & waitlist synced live</li>
              <li>• Inventory tracked with reorder alerts</li>
              <li>• Sales & menu performance analytics</li>
              <li>• Wastage, purchases & vendor management</li>
            </ul>
          </div>
        </section>

        {/* Tabs */}
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {(Object.keys(tabLabels) as ActiveTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition cursor-pointer ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
              {tabLabels[tab]}
              {tab === 'orders' && orders.length > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{orders.length}</span>}
              {tab === 'inventory' && (invAnalytics?.reorderAlerts?.length ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{invAnalytics!.reorderAlerts.length}</span>}
            </button>
          ))}
        </nav>

        {/* Walk-in & reservation forms */}
        {showWalkInForm && (
          <form onSubmit={handleCreateWalkIn} className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-amber-800">Walk-in / Waitlist Entry</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input value={walkInForm.guestName} onChange={e => setWalkInForm({ ...walkInForm, guestName: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Guest name" required />
              <input value={walkInForm.partySize} onChange={e => setWalkInForm({ ...walkInForm, partySize: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={walkInForm.phone} onChange={e => setWalkInForm({ ...walkInForm, phone: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
            </div>
            <div className="mt-3 flex justify-end"><button type="submit" className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 cursor-pointer">Add to waitlist</button></div>
          </form>
        )}

        {showReservationForm && (
          <form onSubmit={handleCreateReservation} className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-sky-800">New Reservation</p>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <input value={reservationForm.guestName} onChange={e => setReservationForm({ ...reservationForm, guestName: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 lg:col-span-2" placeholder="Guest name" required />
              <input value={reservationForm.partySize} onChange={e => setReservationForm({ ...reservationForm, partySize: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Party size" type="number" min="1" />
              <input value={reservationForm.time} onChange={e => setReservationForm({ ...reservationForm, time: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Time (HH:MM)" />
              <input value={reservationForm.phone} onChange={e => setReservationForm({ ...reservationForm, phone: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Phone" />
              <input value={reservationForm.email} onChange={e => setReservationForm({ ...reservationForm, email: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5" placeholder="Email (for reminder)" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-slate-600">Table:</label>
              <select value={reservationForm.tableId} onChange={e => setReservationForm({ ...reservationForm, tableId: e.target.value })} className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                {tables.map(t => <option key={t.id} value={t.id}>Table {t.tableNumber} ({t.zone}, {t.capacity} seats)</option>)}
              </select>
              <button type="submit" className="ml-auto rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 cursor-pointer">Save reservation</button>
            </div>
          </form>
        )}

        <main>

          {/* ══ FLOOR PLAN ══════════════════════════════════════════════════ */}
          {activeTab === 'floor' && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <SectionCard title="Live floor map" sub="Tap a table to manage it. Bell icons show customers waiting to be notified."
                action={<div className="flex gap-2 text-xs text-slate-500"><span className="rounded-full bg-emerald-100 px-2.5 py-1">Available</span><span className="rounded-full bg-rose-100 px-2.5 py-1">Occupied</span><span className="rounded-full bg-sky-100 px-2.5 py-1">Reserved</span></div>}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {tables.map((table) => {
                    const watch = watchMap.get(table.id);
                    const waitingCount = watch?.waitingCount ?? 0;
                    return (
                      <button key={table.id} onClick={() => { setSelectedTable(table); setClearMsg(null); }}
                        className={`rounded-2xl border p-5 text-left transition relative ${selectedTable?.id === table.id ? 'ring-2 ring-amber-400' : 'hover:-translate-y-0.5'} ${statusChip(table.status)}`}>
                        {waitingCount > 0 && <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">🔔 {waitingCount} waiting</span>}
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
              </SectionCard>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-800">Table controls</h2>
                {clearMsg && <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium border ${clearMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>{clearMsg}</div>}
                {selectedTable ? (
                  <div className="mt-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Selected table</p>
                      <h3 className="mt-1 text-2xl font-semibold text-slate-800">Table {selectedTable.tableNumber}</h3>
                      <p className="mt-2 text-sm text-slate-600">{selectedTable.zone} · {selectedTable.capacity} seats</p>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Current status</p>
                      <p className="mt-1 text-lg font-semibold text-slate-800">{selectedTable.status}</p>
                    </div>
                    {(() => { const w = watchMap.get(selectedTable.id); if (!w || (w.waitingCount === 0 && w.notifiedCount === 0)) return null; return (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <p className="font-semibold mb-1">🔔 Table watchers</p>
                        {w.waitingCount > 0 && <p>{w.waitingCount} customer{w.waitingCount > 1 ? 's' : ''} waiting</p>}
                        {w.notifiedCount > 0 && <p className="text-amber-600">{w.notifiedCount} already notified</p>}
                      </div>
                    ); })()}
                    <div className="mt-5 flex flex-col gap-2">
                      {selectedTable.status === 'Available' && <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer">Mark as occupied</button>}
                      {selectedTable.status === 'Reserved' && <button onClick={() => handleSeatTable(selectedTable.id)} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer">Confirm seating</button>}
                      {selectedTable.status === 'Occupied' && <button onClick={() => handleClearTable(selectedTable.id)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">Clear table</button>}
                    </div>
                  </div>
                ) : <p className="mt-8 text-center text-sm text-slate-500">Select a table to manage it.</p>}
              </div>
            </div>
          )}

          {/* ══ RESERVATIONS ════════════════════════════════════════════════ */}
          {activeTab === 'reservations' && (
            <div className="space-y-6">
              {/* Reservation Analytics */}
              {salesAnalytics && (
                <div className="grid gap-4 md:grid-cols-4">
                  <StatCard label="Total Reservations" value={salesAnalytics.reservationAnalytics.total ?? 0} tone="text-sky-700" />
                  <StatCard label="No-Shows" value={salesAnalytics.reservationAnalytics.noShow ?? 0} tone="text-rose-700" sub={`${fmtPct(salesAnalytics.reservationAnalytics.noShow ?? 0, salesAnalytics.reservationAnalytics.total ?? 1)} rate`} />
                  <StatCard label="Avg Party Size" value={(salesAnalytics.reservationAnalytics.avgPartySize ?? 0).toFixed(1)} tone="text-amber-700" />
                  <StatCard label="Peak Time" value={salesAnalytics.peakTime ?? '—'} tone="text-emerald-700" />
                </div>
              )}
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr><th className="p-4">Guest</th><th className="p-4">Party</th><th className="p-4">Time</th><th className="p-4">Table</th><th className="p-4">Phone</th><th className="p-4">Status</th><th className="p-4">Reminder</th><th className="p-4">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {reservations.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-4 font-semibold text-slate-800">{r.guestName}</td>
                        <td className="p-4">{r.partySize} guests</td>
                        <td className="p-4">{r.time}</td>
                        <td className="p-4 font-mono">{r.tableId}</td>
                        <td className="p-4 text-slate-500">{r.phone}</td>
                        <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === 'No-show' ? 'bg-rose-100 text-rose-800' : r.status === 'Seated' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{r.status}</span></td>
                        <td className="p-4"><span className={`text-xs font-medium ${r.reminderSent ? 'text-emerald-700' : 'text-slate-400'}`}>{r.reminderSent ? '✓ Sent' : 'Pending'}</span></td>
                        <td className="p-4">
                          {r.status === 'Reserved' && <button onClick={() => void handleMarkNoShow(r.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer">No-show</button>}
                        </td>
                      </tr>
                    ))}
                    {reservations.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-sm text-slate-400 italic">No reservations yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ WAITLIST ════════════════════════════════════════════════════ */}
          {activeTab === 'waitlist' && (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr><th className="p-4">Queue</th><th className="p-4">Guest</th><th className="p-4">Party size</th><th className="p-4">Wait</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {waitlist.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="p-4 font-semibold text-amber-700">#{entry.position}</td>
                      <td className="p-4 font-semibold text-slate-800">{entry.guestName}</td>
                      <td className="p-4">{entry.partySize} guests</td>
                      <td className="p-4 text-slate-500">~{entry.quotedWaitMinutes} mins</td>
                      <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === 'Notified' ? 'bg-amber-100 text-amber-800' : entry.status === 'Seated' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{entry.status}</span></td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          {entry.status === 'Waiting' && <button onClick={() => handleNotifyWaitlist(entry.id)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer">Notify</button>}
                          {entry.status !== 'Seated' && <button onClick={() => handleAssignSeating(entry.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">Assign seat</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {waitlist.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-slate-400 italic">No waitlist entries.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ ORDERS ══════════════════════════════════════════════════════ */}
          {activeTab === 'orders' && (
            <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Total Orders" value={orders.length} tone="text-slate-800" />
                <StatCard label="Total Revenue" value={fmt(totalOrderRevenue)} tone="text-emerald-700" />
                <StatCard label="Avg Bill" value={orders.length > 0 ? fmt(totalOrderRevenue / orders.length) : '₹0'} tone="text-amber-700" />
              </div>
              <SectionCard title="Dish order counts" sub="Total quantities ordered across all orders." action={<button onClick={() => void refreshOrders()} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 cursor-pointer">Refresh</button>}>
                {dishStats.length === 0 ? <p className="text-sm text-slate-400 italic">No orders placed yet.</p> : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {dishStats.map(d => (
                      <div key={d.dishName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800 leading-tight">{d.dishName}</span>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">×{d.totalOrdered}</span>
                        </div>
                        <p className="mt-2 text-sm text-emerald-700 font-medium">{fmt(d.revenue)} revenue</p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(100, (d.totalOrdered / Math.max(...dishStats.map(x => x.totalOrdered))) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Customer orders" sub={`${orders.length} order${orders.length !== 1 ? 's' : ''} · Total: ${fmt(totalOrderRevenue)}`}>
                {orders.length === 0 ? <p className="text-sm text-slate-400 italic">No orders yet.</p> : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{order.guestName}</span>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">{order.status}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">Table {order.tableNumber} · {order.partySize} guests · {new Date(order.createdAt).toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{order.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-700">{fmt(order.totalAmount)}</p>
                            <p className="text-xs text-slate-400 capitalize">{order.paymentMethod}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.items.map((item, i) => (
                            <span key={i} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">{item.dishName} <span className="text-slate-400">×{item.quantity}</span></span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* ══ INVENTORY (MODULE 2) ════════════════════════════════════════ */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {invMsg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex items-center justify-between">
                  {invMsg}
                  <button onClick={() => setInvMsg(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer text-lg leading-none">×</button>
                </div>
              )}

              {/* Inventory sub-tabs */}
              <nav className="flex flex-wrap gap-2">
                {(['overview', 'stock', 'purchases', 'wastage', 'vendors'] as const).map(t => (
                  <button key={t} onClick={() => setInvSubTab(t)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize cursor-pointer transition ${invSubTab === t ? 'bg-amber-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {t === 'overview' ? '📊 Dashboard' : t === 'stock' ? '📋 Stock Entries' : t === 'purchases' ? '🛒 Purchases' : t === 'wastage' ? '🗑️ Wastage' : '🏪 Vendors'}
                  </button>
                ))}
                <button onClick={() => void refreshInventory()} className="ml-auto rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">↻ Refresh</button>
              </nav>

              {/* Inventory Overview / Analytics Dashboard */}
              {invSubTab === 'overview' && invAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Inventory Value" value={fmt(invAnalytics.totalInventoryValue)} tone="text-emerald-700" />
                    <StatCard label="Low Stock Items" value={invAnalytics.lowStockItems.length} tone={invAnalytics.lowStockItems.length > 0 ? 'text-rose-700' : 'text-slate-700'} />
                    <StatCard label="Monthly Wastage Cost" value={fmt(invAnalytics.monthlyWastageCost)} tone="text-rose-700" />
                    <StatCard label="Monthly Purchase Cost" value={fmt(invAnalytics.monthlyPurchaseCost)} tone="text-amber-700" />
                  </div>

                  {/* Reorder Alerts */}
                  {invAnalytics.reorderAlerts.length > 0 && (
                    <SectionCard title="🚨 Reorder Alerts" sub="Ingredients below minimum stock level — reorder immediately.">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {invAnalytics.reorderAlerts.map(i => (
                          <div key={i.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-rose-800">{i.name}</span>
                              <AlertBadge>LOW STOCK</AlertBadge>
                            </div>
                            <p className="text-sm text-rose-700">Current: <strong>{i.currentStock} {i.unit}</strong></p>
                            <p className="text-sm text-rose-600">Minimum: {i.minimumStock} {i.unit}</p>
                            {i.vendorName && <p className="mt-2 text-xs text-rose-500">Supplier: {i.vendorName}</p>}
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {/* Current Stock Overview */}
                  <SectionCard title="Current Stock Overview" sub="All ingredients with current levels and inventory value.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                          <tr><th className="p-3">Ingredient</th><th className="p-3">Unit</th><th className="p-3">Current Stock</th><th className="p-3">Min Stock</th><th className="p-3">Cost/Unit</th><th className="p-3">Stock Value</th><th className="p-3">Vendor</th><th className="p-3">Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {ingredients.map(i => (
                            <tr key={i.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">{i.name}</td>
                              <td className="p-3 text-slate-500">{i.unit}</td>
                              <td className="p-3 font-semibold">{i.currentStock}</td>
                              <td className="p-3 text-slate-500">{i.minimumStock}</td>
                              <td className="p-3">{fmt(i.costPerUnit)}</td>
                              <td className="p-3 text-emerald-700 font-medium">{fmt(i.currentStock * i.costPerUnit)}</td>
                              <td className="p-3 text-slate-500 text-xs">{i.vendorName || '—'}</td>
                              <td className="p-3">{i.currentStock < i.minimumStock ? <AlertBadge>Reorder</AlertBadge> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">OK</span>}</td>
                            </tr>
                          ))}
                          {ingredients.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">No ingredients added yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>

                  {/* Top Consumed + Vendor Performance */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    <SectionCard title="Top Consumed Ingredients" sub="This month based on opening vs closing stock entries.">
                      {invAnalytics.topConsumedIngredients.length === 0 ? <p className="text-sm text-slate-400 italic">Add stock entries to see consumption.</p> : (
                        <div className="space-y-3">
                          {invAnalytics.topConsumedIngredients.map((i, idx) => (
                            <div key={i.name} className="flex items-center gap-3">
                              <span className="w-6 text-center text-sm font-bold text-amber-700">#{idx + 1}</span>
                              <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium text-slate-800">{i.name}</span>
                                  <span className="text-slate-500">{i.consumption.toFixed(2)} {i.unit}</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                  <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, (i.consumption / (invAnalytics.topConsumedIngredients[0]?.consumption || 1)) * 100)}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                    <SectionCard title="Vendor Performance" sub="Total purchases and spend by supplier.">
                      {invAnalytics.vendorPerformance.length === 0 ? <p className="text-sm text-slate-400 italic">No purchases recorded yet.</p> : (
                        <div className="space-y-3">
                          {invAnalytics.vendorPerformance.map(v => (
                            <div key={v.vendorName} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div>
                                <p className="font-semibold text-slate-800">{v.vendorName}</p>
                                <p className="text-xs text-slate-500">{v.totalPurchases} purchase{v.totalPurchases !== 1 ? 's' : ''}</p>
                              </div>
                              <span className="text-sm font-bold text-emerald-700">{fmt(v.totalCost)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  {/* Stock Movement Trend */}
                  {invAnalytics.stockMovement.length > 0 && (
                    <SectionCard title="Stock Movement Trend" sub="Opening vs closing stock totals by date.">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                            <tr><th className="p-3">Date</th><th className="p-3">Opening Total</th><th className="p-3">Closing Total</th><th className="p-3">Consumed</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invAnalytics.stockMovement.map(s => (
                              <tr key={s.date} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-700">{s.date}</td>
                                <td className="p-3 text-sky-700">{s.openingTotal.toFixed(2)}</td>
                                <td className="p-3 text-amber-700">{s.closingTotal.toFixed(2)}</td>
                                <td className="p-3 font-semibold text-emerald-700">{Math.max(0, s.openingTotal - s.closingTotal).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  )}

                  {/* Add Ingredient */}
                  <div>
                    <button onClick={() => setShowIngForm(p => !p)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showIngForm ? 'Hide form' : '+ Add Ingredient'}</button>
                    {showIngForm && (
                      <form onSubmit={handleAddIngredient} className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                        <p className="font-semibold text-slate-700">New Ingredient</p>
                        <div className="grid gap-3 md:grid-cols-3">
                          <input required value={ingForm.name} onChange={e => setIngForm({ ...ingForm, name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Name (e.g. Chicken)" />
                          <select value={ingForm.unit} onChange={e => setIngForm({ ...ingForm, unit: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                            {['kg', 'g', 'L', 'mL', 'pieces', 'bags', 'boxes'].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <input type="number" min="0" step="0.01" value={ingForm.currentStock} onChange={e => setIngForm({ ...ingForm, currentStock: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Current stock" />
                          <input type="number" min="0" step="0.01" value={ingForm.minimumStock} onChange={e => setIngForm({ ...ingForm, minimumStock: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Minimum stock (reorder level)" />
                          <input type="number" min="0" step="0.01" value={ingForm.costPerUnit} onChange={e => setIngForm({ ...ingForm, costPerUnit: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Cost per unit (₹)" />
                          <select value={ingForm.vendorId} onChange={e => setIngForm({ ...ingForm, vendorId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                            <option value="">Select vendor (optional)</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-end"><button type="submit" className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 cursor-pointer">Add Ingredient</button></div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* Stock Entries Tab */}
              {invSubTab === 'stock' && (
                <div className="space-y-6">
                  <SectionCard title="Record Opening / Closing Stock" sub="Use this daily to track stock movement and calculate consumption.">
                    <form onSubmit={handleAddStockEntry} className="grid gap-3 md:grid-cols-5">
                      <select required value={stockEntryForm.ingredientId} onChange={e => setStockEntryForm({ ...stockEntryForm, ingredientId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select ingredient</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </select>
                      <select value={stockEntryForm.entryType} onChange={e => setStockEntryForm({ ...stockEntryForm, entryType: e.target.value as 'opening' | 'closing' })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="opening">Opening Stock (Morning)</option>
                        <option value="closing">Closing Stock (Night)</option>
                      </select>
                      <input required type="number" min="0" step="0.01" value={stockEntryForm.quantity} onChange={e => setStockEntryForm({ ...stockEntryForm, quantity: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Quantity" />
                      <input type="date" value={stockEntryForm.date} onChange={e => setStockEntryForm({ ...stockEntryForm, date: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Record Entry</button>
                    </form>
                    <input value={stockEntryForm.notes} onChange={e => setStockEntryForm({ ...stockEntryForm, notes: e.target.value })} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Notes (optional)" />
                  </SectionCard>

                  <SectionCard title="Stock Entry Log" sub="Opening & closing stock records with consumption calculation.">
                    {(() => {
                      // Group by date and ingredient, compute consumption
                      const byIngDate = new Map<string, { opening?: number; closing?: number; unit: string }>();
                      for (const se of stockEntries) {
                        const key = `${se.date}__${se.ingredientName}`;
                        const existing = byIngDate.get(key) ?? { unit: '' };
                        if (se.entryType === 'opening') existing.opening = se.quantity;
                        if (se.entryType === 'closing') existing.closing = se.quantity;
                        byIngDate.set(key, existing);
                      }
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <tr><th className="p-3">Date</th><th className="p-3">Ingredient</th><th className="p-3">Type</th><th className="p-3">Quantity</th><th className="p-3">Notes</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {stockEntries.map(se => (
                                <tr key={se.id} className="hover:bg-slate-50">
                                  <td className="p-3 text-slate-700">{se.date}</td>
                                  <td className="p-3 font-semibold text-slate-800">{se.ingredientName}</td>
                                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${se.entryType === 'opening' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{se.entryType === 'opening' ? 'Opening' : 'Closing'}</span></td>
                                  <td className="p-3 font-medium">{se.quantity}</td>
                                  <td className="p-3 text-slate-500 text-xs">{se.notes || '—'}</td>
                                </tr>
                              ))}
                              {stockEntries.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No stock entries yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </SectionCard>
                </div>
              )}

              {/* Purchases Tab */}
              {invSubTab === 'purchases' && (
                <div className="space-y-6">
                  <SectionCard title="Record Purchase" sub="Log every ingredient purchased from a supplier.">
                    <form onSubmit={handleAddPurchase} className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                      <select required value={purchaseForm.ingredientId} onChange={e => setPurchaseForm({ ...purchaseForm, ingredientId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 lg:col-span-2">
                        <option value="">Select ingredient</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </select>
                      <select value={purchaseForm.vendorId} onChange={e => setPurchaseForm({ ...purchaseForm, vendorId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select vendor</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <input required type="number" min="0" step="0.01" value={purchaseForm.quantity} onChange={e => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Quantity" />
                      <input required type="number" min="0" step="0.01" value={purchaseForm.cost} onChange={e => setPurchaseForm({ ...purchaseForm, cost: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Total cost (₹)" />
                      <input type="date" value={purchaseForm.purchaseDate} onChange={e => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 cursor-pointer lg:col-span-6">Record Purchase & Update Stock</button>
                    </form>
                  </SectionCard>

                  <SectionCard title="Purchase History" sub="All ingredient purchases with vendor and cost details.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Date</th><th className="p-3">Ingredient</th><th className="p-3">Vendor</th><th className="p-3">Quantity</th><th className="p-3">Cost</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {purchases.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-700">{p.purchaseDate}</td>
                              <td className="p-3 font-semibold text-slate-800">{p.ingredientName}</td>
                              <td className="p-3 text-slate-600">{p.vendorName || '—'}</td>
                              <td className="p-3">{p.quantity} {p.unit}</td>
                              <td className="p-3 font-semibold text-emerald-700">{fmt(p.cost)}</td>
                            </tr>
                          ))}
                          {purchases.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No purchases recorded yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* Wastage Tab */}
              {invSubTab === 'wastage' && (
                <div className="space-y-6">
                  <SectionCard title="Log Wastage" sub="Record spoiled, expired, or damaged ingredients.">
                    <form onSubmit={handleAddWastage} className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                      <select required value={wastageForm.ingredientId} onChange={e => setWastageForm({ ...wastageForm, ingredientId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 lg:col-span-2">
                        <option value="">Select ingredient</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </select>
                      <input required type="number" min="0" step="0.01" value={wastageForm.quantity} onChange={e => setWastageForm({ ...wastageForm, quantity: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Quantity wasted" />
                      <select value={wastageForm.reason} onChange={e => setWastageForm({ ...wastageForm, reason: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select reason</option>
                        <option value="Expired">Expired</option>
                        <option value="Rotten">Rotten</option>
                        <option value="Burnt">Burnt</option>
                        <option value="Dropped / Damaged">Dropped / Damaged</option>
                        <option value="Over-cooked">Over-cooked</option>
                        <option value="Other">Other</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={wastageForm.cost} onChange={e => setWastageForm({ ...wastageForm, cost: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Estimated cost (₹)" />
                      <input type="date" value={wastageForm.date} onChange={e => setWastageForm({ ...wastageForm, date: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <button type="submit" className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 cursor-pointer lg:col-span-6">Log Wastage & Deduct Stock</button>
                    </form>
                  </SectionCard>

                  <SectionCard title="Wastage Report" sub="All logged wastage incidents with reason and cost.">
                    <div className="mb-4 flex items-center gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                      <span className="text-rose-700 font-medium">Total wastage cost:</span>
                      <span className="text-rose-800 font-bold text-lg">{fmt(wastageLogs.reduce((s, w) => s + w.cost, 0))}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Date</th><th className="p-3">Ingredient</th><th className="p-3">Quantity</th><th className="p-3">Reason</th><th className="p-3">Cost</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {wastageLogs.map(w => (
                            <tr key={w.id} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-700">{w.date}</td>
                              <td className="p-3 font-semibold text-slate-800">{w.ingredientName}</td>
                              <td className="p-3">{w.quantity} {w.unit}</td>
                              <td className="p-3"><span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">{w.reason || '—'}</span></td>
                              <td className="p-3 font-semibold text-rose-700">{fmt(w.cost)}</td>
                            </tr>
                          ))}
                          {wastageLogs.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No wastage logged yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* Vendors Tab */}
              {invSubTab === 'vendors' && (
                <div className="space-y-6">
                  <div>
                    <button onClick={() => setShowVendorForm(p => !p)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showVendorForm ? 'Hide form' : '+ Add Vendor'}</button>
                    {showVendorForm && (
                      <form onSubmit={handleAddVendor} className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="mb-3 font-semibold text-slate-700">New Vendor / Supplier</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input required value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Vendor name" />
                          <input value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Phone number" />
                          <input value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Email" type="email" />
                          <input value={vendorForm.itemsSupplied} onChange={e => setVendorForm({ ...vendorForm, itemsSupplied: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Items supplied (e.g. Chicken, Eggs, Milk)" />
                        </div>
                        <div className="mt-3 flex justify-end"><button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Add Vendor</button></div>
                      </form>
                    )}
                  </div>

                  <SectionCard title="Vendor Directory" sub="All suppliers with contact details and items they supply.">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {vendors.map(v => (
                        <div key={v.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-lg font-bold text-slate-800">{v.name}</p>
                          {v.phone && <p className="mt-1 text-sm text-slate-600">📞 {v.phone}</p>}
                          {v.email && <p className="text-sm text-slate-600">✉️ {v.email}</p>}
                          {v.itemsSupplied && <p className="mt-2 text-xs text-slate-500 font-medium">Supplies: {v.itemsSupplied}</p>}
                        </div>
                      ))}
                      {vendors.length === 0 && <p className="text-sm text-slate-400 italic col-span-3">No vendors added yet.</p>}
                    </div>
                  </SectionCard>
                </div>
              )}
            </div>
          )}

          {/* ══ ANALYTICS (MODULE 3) ════════════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Analytics sub-tabs */}
              <nav className="flex flex-wrap gap-2">
                {(['sales', 'menu', 'reservations'] as const).map(t => (
                  <button key={t} onClick={() => setAnalyticsSubTab(t)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize cursor-pointer transition ${analyticsSubTab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {t === 'sales' ? '💰 Sales & Revenue' : t === 'menu' ? '🍽️ Menu Performance' : '📅 Reservation Analytics'}
                  </button>
                ))}
                <button onClick={() => { void refreshSalesAnalytics(); void refreshOrders(); }} className="ml-auto rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">↻ Refresh</button>
              </nav>

              {/* Sales & Revenue */}
              {analyticsSubTab === 'sales' && (
                <div className="space-y-6">
                  {salesAnalytics ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-3">
                        <StatCard label="Total Revenue" value={fmt(salesAnalytics.totals.totalRevenue)} tone="text-emerald-700" />
                        <StatCard label="Total Orders" value={salesAnalytics.totals.totalOrders} tone="text-slate-800" />
                        <StatCard label="Avg Bill Value" value={fmt(salesAnalytics.totals.avgBillValue)} tone="text-amber-700" />
                      </div>

                      {/* Meal Period Analysis */}
                      <SectionCard title="Meal Period Analysis" sub="Revenue and order breakdown by time of day.">
                        {salesAnalytics.mealPeriods.length === 0 ? (
                          <p className="text-sm text-slate-400 italic">No orders yet. Place orders to see meal period analysis.</p>
                        ) : (
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {(['Breakfast', 'Lunch', 'Snacks', 'Dinner'] as const).map(period => {
                              const data = salesAnalytics.mealPeriods.find(m => m.period === period);
                              return (
                                <div key={period} className={`rounded-2xl p-4 border ${data ? '' : 'opacity-50'} bg-white border-slate-200`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MEAL_PERIOD_COLORS[period]}`}>{period}</span>
                                    <span className="text-xs text-slate-500">{period === 'Breakfast' ? '6–11am' : period === 'Lunch' ? '11am–3pm' : period === 'Snacks' ? '3–6pm' : '6–11pm'}</span>
                                  </div>
                                  <p className="text-2xl font-bold text-slate-800 mt-2">{data ? fmt(data.revenue) : '₹0'}</p>
                                  <p className="text-sm text-slate-500">{data ? `${data.orders} orders` : 'No orders'}</p>
                                  <p className="text-xs text-slate-400 mt-1">Avg bill: {data ? fmt(data.avgBill) : '—'}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </SectionCard>

                      {/* Table Area Performance */}
                      <SectionCard title="Table Area Performance" sub="Revenue and orders grouped by seating zone.">
                        {salesAnalytics.zoneRevenue.length === 0 ? (
                          <p className="text-sm text-slate-400 italic">No order-zone data yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Area</th><th className="p-3">Orders</th><th className="p-3">Revenue</th><th className="p-3">Avg Bill</th><th className="p-3">Revenue Share</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {salesAnalytics.zoneRevenue.map(z => (
                                  <tr key={z.zone} className="hover:bg-slate-50">
                                    <td className="p-3 font-semibold text-slate-800">{z.zone}</td>
                                    <td className="p-3">{z.orders}</td>
                                    <td className="p-3 font-bold text-emerald-700">{fmt(z.revenue)}</td>
                                    <td className="p-3 text-amber-700">{fmt(z.avgBill)}</td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: fmtPct(z.revenue, salesAnalytics.totals.totalRevenue) }} />
                                        </div>
                                        <span className="text-xs text-slate-500 w-10">{fmtPct(z.revenue, salesAnalytics.totals.totalRevenue)}</span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </SectionCard>

                      {/* Daily Sales Trend */}
                      <SectionCard title="Daily Sales Trend" sub="Revenue and order volume over the last 30 days.">
                        {salesAnalytics.dailyTrend.length === 0 ? (
                          <p className="text-sm text-slate-400 italic">No order data for the last 30 days.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <tr><th className="p-3">Date</th><th className="p-3">Orders</th><th className="p-3">Revenue</th><th className="p-3">Bar</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {salesAnalytics.dailyTrend.map(d => (
                                  <tr key={String(d.date)} className="hover:bg-slate-50">
                                    <td className="p-3 text-slate-700">{String(d.date)}</td>
                                    <td className="p-3">{d.orders}</td>
                                    <td className="p-3 font-bold text-emerald-700">{fmt(d.revenue)}</td>
                                    <td className="p-3 w-40">
                                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                        <div className="h-2 rounded-full bg-amber-500" style={{ width: fmtPct(d.revenue, Math.max(...salesAnalytics.dailyTrend.map(x => x.revenue))) }} />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </SectionCard>
                    </>
                  ) : <p className="text-sm text-slate-400 italic p-6 text-center">Loading sales analytics…</p>}
                </div>
              )}

              {/* Menu Performance */}
              {analyticsSubTab === 'menu' && (
                <div className="space-y-6">
                  {salesAnalytics ? (
                    <>
                      {/* Top Performing */}
                      <SectionCard title="🏆 Top Performing Items" sub="Best-selling dishes by number of orders.">
                        {salesAnalytics.topItems.length === 0 ? <p className="text-sm text-slate-400 italic">No orders yet.</p> : (
                          <div className="space-y-3">
                            {salesAnalytics.topItems.map((d, idx) => (
                              <div key={d.dishName} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-sm font-bold">#{idx + 1}</span>
                                <div className="flex-1">
                                  <div className="flex justify-between">
                                    <span className="font-semibold text-slate-800">{d.dishName}</span>
                                    <span className="text-sm font-bold text-emerald-700">{fmt(d.revenue)}</span>
                                  </div>
                                  <p className="text-xs text-slate-500">{d.totalOrdered} orders sold</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>

                      {/* Low Performing */}
                      <SectionCard title="⚠️ Low Performing Items" sub="Dishes with the fewest orders — consider improving or removing.">
                        {salesAnalytics.lowItems.length === 0 ? <p className="text-sm text-slate-400 italic">No orders yet.</p> : (
                          <div className="space-y-3">
                            {salesAnalytics.lowItems.filter(d => d.totalOrdered > 0).map(d => (
                              <div key={d.dishName} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3">
                                <div className="flex-1">
                                  <div className="flex justify-between">
                                    <span className="font-semibold text-rose-800">{d.dishName}</span>
                                    <span className="text-sm text-rose-600">{d.totalOrdered} orders</span>
                                  </div>
                                  <p className="text-xs text-rose-500">Revenue: {fmt(d.revenue)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>

                      {/* Contribution Margin */}
                      <SectionCard title="Contribution Margin by Dish" sub="Selling price minus ingredient cost = profit contribution per dish.">
                        <p className="mb-4 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-200">
                          <strong>Formula:</strong> Contribution Margin = Selling Price − Ingredient Cost. A higher margin means more profit per plate.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <tr><th className="p-3">Dish</th><th className="p-3">Selling Price</th><th className="p-3">Ingredient Cost</th><th className="p-3">Contribution Margin</th><th className="p-3">Total Orders</th><th className="p-3">Total Revenue</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {salesAnalytics.dishRevenue.map(d => (
                                <tr key={d.dishName} className="hover:bg-slate-50">
                                  <td className="p-3 font-semibold text-slate-800">{d.dishName}</td>
                                  <td className="p-3 text-slate-700">{fmt(d.price)}</td>
                                  <td className="p-3 text-rose-600">{fmt(d.ingredientCost)}</td>
                                  <td className="p-3">
                                    <span className={`font-bold ${d.contributionMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(d.contributionMargin)}</span>
                                    <span className="ml-1 text-xs text-slate-400">({d.price > 0 ? Math.round((d.contributionMargin / d.price) * 100) : 0}%)</span>
                                  </td>
                                  <td className="p-3">{d.totalOrdered}</td>
                                  <td className="p-3 font-semibold text-emerald-700">{fmt(d.revenue)}</td>
                                </tr>
                              ))}
                              {salesAnalytics.dishRevenue.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 italic">No dish sales data yet.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>
                    </>
                  ) : <p className="text-sm text-slate-400 italic p-6 text-center">Loading menu analytics…</p>}
                </div>
              )}

              {/* Reservation Analytics */}
              {analyticsSubTab === 'reservations' && (
                <div className="space-y-6">
                  {salesAnalytics ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard label="Total Reservations" value={salesAnalytics.reservationAnalytics.total ?? 0} tone="text-sky-700" />
                        <StatCard label="No-Shows" value={salesAnalytics.reservationAnalytics.noShow ?? 0} tone="text-rose-700" sub={`${fmtPct(salesAnalytics.reservationAnalytics.noShow ?? 0, salesAnalytics.reservationAnalytics.total ?? 1)} no-show rate`} />
                        <StatCard label="Avg Party Size" value={(salesAnalytics.reservationAnalytics.avgPartySize ?? 0).toFixed(1)} tone="text-amber-700" />
                        <StatCard label="Peak Booking Time" value={salesAnalytics.peakTime ?? '—'} tone="text-emerald-700" />
                      </div>

                      <SectionCard title="Table Occupancy Overview" sub="Current real-time table status breakdown.">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                            <p className="text-4xl font-bold text-rose-700">{stats.occupiedTables}</p>
                            <p className="text-sm text-rose-600 mt-1">Occupied</p>
                          </div>
                          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center">
                            <p className="text-4xl font-bold text-sky-700">{stats.reservedTables}</p>
                            <p className="text-sm text-sky-600 mt-1">Reserved</p>
                          </div>
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                            <p className="text-4xl font-bold text-emerald-700">{tables.length - stats.occupiedTables - stats.reservedTables}</p>
                            <p className="text-sm text-emerald-600 mt-1">Available</p>
                          </div>
                        </div>
                        <div className="mt-4 h-4 rounded-full bg-slate-100 overflow-hidden flex">
                          <div className="h-4 bg-rose-400" style={{ width: fmtPct(stats.occupiedTables, tables.length || 1) }} title="Occupied" />
                          <div className="h-4 bg-sky-400" style={{ width: fmtPct(stats.reservedTables, tables.length || 1) }} title="Reserved" />
                          <div className="h-4 bg-emerald-400" style={{ width: fmtPct(Math.max(0, tables.length - stats.occupiedTables - stats.reservedTables), tables.length || 1) }} title="Available" />
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />Occupied</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-sky-400 inline-block" />Reserved</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />Available</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-700">Overall occupancy: {stats.occupancyRate}% · {tables.length} total tables</p>
                      </SectionCard>

                      <SectionCard title="Recent Notifications" sub="Email and WhatsApp notification log.">
                        {notifications.length === 0 ? <p className="text-sm text-slate-400 italic">No notifications yet.</p> : (
                          <ul className="space-y-3 text-sm text-slate-600">
                            {notifications.map(n => (
                              <li key={n.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-800 uppercase text-xs">{n.type}</span>
                                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${n.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{n.status}</span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{n.recipient}</div>
                                <div className="mt-1 text-slate-600 truncate">{n.content.split('\n')[0]}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </SectionCard>
                    </>
                  ) : <p className="text-sm text-slate-400 italic p-6 text-center">Loading reservation analytics…</p>}
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
