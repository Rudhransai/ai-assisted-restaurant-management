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

// Staff types
type Employee = { id: string; employeeCode: string; fullName: string; role: string; phoneNumber: string; status: 'Active' | 'Inactive' };
type Shift = { id: string; shiftName: string; startTime: string; endTime: string; breakMinutes: number; shiftHours: number };
type ShiftSchedule = { id: string; employeeId: string; employeeName: string; shiftId: string; shiftName: string; shiftDate: string; assignedBy: string; remarks: string };
type EmployeeAvailability = { id: string; employeeId: string; employeeName: string; availableFrom: string; availableTo: string; status: 'Available' | 'Unavailable'; remarks: string };
type LeaveRequest = { id: string; employeeId: string; employeeName: string; leaveType: string; startDate: string; endDate: string; reason: string; status: 'Pending' | 'Approved' | 'Rejected'; approvedBy: string };
type AttendanceRecord = { id: string; employeeId: string; employeeName: string; attendanceDate: string; checkIn: string; checkOut: string; breakMinutes: number; workingHours: number; overtimeHours: number; lateMinutes: number; attendanceStatus: string; markedBy: string; shiftName?: string; shiftStartTime?: string };
type PayrollSummary = { id: string; employeeId: string; employeeName: string; month: string; workingDays: number; workingHours: number; overtimeHours: number; leaveDays: number; generatedOn: string };
type StaffAnalytics = { totalEmployees: number; activeEmployees: number; todayAttendance: { present: number; absent: number; on_leave: number }; pendingLeaveRequests: number; avgWorkingHoursThisMonth: number; topLateArrivals: { name: string; total_late: number }[] };

// Module 5 – Customer Feedback
type FeedbackCustomer = { id: string; name: string; email: string; phone: string; createdAt: string };
type FeedbackItem = { id: string; customerId: string; customerName: string; reviewText: string; rating: number; source: string; reviewDate: string; sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; confidenceScore: number; categories: string[]; createdAt: string };
type FeedbackCategory = { id: string; categoryName: string };
type WeeklySummary = { id: string; weekStart: string; weekEnd: string; totalReviews: number; positiveReviews: number; neutralReviews: number; negativeReviews: number; averageRating: number; topCategory: string; trendingMetric: string; generatedAt: string };
type FeedbackAnalytics = {
  totalReviews: number; averageRating: number;
  positiveCount: number; neutralCount: number; negativeCount: number;
  positivePercent: number; neutralPercent: number; negativePercent: number;
  recentReviews: FeedbackItem[]; reviewGrowthPercent: number;
  ratingDistribution: { rating: number; count: number }[];
  reviewsBySource: { source: string; count: number; avgRating: number }[];
  reviewsByCustomer: { customerName: string; count: number; avgRating: number }[];
  categoryDistribution: { categoryName: string; count: number; avgRating: number }[];
  topCategory: string; leastCategory: string;
  monthlyReviews: { month: string; count: number; avgRating: number }[];
  weeklyReviews: { week: string; count: number }[];
  ratingTrend: { month: string; avgRating: number }[];
  sentimentTrend: { month: string; positive: number; negative: number; neutral: number }[];
  peakReviewDays: { dayName: string; count: number }[];
  categoryTrend: { month: string; categoryName: string; count: number }[];
  topImprovingCategory: string; topDecliningCategory: string;
  monthlySatisfaction: { month: string; positive: number; neutral: number; negative: number; total: number }[];
  reputationScore: number; ratingTrendDirection: 'up' | 'down' | 'stable';
  oneStarCount: number; fiveStarCount: number; negativeGrowthPercent: number;
};

type ActiveTab = 'floor' | 'reservations' | 'waitlist' | 'orders' | 'inventory' | 'analytics' | 'staff' | 'feedback';

const tabLabels: Record<ActiveTab, string> = {
  floor: '🏠 Floor Plan',
  reservations: '📅 Reservations',
  waitlist: '⏳ Waitlist',
  orders: '🧾 Orders',
  inventory: '📦 Inventory',
  analytics: '📊 Analytics',
  staff: '👥 Staff',
  feedback: '💬 Feedback',
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

  // Staff state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftSchedule, setShiftSchedule] = useState<ShiftSchedule[]>([]);
  const [availability, setAvailability] = useState<EmployeeAvailability[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payroll, setPayroll] = useState<PayrollSummary[]>([]);
  const [staffAnalytics, setStaffAnalytics] = useState<StaffAnalytics | null>(null);
  const [staffSubTab, setStaffSubTab] = useState<'overview' | 'roster' | 'availability' | 'leave' | 'attendance' | 'payroll'>('overview');
  const [staffMsg, setStaffMsg] = useState<string | null>(null);
  // Staff forms
  const [empForm, setEmpForm] = useState({ employeeCode: '', fullName: '', role: 'Waitstaff', phoneNumber: '' });
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({ shiftName: '', startTime: '09:00', endTime: '17:00', breakMinutes: '60' });
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ employeeId: '', shiftId: '', shiftDate: today, remarks: '' });
  const [availForm, setAvailForm] = useState({ employeeId: '', availableFrom: today, availableTo: today, status: 'Available' as 'Available' | 'Unavailable', remarks: '' });
  const [leaveForm, setLeaveForm] = useState({ employeeId: '', leaveType: 'Sick Leave', startDate: today, endDate: today, reason: '' });
  const [attForm, setAttForm] = useState({ employeeId: '', attendanceDate: today, checkIn: '09:00', checkOut: '17:00', breakMinutes: '60', attendanceStatus: 'Present' as 'Present' | 'Absent' | 'Leave' | 'Half-Day', shiftId: '' });
  const [payrollMonth, setPayrollMonth] = useState(today.slice(0, 7));

  // Feedback state (Module 5)
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackAnalytics, setFeedbackAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [feedbackCustomers, setFeedbackCustomers] = useState<FeedbackCustomer[]>([]);
  const [feedbackCategories, setFeedbackCategories] = useState<FeedbackCategory[]>([]);
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [feedbackSubTab, setFeedbackSubTab] = useState<'overview' | 'reviews' | 'sentiment' | 'categories' | 'trends' | 'satisfaction' | 'reputation' | 'weekly'>('overview');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackForm, setFeedbackForm] = useState({ customerName: '', reviewText: '', rating: '5', source: 'Google', reviewDate: today });
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

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

  const refreshStaff = async () => {
    const parse = async (r: Response) => { const d = await r.json().catch(() => ({})); return r.ok ? (d.data ?? d) : null; };
    const [empRes, shiftRes, schedRes, availRes, leaveRes, attRes, payRes, anaRes] = await Promise.all([
      authFetch('/api/v1/staff/employees'),
      authFetch('/api/v1/staff/shifts'),
      authFetch('/api/v1/staff/schedule'),
      authFetch('/api/v1/staff/availability'),
      authFetch('/api/v1/staff/leave'),
      authFetch('/api/v1/staff/attendance'),
      authFetch('/api/v1/staff/payroll'),
      authFetch('/api/v1/staff/analytics'),
    ]);
    const [emp, sh, sc, av, lv, at, py, an] = await Promise.all([
      parse(empRes), parse(shiftRes), parse(schedRes), parse(availRes),
      parse(leaveRes), parse(attRes), parse(payRes), parse(anaRes),
    ]);
    if (emp) setEmployees(emp);
    if (sh) setShifts(sh);
    if (sc) setShiftSchedule(sc);
    if (av) setAvailability(av);
    if (lv) setLeaveRequests(lv);
    if (at) setAttendance(at);
    if (py) setPayroll(py);
    if (an) setStaffAnalytics(an);
  };

  const refreshFeedback = async () => {
    const parse = async (r: Response) => { const d = await r.json().catch(() => ({})); return r.ok ? (d.data ?? d) : null; };
    const [fbRes, anaRes, custRes, catRes, wkRes] = await Promise.all([
      authFetch('/api/v1/feedback'),
      authFetch('/api/v1/feedback/analytics'),
      authFetch('/api/v1/feedback/customers'),
      authFetch('/api/v1/feedback/categories'),
      authFetch('/api/v1/feedback/weekly-summary'),
    ]);
    const [fb, ana, cust, cat, wk] = await Promise.all([parse(fbRes), parse(anaRes), parse(custRes), parse(catRes), parse(wkRes)]);
    if (fb) setFeedbackItems(fb);
    if (ana) setFeedbackAnalytics(ana);
    if (cust) setFeedbackCustomers(cust);
    if (cat) setFeedbackCategories(cat);
    if (wk) setWeeklySummaries(wk);
  };

  useEffect(() => { void refreshDashboard(); }, []);
  useEffect(() => {
    if (activeTab === 'orders') void refreshOrders();
    if (activeTab === 'inventory') void refreshInventory();
    if (activeTab === 'analytics') { void refreshOrders(); void refreshSalesAnalytics(); }
    if (activeTab === 'staff') void refreshStaff();
    if (activeTab === 'feedback') void refreshFeedback();
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

  // Staff handlers
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/employees', empForm);
    if (ok) { setEmpForm({ employeeCode: '', fullName: '', role: 'Waitstaff', phoneNumber: '' }); setShowEmpForm(false); setStaffMsg('✅ Employee added'); await refreshStaff(); }
  };
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/shifts', { ...shiftForm, breakMinutes: Number(shiftForm.breakMinutes) });
    if (ok) { setShiftForm({ shiftName: '', startTime: '09:00', endTime: '17:00', breakMinutes: '60' }); setShowShiftForm(false); setStaffMsg('✅ Shift created'); await refreshStaff(); }
  };
  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/schedule', scheduleForm);
    if (ok) { setScheduleForm({ employeeId: '', shiftId: '', shiftDate: today, remarks: '' }); setStaffMsg('✅ Shift assigned'); await refreshStaff(); }
  };
  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/availability', availForm);
    if (ok) { setAvailForm({ employeeId: '', availableFrom: today, availableTo: today, status: 'Available', remarks: '' }); setStaffMsg('✅ Availability recorded'); await refreshStaff(); }
  };
  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/leave', leaveForm);
    if (ok) { setLeaveForm({ employeeId: '', leaveType: 'Sick Leave', startDate: today, endDate: today, reason: '' }); setStaffMsg('✅ Leave request submitted'); await refreshStaff(); }
  };
  const handleLeaveAction = async (id: string, status: 'Approved' | 'Rejected') => {
    await authFetch(`/api/v1/staff/leave/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, approvedBy: 'Manager' }) });
    setStaffMsg(`✅ Leave ${status.toLowerCase()}`); await refreshStaff();
  };
  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post('/api/v1/staff/attendance', { ...attForm, breakMinutes: Number(attForm.breakMinutes) });
    if (ok) { setAttForm({ employeeId: '', attendanceDate: today, checkIn: '09:00', checkOut: '17:00', breakMinutes: '60', attendanceStatus: 'Present', shiftId: '' }); setStaffMsg('✅ Attendance marked'); await refreshStaff(); }
  };
  const handleGeneratePayroll = async () => {
    const ok = await post('/api/v1/staff/payroll/generate', { month: payrollMonth });
    if (ok) { setStaffMsg(`✅ Payroll generated for ${payrollMonth}`); await refreshStaff(); }
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

          {/* ══ STAFF & SCHEDULING (MODULE 4) ═══════════════════════════════ */}
          {activeTab === 'staff' && (
            <div className="space-y-6">
              {staffMsg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex items-center justify-between">
                  {staffMsg}
                  <button onClick={() => setStaffMsg(null)} className="ml-4 text-emerald-500 hover:text-emerald-700 cursor-pointer">✕</button>
                </div>
              )}

              {/* Staff sub-tabs */}
              <nav className="flex flex-wrap gap-2">
                {(['overview', 'roster', 'availability', 'leave', 'attendance', 'payroll'] as const).map(t => (
                  <button key={t} onClick={() => setStaffSubTab(t)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize cursor-pointer transition ${staffSubTab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {t === 'overview' ? '📊 Overview' : t === 'roster' ? '📋 Shift Roster' : t === 'availability' ? '🗓️ Availability' : t === 'leave' ? '🏖️ Leave' : t === 'attendance' ? '✅ Attendance' : '💰 Payroll'}
                  </button>
                ))}
                <button onClick={() => void refreshStaff()} className="ml-auto rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">↻ Refresh</button>
              </nav>

              {/* ─ Overview ─ */}
              {staffSubTab === 'overview' && (
                <div className="space-y-6">
                  {staffAnalytics && (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <StatCard label="Total Employees" value={staffAnalytics.totalEmployees} tone="text-slate-800" />
                      <StatCard label="Active Employees" value={staffAnalytics.activeEmployees} tone="text-emerald-700" />
                      <StatCard label="Today — Present" value={staffAnalytics.todayAttendance.present} tone="text-sky-700" sub={`Absent: ${staffAnalytics.todayAttendance.absent} · On Leave: ${staffAnalytics.todayAttendance.on_leave}`} />
                      <StatCard label="Pending Leave Requests" value={staffAnalytics.pendingLeaveRequests} tone="text-amber-700" />
                      <StatCard label="Avg Working Hours (this month)" value={`${staffAnalytics.avgWorkingHoursThisMonth} h`} tone="text-purple-700" />
                    </div>
                  )}

                  {staffAnalytics && staffAnalytics.topLateArrivals.length > 0 && (
                    <SectionCard title="Late Arrival Summary" sub="Employees with most accumulated late minutes this month.">
                      <div className="space-y-3">
                        {staffAnalytics.topLateArrivals.map((e, idx) => (
                          <div key={e.name} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
                            <span className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-200 text-amber-900 text-sm font-bold">#{idx + 1}</span>
                            <span className="flex-1 font-semibold text-slate-800">{e.name}</span>
                            <span className="text-sm font-bold text-amber-700">{e.total_late} min late total</span>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {/* Employee Directory */}
                  <SectionCard title="Employee Directory" sub="All staff members with roles and status." action={
                    <button onClick={() => setShowEmpForm(p => !p)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showEmpForm ? 'Hide' : '+ Add Employee'}</button>
                  }>
                    {showEmpForm && (
                      <form onSubmit={handleAddEmployee} className="mb-5 grid gap-3 md:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <input required value={empForm.employeeCode} onChange={e => setEmpForm({ ...empForm, employeeCode: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Employee Code (e.g. E006)" />
                        <input required value={empForm.fullName} onChange={e => setEmpForm({ ...empForm, fullName: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Full Name" />
                        <select value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                          {['Chef', 'Waitstaff', 'Cashier', 'Hostess', 'Kitchen Assistant', 'Bartender', 'Manager', 'Cleaner'].map(r => <option key={r}>{r}</option>)}
                        </select>
                        <input value={empForm.phoneNumber} onChange={e => setEmpForm({ ...empForm, phoneNumber: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Phone Number" />
                        <button type="submit" className="md:col-span-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 cursor-pointer">Add Employee</button>
                      </form>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {employees.map(emp => (
                        <div key={emp.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{emp.fullName}</p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">{emp.employeeCode}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${emp.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{emp.status}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{emp.role}</p>
                          {emp.phoneNumber && <p className="text-xs text-slate-400 mt-1">📞 {emp.phoneNumber}</p>}
                          <button onClick={async () => { await authFetch(`/api/v1/staff/employees/${emp.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: emp.status === 'Active' ? 'Inactive' : 'Active' }) }); void refreshStaff(); }}
                            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
                            {emp.status === 'Active' ? 'Mark Inactive' : 'Mark Active'}
                          </button>
                        </div>
                      ))}
                      {employees.length === 0 && <p className="text-sm text-slate-400 italic col-span-3">No employees added yet.</p>}
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Shift Roster ─ */}
              {staffSubTab === 'roster' && (
                <div className="space-y-6">
                  {/* Define Shifts */}
                  <SectionCard title="Shift Definitions" sub="Morning, Evening, Night — define working hour templates." action={
                    <button onClick={() => setShowShiftForm(p => !p)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showShiftForm ? 'Hide' : '+ New Shift'}</button>
                  }>
                    {showShiftForm && (
                      <form onSubmit={handleAddShift} className="mb-5 grid gap-3 md:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <input required value={shiftForm.shiftName} onChange={e => setShiftForm({ ...shiftForm, shiftName: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Shift name (e.g. Morning)" />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 whitespace-nowrap">Start</label>
                          <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm({ ...shiftForm, startTime: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 w-full" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 whitespace-nowrap">End</label>
                          <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm({ ...shiftForm, endTime: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 w-full" />
                        </div>
                        <input type="number" min="0" value={shiftForm.breakMinutes} onChange={e => setShiftForm({ ...shiftForm, breakMinutes: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Break (minutes)" />
                        <button type="submit" className="md:col-span-4 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 cursor-pointer">Create Shift</button>
                      </form>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {shifts.map(s => (
                        <div key={s.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                          <p className="font-bold text-sky-800">{s.shiftName}</p>
                          <p className="text-sm text-sky-600 mt-1">{s.startTime} → {s.endTime}</p>
                          <p className="text-xs text-sky-500 mt-1">Break: {s.breakMinutes} min · Net: {s.shiftHours.toFixed(1)} h</p>
                        </div>
                      ))}
                      {shifts.length === 0 && <p className="text-sm text-slate-400 italic col-span-4">No shifts defined yet.</p>}
                    </div>
                  </SectionCard>

                  {/* Assign Shifts */}
                  <SectionCard title="Assign Shift to Employee" sub="Build the daily shift roster by assigning employees to shifts.">
                    <form onSubmit={handleAssignShift} className="grid gap-3 md:grid-cols-4 lg:grid-cols-5">
                      <select required value={scheduleForm.employeeId} onChange={e => setScheduleForm({ ...scheduleForm, employeeId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Employee</option>
                        {employees.filter(emp => emp.status === 'Active').map(emp => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role})</option>)}
                      </select>
                      <select required value={scheduleForm.shiftId} onChange={e => setScheduleForm({ ...scheduleForm, shiftId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Shift</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.shiftName} ({s.startTime}–{s.endTime})</option>)}
                      </select>
                      <input type="date" value={scheduleForm.shiftDate} onChange={e => setScheduleForm({ ...scheduleForm, shiftDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <input value={scheduleForm.remarks} onChange={e => setScheduleForm({ ...scheduleForm, remarks: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Remarks (optional)" />
                      <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Assign Shift</button>
                    </form>
                  </SectionCard>

                  {/* Roster Table */}
                  <SectionCard title="Shift Schedule" sub="All assigned shifts by date.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Date</th><th className="p-3">Employee</th><th className="p-3">Shift</th><th className="p-3">Assigned By</th><th className="p-3">Remarks</th><th className="p-3"></th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {shiftSchedule.map(ss => (
                            <tr key={ss.id} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-700">{ss.shiftDate}</td>
                              <td className="p-3 font-semibold text-slate-800">{ss.employeeName}</td>
                              <td className="p-3"><span className="rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-xs font-semibold">{ss.shiftName}</span></td>
                              <td className="p-3 text-slate-500">{ss.assignedBy}</td>
                              <td className="p-3 text-slate-400 text-xs">{ss.remarks || '—'}</td>
                              <td className="p-3"><button onClick={async () => { await authFetch(`/api/v1/staff/schedule/${ss.id}`, { method: 'DELETE' }); void refreshStaff(); }} className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer">Remove</button></td>
                            </tr>
                          ))}
                          {shiftSchedule.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400 italic">No shifts scheduled yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Availability ─ */}
              {staffSubTab === 'availability' && (
                <div className="space-y-6">
                  <SectionCard title="Record Staff Availability" sub="Log when employees are available or unavailable before scheduling.">
                    <form onSubmit={handleAddAvailability} className="grid gap-3 md:grid-cols-5">
                      <select required value={availForm.employeeId} onChange={e => setAvailForm({ ...availForm, employeeId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Employee</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                      </select>
                      <input type="date" value={availForm.availableFrom} onChange={e => setAvailForm({ ...availForm, availableFrom: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <input type="date" value={availForm.availableTo} onChange={e => setAvailForm({ ...availForm, availableTo: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <select value={availForm.status} onChange={e => setAvailForm({ ...availForm, status: e.target.value as 'Available' | 'Unavailable' })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="Available">Available</option>
                        <option value="Unavailable">Unavailable</option>
                      </select>
                      <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Record</button>
                    </form>
                    <input value={availForm.remarks} onChange={e => setAvailForm({ ...availForm, remarks: e.target.value })} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Remarks (e.g. Available Mon-Fri only)" />
                  </SectionCard>

                  <SectionCard title="Availability Records" sub="Current availability and unavailability periods for all staff.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Employee</th><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Status</th><th className="p-3">Remarks</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {availability.map(av => (
                            <tr key={av.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">{av.employeeName}</td>
                              <td className="p-3 text-slate-700">{av.availableFrom}</td>
                              <td className="p-3 text-slate-700">{av.availableTo}</td>
                              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${av.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{av.status}</span></td>
                              <td className="p-3 text-slate-400 text-xs">{av.remarks || '—'}</td>
                            </tr>
                          ))}
                          {availability.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No availability records yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Leave ─ */}
              {staffSubTab === 'leave' && (
                <div className="space-y-6">
                  <SectionCard title="Submit Leave Request" sub="Log sick leave, casual leave, or planned absence.">
                    <form onSubmit={handleAddLeave} className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                      <select required value={leaveForm.employeeId} onChange={e => setLeaveForm({ ...leaveForm, employeeId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Employee</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                      </select>
                      <select value={leaveForm.leaveType} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        {['Sick Leave', 'Casual Leave', 'Annual Leave', 'Maternity Leave', 'Unpaid Leave', 'Other'].map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Submit Request</button>
                    </form>
                    <input value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Reason (e.g. Fever, Personal work)" />
                  </SectionCard>

                  <SectionCard title="Leave Requests" sub="Pending and historical leave requests. Approve or reject here.">
                    <div className="space-y-3">
                      {leaveRequests.map(lr => (
                        <div key={lr.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-800">{lr.employeeName}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lr.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : lr.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{lr.status}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{lr.leaveType} · {lr.startDate} to {lr.endDate}</p>
                            {lr.reason && <p className="text-xs text-slate-400 mt-0.5">{lr.reason}</p>}
                            {lr.approvedBy && <p className="text-xs text-slate-400">By: {lr.approvedBy}</p>}
                          </div>
                          {lr.status === 'Pending' && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => handleLeaveAction(lr.id, 'Approved')} className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer">Approve</button>
                              <button onClick={() => handleLeaveAction(lr.id, 'Rejected')} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer">Reject</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {leaveRequests.length === 0 && <p className="text-sm text-slate-400 italic text-center p-6">No leave requests yet.</p>}
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Attendance ─ */}
              {staffSubTab === 'attendance' && (
                <div className="space-y-6">
                  <SectionCard title="Mark Attendance" sub="Record employee check-in, check-out and break time. Working hours and overtime are calculated automatically.">
                    <form onSubmit={handleMarkAttendance} className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                      <select required value={attForm.employeeId} onChange={e => setAttForm({ ...attForm, employeeId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Employee</option>
                        {employees.filter(emp => emp.status === 'Active').map(emp => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
                      </select>
                      <input type="date" value={attForm.attendanceDate} onChange={e => setAttForm({ ...attForm, attendanceDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <select value={attForm.attendanceStatus} onChange={e => setAttForm({ ...attForm, attendanceStatus: e.target.value as typeof attForm.attendanceStatus })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Leave">On Leave</option>
                        <option value="Half-Day">Half-Day</option>
                      </select>
                      <select value={attForm.shiftId} onChange={e => setAttForm({ ...attForm, shiftId: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                        <option value="">Select Shift (optional)</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.shiftName} ({s.startTime}–{s.endTime})</option>)}
                      </select>
                      {(attForm.attendanceStatus === 'Present' || attForm.attendanceStatus === 'Half-Day') && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500 whitespace-nowrap">Check-In</label>
                            <input type="time" value={attForm.checkIn} onChange={e => setAttForm({ ...attForm, checkIn: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 w-full" />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500 whitespace-nowrap">Check-Out</label>
                            <input type="time" value={attForm.checkOut} onChange={e => setAttForm({ ...attForm, checkOut: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5 w-full" />
                          </div>
                          <input type="number" min="0" value={attForm.breakMinutes} onChange={e => setAttForm({ ...attForm, breakMinutes: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Break (minutes)" />
                        </>
                      )}
                      <button type="submit" className="lg:col-span-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">Mark Attendance</button>
                    </form>
                    <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <strong>Auto-calculated:</strong> Working Hours = (Check-Out − Check-In) − Break. Overtime = Working Hours − Shift Hours. Late Minutes = Check-In − Shift Start Time.
                    </p>
                  </SectionCard>

                  <SectionCard title="Attendance Log" sub="Daily attendance records with working hours, overtime and late arrival tracking.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="p-3">Date</th><th className="p-3">Employee</th><th className="p-3">Shift</th>
                            <th className="p-3">Check-In</th><th className="p-3">Check-Out</th>
                            <th className="p-3">Working Hrs</th><th className="p-3">Overtime</th><th className="p-3">Late (min)</th><th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {attendance.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-700">{a.attendanceDate}</td>
                              <td className="p-3 font-semibold text-slate-800">{a.employeeName}</td>
                              <td className="p-3 text-slate-500 text-xs">{a.shiftName ?? '—'}</td>
                              <td className="p-3">{a.checkIn || '—'}</td>
                              <td className="p-3">{a.checkOut || '—'}</td>
                              <td className="p-3 font-semibold text-sky-700">{a.workingHours > 0 ? `${a.workingHours.toFixed(2)} h` : '—'}</td>
                              <td className="p-3">{a.overtimeHours > 0 ? <span className="font-semibold text-purple-700">{a.overtimeHours.toFixed(2)} h</span> : '—'}</td>
                              <td className="p-3">{a.lateMinutes > 0 ? <span className="font-semibold text-amber-700">{a.lateMinutes} min</span> : <span className="text-emerald-600">On time</span>}</td>
                              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.attendanceStatus === 'Present' ? 'bg-emerald-100 text-emerald-700' : a.attendanceStatus === 'Absent' ? 'bg-rose-100 text-rose-700' : a.attendanceStatus === 'Leave' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>{a.attendanceStatus}</span></td>
                            </tr>
                          ))}
                          {attendance.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-400 italic">No attendance records yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Payroll ─ */}
              {staffSubTab === 'payroll' && (
                <div className="space-y-6">
                  <SectionCard title="Generate Payroll Summary" sub="Computes working days, hours, overtime and leave days from attendance data for a given month.">
                    <div className="flex items-center gap-3">
                      <input type="month" value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                      <button onClick={handleGeneratePayroll} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 cursor-pointer">Generate Payroll for {payrollMonth}</button>
                    </div>
                    <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <strong>Formula:</strong> Working Days = attendance days marked Present or Half-Day. Working Hours = sum of all logged hours. Overtime = hours beyond scheduled shift. Leave Days = approved leave in this month.
                    </p>
                  </SectionCard>

                  <SectionCard title="Payroll Summary" sub="Generated payroll data by employee and month.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Month</th><th className="p-3">Employee</th><th className="p-3">Working Days</th><th className="p-3">Working Hours</th><th className="p-3">Overtime Hours</th><th className="p-3">Leave Days</th><th className="p-3">Generated On</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {payroll.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-800">{p.month}</td>
                              <td className="p-3 text-slate-700">{p.employeeName}</td>
                              <td className="p-3 text-sky-700 font-semibold">{p.workingDays}</td>
                              <td className="p-3 text-slate-700">{p.workingHours.toFixed(2)} h</td>
                              <td className="p-3">{p.overtimeHours > 0 ? <span className="font-semibold text-purple-700">{p.overtimeHours.toFixed(2)} h</span> : '—'}</td>
                              <td className="p-3">{p.leaveDays > 0 ? <span className="text-amber-700 font-semibold">{p.leaveDays}</span> : '—'}</td>
                              <td className="p-3 text-slate-400 text-xs">{p.generatedOn}</td>
                            </tr>
                          ))}
                          {payroll.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">No payroll generated yet. Select a month and click Generate.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

            </div>
          )}

          {/* ══ CUSTOMER FEEDBACK AGGREGATOR (MODULE 5) ══════════════════════ */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              {feedbackMsg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex items-center justify-between">
                  {feedbackMsg}
                  <button onClick={() => setFeedbackMsg(null)} className="ml-4 text-emerald-500 hover:text-emerald-700 cursor-pointer">✕</button>
                </div>
              )}

              {/* Sub-tabs */}
              <nav className="flex flex-wrap gap-2">
                {(['overview', 'reviews', 'sentiment', 'categories', 'trends', 'satisfaction', 'reputation', 'weekly'] as const).map(t => (
                  <button key={t} onClick={() => setFeedbackSubTab(t)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize cursor-pointer transition ${feedbackSubTab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {t === 'overview' ? '📊 Overview' : t === 'reviews' ? '📝 Reviews' : t === 'sentiment' ? '🤖 Sentiment' : t === 'categories' ? '🏷️ Categories' : t === 'trends' ? '📈 Trends' : t === 'satisfaction' ? '😊 Satisfaction' : t === 'reputation' ? '⭐ Reputation' : '📋 Weekly'}
                  </button>
                ))}
                <button onClick={() => void refreshFeedback()} className="ml-auto rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">↻ Refresh</button>
              </nav>

              {/* ─ Overview ─ */}
              {feedbackSubTab === 'overview' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Total Reviews" value={feedbackAnalytics.totalReviews} tone="text-slate-800" sub={`${feedbackAnalytics.reviewGrowthPercent >= 0 ? '+' : ''}${feedbackAnalytics.reviewGrowthPercent}% vs last 30 days`} />
                    <StatCard label="Average Rating" value={`${feedbackAnalytics.averageRating} ★`} tone="text-amber-600" />
                    <StatCard label="Positive Reviews" value={`${feedbackAnalytics.positivePercent}%`} tone="text-emerald-700" sub={`${feedbackAnalytics.positiveCount} reviews`} />
                    <StatCard label="Reputation Score" value={`${feedbackAnalytics.reputationScore}/100`} tone={feedbackAnalytics.reputationScore >= 70 ? 'text-emerald-700' : feedbackAnalytics.reputationScore >= 50 ? 'text-amber-600' : 'text-rose-600'} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard label="Negative Reviews" value={`${feedbackAnalytics.negativePercent}%`} tone="text-rose-600" sub={`${feedbackAnalytics.negativeCount} reviews`} />
                    <StatCard label="Neutral Reviews" value={`${feedbackAnalytics.neutralPercent}%`} tone="text-slate-600" sub={`${feedbackAnalytics.neutralCount} reviews`} />
                    <StatCard label="Top Category" value={feedbackAnalytics.topCategory} tone="text-purple-700" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <SectionCard title="Rating Distribution" sub="Breakdown of star ratings across all reviews.">
                      <div className="space-y-2">
                        {[5,4,3,2,1].map(star => {
                          const d = feedbackAnalytics.ratingDistribution.find(r => r.rating === star);
                          const count = d?.count ?? 0;
                          const pct = feedbackAnalytics.totalReviews === 0 ? 0 : Math.round((count / feedbackAnalytics.totalReviews) * 100);
                          return (
                            <div key={star} className="flex items-center gap-3 text-sm">
                              <span className="w-10 text-right font-semibold text-amber-600">{star} ★</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="h-3 rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-12 text-slate-500 text-xs">{count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>

                    <SectionCard title="Reviews by Source" sub="Multi-platform collection overview.">
                      <div className="space-y-3">
                        {feedbackAnalytics.reviewsBySource.map(s => (
                          <div key={s.source} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                            <span className="font-semibold text-slate-800">{s.source}</span>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-slate-600">{s.count} reviews</span>
                              <span className="font-bold text-amber-600">{s.avgRating.toFixed(1)} ★</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Recent Reviews" sub="Latest 10 customer reviews.">
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {feedbackAnalytics.recentReviews.map(r => (
                          <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-semibold text-slate-800 text-sm">{r.customerName}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-amber-500 text-sm">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.sentiment === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : r.sentiment === 'NEGATIVE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{r.sentiment}</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2">{r.reviewText}</p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-slate-400">{r.source} · {r.reviewDate}</span>
                              {r.categories.map(c => <span key={c} className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">{c}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Reviews by Customer" sub="Top contributing customers.">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <tr><th className="p-3">Customer</th><th className="p-3">Reviews</th><th className="p-3">Avg Rating</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {feedbackAnalytics.reviewsByCustomer.map(c => (
                              <tr key={c.customerName} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-800">{c.customerName}</td>
                                <td className="p-3 text-sky-700 font-semibold">{c.count}</td>
                                <td className="p-3 text-amber-600 font-semibold">{c.avgRating.toFixed(1)} ★</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  </div>
                </div>
              )}

              {/* ─ Reviews ─ */}
              {feedbackSubTab === 'reviews' && (
                <div className="space-y-6">
                  <SectionCard title="Add Review" sub="Manually enter a customer review with automatic AI sentiment & categorization." action={
                    <button onClick={() => setShowFeedbackForm(p => !p)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer">{showFeedbackForm ? 'Hide' : '+ Add Review'}</button>
                  }>
                    {showFeedbackForm && (
                      <form onSubmit={async e => {
                        e.preventDefault();
                        const res = await authFetch('/api/v1/feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ...feedbackForm, rating: Number(feedbackForm.rating) }),
                        });
                        const d = await res.json().catch(() => ({}));
                        if (res.ok) {
                          setFeedbackMsg('Review added and analyzed successfully!');
                          setFeedbackForm({ customerName: '', reviewText: '', rating: '5', source: 'Google', reviewDate: today });
                          setShowFeedbackForm(false);
                          void refreshFeedback();
                        } else {
                          setFeedbackMsg(d.message ?? 'Failed to add review');
                        }
                      }} className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-4">
                          <input required value={feedbackForm.customerName} onChange={e => setFeedbackForm({ ...feedbackForm, customerName: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Customer Name" />
                          <select value={feedbackForm.source} onChange={e => setFeedbackForm({ ...feedbackForm, source: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                            {['Google', 'Yelp', 'Zomato', 'TripAdvisor', 'Direct'].map(s => <option key={s}>{s}</option>)}
                          </select>
                          <select value={feedbackForm.rating} onChange={e => setFeedbackForm({ ...feedbackForm, rating: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5">
                            {[5,4,3,2,1].map(r => <option key={r} value={r}>{r} Star{r !== 1 ? 's' : ''}</option>)}
                          </select>
                          <input type="date" value={feedbackForm.reviewDate} onChange={e => setFeedbackForm({ ...feedbackForm, reviewDate: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                        </div>
                        <textarea required rows={3} value={feedbackForm.reviewText} onChange={e => setFeedbackForm({ ...feedbackForm, reviewText: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Review text (AI will automatically detect sentiment and categories)..." />
                        <div className="flex justify-end"><button type="submit" className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 cursor-pointer">Submit & Analyze</button></div>
                      </form>
                    )}
                  </SectionCard>

                  <SectionCard title={`All Reviews (${feedbackItems.length})`} sub="Complete multi-platform review collection.">
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {feedbackItems.map(r => (
                        <div key={r.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-bold text-slate-800">{r.customerName}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{r.source} · {r.reviewDate}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.sentiment === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : r.sentiment === 'NEGATIVE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{r.sentiment}</span>
                              <span className="text-xs text-slate-400">{(r.confidenceScore * 100).toFixed(0)}% conf.</span>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{r.reviewText}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.categories.map(c => <span key={c} className="text-[11px] bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">{c}</span>)}
                          </div>
                        </div>
                      ))}
                      {feedbackItems.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No reviews yet. Add one above.</p>}
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Sentiment Analysis ─ */}
              {feedbackSubTab === 'sentiment' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm">
                      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">😊 Positive</p>
                      <p className="mt-3 text-5xl font-bold text-emerald-700">{feedbackAnalytics.positivePercent}%</p>
                      <p className="mt-2 text-sm text-emerald-600">{feedbackAnalytics.positiveCount} reviews</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center shadow-sm">
                      <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">😐 Neutral</p>
                      <p className="mt-3 text-5xl font-bold text-slate-600">{feedbackAnalytics.neutralPercent}%</p>
                      <p className="mt-2 text-sm text-slate-500">{feedbackAnalytics.neutralCount} reviews</p>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center shadow-sm">
                      <p className="text-sm font-semibold text-rose-700 uppercase tracking-wide">😞 Negative</p>
                      <p className="mt-3 text-5xl font-bold text-rose-700">{feedbackAnalytics.negativePercent}%</p>
                      <p className="mt-2 text-sm text-rose-600">{feedbackAnalytics.negativeCount} reviews</p>
                    </div>
                  </div>

                  <SectionCard title="Individual Sentiment Scores" sub="AI-powered sentiment label (DistilBERT) with confidence score per review.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Rating</th><th className="p-3">Sentiment</th><th className="p-3">Confidence</th><th className="p-3">Review Excerpt</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {feedbackItems.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-800">{r.customerName}</td>
                              <td className="p-3 text-slate-500 text-xs">{r.reviewDate}</td>
                              <td className="p-3 text-amber-600 font-semibold">{r.rating} ★</td>
                              <td className="p-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.sentiment === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : r.sentiment === 'NEGATIVE' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{r.sentiment}</span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${r.sentiment === 'POSITIVE' ? 'bg-emerald-400' : r.sentiment === 'NEGATIVE' ? 'bg-rose-400' : 'bg-slate-400'}`} style={{ width: `${(r.confidenceScore * 100).toFixed(0)}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-500">{(r.confidenceScore * 100).toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-600 text-xs max-w-xs truncate">{r.reviewText.slice(0, 80)}…</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Categories ─ */}
              {feedbackSubTab === 'categories' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard label="Total Categories" value={feedbackAnalytics.categoryDistribution.length} tone="text-slate-800" />
                    <StatCard label="Most Discussed" value={feedbackAnalytics.topCategory} tone="text-purple-700" />
                    <StatCard label="Least Discussed" value={feedbackAnalytics.leastCategory} tone="text-slate-500" />
                  </div>

                  <SectionCard title="Category Distribution" sub="How often each theme appears in reviews and the average rating per category.">
                    <div className="space-y-3">
                      {feedbackAnalytics.categoryDistribution.map(c => {
                        const pct = feedbackAnalytics.totalReviews === 0 ? 0 : Math.round((c.count / feedbackAnalytics.totalReviews) * 100);
                        return (
                          <div key={c.categoryName} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-slate-800">{c.categoryName}</span>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-slate-600">{c.count} mentions</span>
                                <span className="font-bold text-amber-600">{c.avgRating.toFixed(1)} ★</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-200 rounded-full h-2.5">
                                <div className="h-2.5 rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>

                  <SectionCard title="Category-wise Ratings" sub="Average star rating per category helps identify specific areas needing improvement.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr><th className="p-3">Category</th><th className="p-3">Mentions</th><th className="p-3">Avg Rating</th><th className="p-3">Performance</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[...feedbackAnalytics.categoryDistribution].sort((a, b) => b.avgRating - a.avgRating).map(c => (
                            <tr key={c.categoryName} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-800">{c.categoryName}</td>
                              <td className="p-3 text-slate-600">{c.count}</td>
                              <td className="p-3 font-bold text-amber-600">{c.avgRating.toFixed(1)} ★</td>
                              <td className="p-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.avgRating >= 4 ? 'bg-emerald-100 text-emerald-700' : c.avgRating >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                  {c.avgRating >= 4 ? 'Excellent' : c.avgRating >= 3 ? 'Average' : 'Needs Work'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Trends ─ */}
              {feedbackSubTab === 'trends' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Top Improving Category" value={feedbackAnalytics.topImprovingCategory} tone="text-emerald-700" sub="Best rating improvement vs prior period" />
                    <StatCard label="Top Declining Category" value={feedbackAnalytics.topDecliningCategory} tone="text-rose-600" sub="Largest rating drop vs prior period" />
                    <StatCard label="Rating Trend" value={feedbackAnalytics.ratingTrendDirection === 'up' ? '↑ Improving' : feedbackAnalytics.ratingTrendDirection === 'down' ? '↓ Declining' : '→ Stable'} tone={feedbackAnalytics.ratingTrendDirection === 'up' ? 'text-emerald-700' : feedbackAnalytics.ratingTrendDirection === 'down' ? 'text-rose-600' : 'text-slate-600'} />
                    <StatCard label="Review Growth" value={`${feedbackAnalytics.reviewGrowthPercent >= 0 ? '+' : ''}${feedbackAnalytics.reviewGrowthPercent}%`} tone={feedbackAnalytics.reviewGrowthPercent >= 0 ? 'text-emerald-700' : 'text-rose-600'} sub="Last 30 days vs prior 30" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <SectionCard title="Monthly Review Volume" sub="Review count and average rating per month.">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <tr><th className="p-3">Month</th><th className="p-3">Reviews</th><th className="p-3">Avg Rating</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {feedbackAnalytics.monthlyReviews.map(m => (
                              <tr key={m.month} className="hover:bg-slate-50">
                                <td className="p-3 font-semibold text-slate-800">{m.month}</td>
                                <td className="p-3 text-sky-700 font-semibold">{m.count}</td>
                                <td className="p-3 text-amber-600 font-semibold">{m.avgRating.toFixed(1)} ★</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>

                    <SectionCard title="Weekly Review Growth" sub="Review volume week by week.">
                      <div className="space-y-2">
                        {feedbackAnalytics.weeklyReviews.map(w => {
                          const maxW = Math.max(...feedbackAnalytics.weeklyReviews.map(x => x.count), 1);
                          const pct = Math.round((w.count / maxW) * 100);
                          return (
                            <div key={w.week} className="flex items-center gap-3 text-sm">
                              <span className="w-24 text-xs text-slate-500 shrink-0">Wk {w.week.slice(5)}</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3">
                                <div className="h-3 rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-xs text-slate-600 text-right font-semibold">{w.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>

                    <SectionCard title="Monthly Sentiment Trend" sub="Positive vs Negative review evolution over time.">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <tr><th className="p-3">Month</th><th className="p-3 text-emerald-600">Positive</th><th className="p-3 text-slate-500">Neutral</th><th className="p-3 text-rose-600">Negative</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {feedbackAnalytics.sentimentTrend.map(m => (
                              <tr key={m.month} className="hover:bg-slate-50">
                                <td className="p-3 font-semibold text-slate-800">{m.month}</td>
                                <td className="p-3 text-emerald-700 font-semibold">{m.positive}</td>
                                <td className="p-3 text-slate-500">{m.neutral}</td>
                                <td className="p-3 text-rose-600 font-semibold">{m.negative}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>

                    <SectionCard title="Peak Review Days" sub="Days of the week with highest review activity.">
                      <div className="space-y-2">
                        {feedbackAnalytics.peakReviewDays.map(d => {
                          const maxD = Math.max(...feedbackAnalytics.peakReviewDays.map(x => x.count), 1);
                          const pct = Math.round((d.count / maxD) * 100);
                          return (
                            <div key={d.dayName} className="flex items-center gap-3 text-sm">
                              <span className="w-24 text-xs text-slate-500 shrink-0">{d.dayName.trim()}</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3">
                                <div className="h-3 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-xs text-slate-600 text-right font-semibold">{d.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  </div>
                </div>
              )}

              {/* ─ Satisfaction ─ */}
              {feedbackSubTab === 'satisfaction' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Average Rating" value={`${feedbackAnalytics.averageRating} ★`} tone="text-amber-600" />
                    <StatCard label="Positive %" value={`${feedbackAnalytics.positivePercent}%`} tone="text-emerald-700" sub={`${feedbackAnalytics.positiveCount} reviews`} />
                    <StatCard label="Neutral %" value={`${feedbackAnalytics.neutralPercent}%`} tone="text-slate-600" sub={`${feedbackAnalytics.neutralCount} reviews`} />
                    <StatCard label="Negative %" value={`${feedbackAnalytics.negativePercent}%`} tone="text-rose-600" sub={`${feedbackAnalytics.negativeCount} reviews`} />
                  </div>

                  <SectionCard title="Monthly Satisfaction Breakdown" sub="Month-by-month positive, neutral, and negative review counts.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="p-3">Month</th>
                            <th className="p-3">Total</th>
                            <th className="p-3 text-emerald-600">Positive</th>
                            <th className="p-3 text-slate-500">Neutral</th>
                            <th className="p-3 text-rose-600">Negative</th>
                            <th className="p-3">Satisfaction %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {feedbackAnalytics.monthlySatisfaction.map(m => {
                            const pct = m.total === 0 ? 0 : Math.round((m.positive / m.total) * 100);
                            return (
                              <tr key={m.month} className="hover:bg-slate-50">
                                <td className="p-3 font-semibold text-slate-800">{m.month}</td>
                                <td className="p-3 text-slate-700">{m.total}</td>
                                <td className="p-3 text-emerald-700 font-semibold">{m.positive}</td>
                                <td className="p-3 text-slate-500">{m.neutral}</td>
                                <td className="p-3 text-rose-600 font-semibold">{m.negative}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-20 bg-slate-100 rounded-full h-2">
                                      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-xs font-bold ${pct >= 70 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ─ Reputation ─ */}
              {feedbackSubTab === 'reputation' && feedbackAnalytics && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-center shadow-sm">
                      <p className="text-sm text-slate-500">Reputation Score</p>
                      <p className={`mt-2 text-5xl font-bold ${feedbackAnalytics.reputationScore >= 70 ? 'text-emerald-700' : feedbackAnalytics.reputationScore >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{feedbackAnalytics.reputationScore}</p>
                      <p className="mt-1 text-xs text-slate-400">out of 100</p>
                    </div>
                    <StatCard label="Average Rating" value={`${feedbackAnalytics.averageRating} ★`} tone="text-amber-600" sub={`Trend: ${feedbackAnalytics.ratingTrendDirection === 'up' ? '↑ Improving' : feedbackAnalytics.ratingTrendDirection === 'down' ? '↓ Declining' : '→ Stable'}`} />
                    <StatCard label="5-Star Reviews" value={feedbackAnalytics.fiveStarCount} tone="text-emerald-700" sub={`${feedbackAnalytics.totalReviews === 0 ? 0 : Math.round((feedbackAnalytics.fiveStarCount / feedbackAnalytics.totalReviews) * 100)}% of total`} />
                    <StatCard label="1-Star Reviews" value={feedbackAnalytics.oneStarCount} tone="text-rose-600" sub={`${feedbackAnalytics.totalReviews === 0 ? 0 : Math.round((feedbackAnalytics.oneStarCount / feedbackAnalytics.totalReviews) * 100)}% of total`} />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <SectionCard title="Monthly Rating Trend" sub="Average rating per month — tracks reputation over time.">
                      <div className="space-y-2">
                        {feedbackAnalytics.ratingTrend.map(m => (
                          <div key={m.month} className="flex items-center gap-3 text-sm">
                            <span className="w-20 text-xs text-slate-500 shrink-0">{m.month}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-3">
                              <div className={`h-3 rounded-full ${m.avgRating >= 4 ? 'bg-emerald-400' : m.avgRating >= 3 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${(m.avgRating / 5) * 100}%` }} />
                            </div>
                            <span className="w-14 text-xs text-right font-bold text-amber-600">{m.avgRating.toFixed(1)} ★</span>
                          </div>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Review Volume by Month" sub="Total reviews per month — higher volume signals growing engagement.">
                      <div className="space-y-2">
                        {feedbackAnalytics.monthlyReviews.map(m => {
                          const maxM = Math.max(...feedbackAnalytics.monthlyReviews.map(x => x.count), 1);
                          const pct = Math.round((m.count / maxM) * 100);
                          return (
                            <div key={m.month} className="flex items-center gap-3 text-sm">
                              <span className="w-20 text-xs text-slate-500 shrink-0">{m.month}</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3">
                                <div className="h-3 rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-xs text-slate-600 text-right font-semibold">{m.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>

                    <SectionCard title="Negative Review Growth" sub="Change in negative reviews vs prior period — early warning for reputation risk.">
                      <div className="flex flex-col items-center justify-center py-6">
                        <p className={`text-6xl font-bold ${feedbackAnalytics.negativeGrowthPercent > 10 ? 'text-rose-600' : feedbackAnalytics.negativeGrowthPercent < 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                          {feedbackAnalytics.negativeGrowthPercent >= 0 ? '+' : ''}{feedbackAnalytics.negativeGrowthPercent}%
                        </p>
                        <p className="mt-2 text-sm text-slate-500">negative review growth (last 30 days vs prior 30)</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {feedbackAnalytics.negativeGrowthPercent > 10 ? '⚠️ Increasing — investigate causes' : feedbackAnalytics.negativeGrowthPercent < 0 ? '✅ Improving — keep it up' : '→ Stable'}
                        </p>
                      </div>
                    </SectionCard>

                    <SectionCard title="Sentiment Trend by Month" sub="Positive vs negative review trend for reputation monitoring.">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <tr><th className="p-3">Month</th><th className="p-3 text-emerald-600">Positive</th><th className="p-3 text-rose-600">Negative</th><th className="p-3">Ratio</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {feedbackAnalytics.sentimentTrend.map(m => {
                              const tot = m.positive + m.negative + m.neutral || 1;
                              return (
                                <tr key={m.month} className="hover:bg-slate-50">
                                  <td className="p-3 font-semibold text-slate-800">{m.month}</td>
                                  <td className="p-3 text-emerald-700 font-semibold">{m.positive}</td>
                                  <td className="p-3 text-rose-600 font-semibold">{m.negative}</td>
                                  <td className="p-3 text-xs text-slate-500">{Math.round((m.positive / tot) * 100)}% positive</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  </div>
                </div>
              )}

              {/* ─ Weekly Summary ─ */}
              {feedbackSubTab === 'weekly' && (
                <div className="space-y-6">
                  <SectionCard title="Generate Weekly Summary" sub="Computes this week's review stats — total, sentiment breakdown, top category, and peak day.">
                    <button onClick={async () => {
                      const res = await authFetch('/api/v1/feedback/weekly-summary/generate', { method: 'POST' });
                      const d = await res.json().catch(() => ({}));
                      if (res.ok) {
                        setFeedbackMsg('Weekly summary generated!');
                        void refreshFeedback();
                      } else {
                        setFeedbackMsg(d.message ?? 'Failed to generate');
                      }
                    }} className="rounded-xl bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 cursor-pointer">
                      Generate Summary for This Week
                    </button>
                    <p className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <strong>Formula:</strong> Aggregates all reviews from the past 7 days. Identifies top category by mention count and best/worst review day. Rule-based logic — LLM integration optional for narrative generation.
                    </p>
                  </SectionCard>

                  <SectionCard title="Weekly Summaries" sub="Generated summaries showing weekly trends in review volume and sentiment.">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="p-3">Week</th>
                            <th className="p-3">Total</th>
                            <th className="p-3 text-emerald-600">Positive</th>
                            <th className="p-3 text-slate-500">Neutral</th>
                            <th className="p-3 text-rose-600">Negative</th>
                            <th className="p-3">Avg Rating</th>
                            <th className="p-3">Top Category</th>
                            <th className="p-3">Trending</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {weeklySummaries.map(w => (
                            <tr key={w.id} className="hover:bg-slate-50">
                              <td className="p-3 text-xs text-slate-600 font-mono">{w.weekStart} → {w.weekEnd}</td>
                              <td className="p-3 font-bold text-slate-800">{w.totalReviews}</td>
                              <td className="p-3 text-emerald-700 font-semibold">{w.positiveReviews}</td>
                              <td className="p-3 text-slate-500">{w.neutralReviews}</td>
                              <td className="p-3 text-rose-600 font-semibold">{w.negativeReviews}</td>
                              <td className="p-3 font-bold text-amber-600">{w.averageRating.toFixed(1)} ★</td>
                              <td className="p-3 text-purple-700 font-medium">{w.topCategory}</td>
                              <td className="p-3 text-xs text-slate-400">{w.trendingMetric}</td>
                            </tr>
                          ))}
                          {weeklySummaries.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">No summaries yet. Click Generate above.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
              )}

            </div>
          )}

        </main>
      </div>
    </div>
  );
}
