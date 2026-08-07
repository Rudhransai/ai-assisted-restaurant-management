import React, { useCallback, useEffect, useState } from 'react';
import { authFetch } from './auth';

/**
 * Billing tab.
 *
 * Two jobs, deliberately on one screen:
 *  1. Turn an order into an invoice and show the customer a QR to pay.
 *  2. Set up recipes — which ingredients a dish uses — because without them the
 *     "deduct inventory on payment" step silently does nothing.
 */

type OrderLite = { id: string; guestName: string; tableNumber: string; totalAmount: number; status: string };
type Invoice = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  guestName: string;
  email: string;
  phone: string;
  amount: number;
  status: 'pending_payment' | 'paid' | 'cancelled';
  createdAt: string;
  paidAt: string | null;
};
type PaymentRequest = {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paymentLink: string;
  qrDataUrl: string;
};
type Recipe = {
  id: string;
  dishId: string;
  dishName: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityPerServing: number;
};
type Dish = { id: string; name: string };
type Ingredient = { id: string; name: string; unit: string };

const statusTone: Record<string, string> = {
  paid: 'bg-free/10 text-free',
  pending_payment: 'bg-hold/12 text-hold',
  cancelled: 'bg-busy/10 text-busy',
};

const money = (n: number) => `₹${Number(n).toFixed(2)}`;

export function Billing({
  SectionCard,
}: {
  SectionCard: React.ComponentType<{ title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }>;
}) {
  // Orders are fetched here rather than passed in. The dashboard only loads them when the
  // Orders tab is opened, so relying on that prop left this screen empty — and worse,
  // showing "every order already has an invoice" when the real answer was "no orders loaded".
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [invoiceForm, setInvoiceForm] = useState({ orderId: '', email: '', phone: '' });
  const [recipeForm, setRecipeForm] = useState({ dishId: '', ingredientId: '', quantityPerServing: '' });

  const load = useCallback(async () => {
    try {
      const [invRes, recRes, dishRes, ingRes, ordRes] = await Promise.all([
        authFetch('/api/v1/invoices'),
        authFetch('/api/v1/recipes'),
        authFetch('/api/v1/dishes'),
        authFetch('/api/v1/inventory/ingredients'),
        authFetch('/api/v1/orders'),
      ]);
      const [inv, rec, dish, ing, ord] = await Promise.all([
        invRes.json(), recRes.json(), dishRes.json(), ingRes.json(), ordRes.json(),
      ]);
      setInvoices(inv?.data ?? []);
      setRecipes(rec?.data ?? []);
      setDishes(dish?.data ?? []);
      setIngredients(ing?.data ?? []);
      setOrders(ord?.data ?? ord ?? []);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message ?? 'Could not load billing data' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.orderId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Could not create invoice');
      setMessage({ kind: 'ok', text: `Invoice ${data.data.invoiceNumber} created.` });
      setInvoiceForm({ orderId: '', email: '', phone: '' });
      await load();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const showQr = async (invoiceId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch(`/api/v1/invoices/${invoiceId}/payment-request`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Could not create payment request');
      if (data.data.alreadyPaid) {
        setMessage({ kind: 'ok', text: 'That invoice is already paid.' });
        return;
      }
      setRequest(data.data);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const addRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/v1/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId: recipeForm.dishId,
          ingredientId: recipeForm.ingredientId,
          quantityPerServing: Number(recipeForm.quantityPerServing),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Could not save recipe');
      setRecipeForm({ dishId: '', ingredientId: '', quantityPerServing: '' });
      setMessage({ kind: 'ok', text: 'Recipe saved.' });
      await load();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeRecipe = async (id: string) => {
    try {
      await authFetch(`/api/v1/recipes/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message ?? String(err) });
    }
  };

  const invoicedOrderIds = new Set(invoices.map((i) => i.orderId));
  const uninvoiced = orders.filter((o) => !invoicedOrderIds.has(o.id));
  const field = 'rounded-md border border-line bg-white px-3 py-2.5';

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          className={`rounded-md border px-3 py-2.5 text-sm ${
            message.kind === 'ok' ? 'border-free/30 bg-free/5 text-free' : 'border-busy/30 bg-busy/5 text-busy'
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Payment QR — shown once a payment request is generated */}
      {request && (
        <SectionCard
          title={`Payment for ${request.invoiceNumber}`}
          sub="Show this to the customer, or send them the link."
          action={
            <button onClick={() => setRequest(null)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-paper">
              Close
            </button>
          }
        >
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <img src={request.qrDataUrl} alt={`Payment QR code for ${request.invoiceNumber}`} className="h-44 w-44 rounded-md border border-line" />
            <div className="min-w-0">
              <p className="eyebrow">Amount</p>
              <p className="font-display text-3xl font-bold tabular">{money(request.amount)}</p>
              <p className="mt-3 eyebrow">Payment link</p>
              <a href={request.paymentLink} target="_blank" rel="noreferrer" className="data block break-all text-sm text-ink underline underline-offset-2">
                {request.paymentLink}
              </a>
              <p className="mt-3 text-xs text-ink-soft">
                Scanning from a phone needs PUBLIC_BASE_URL set to this PC's network address, not localhost.
              </p>
              <button onClick={() => void load()} className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft">
                Refresh after payment
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Create an invoice from an order */}
      <SectionCard title="Create invoice" sub={`${uninvoiced.length} order(s) not yet invoiced`}>
        <form onSubmit={createInvoice} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={invoiceForm.orderId}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, orderId: e.target.value })}
            className={`${field} lg:col-span-2`}
            required
          >
            <option value="">Choose an order…</option>
            {uninvoiced.map((o) => (
              <option key={o.id} value={o.id}>
                {o.guestName} · Table {o.tableNumber} · {money(o.totalAmount)}
              </option>
            ))}
          </select>
          <input
            value={invoiceForm.phone}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, phone: e.target.value })}
            className={field}
            placeholder="Phone (for WhatsApp receipt)"
          />
          <button type="submit" disabled={busy} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-55">
            {busy ? 'Working…' : 'Create invoice'}
          </button>
        </form>
        {uninvoiced.length === 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            {orders.length === 0
              ? 'No orders found yet. Orders are created from the customer side.'
              : 'Every order already has an invoice.'}
          </p>
        )}
      </SectionCard>

      {/* Invoice list */}
      <SectionCard
        title="Invoices"
        sub={`${invoices.filter((i) => i.status === 'paid').length} paid of ${invoices.length}`}
        action={
          <button onClick={() => void load()} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-paper">
            Refresh
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Guest</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Paid at</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0">
                  <td className="data py-3 pr-4">{inv.invoiceNumber}</td>
                  <td className="py-3 pr-4">{inv.guestName || '—'}</td>
                  <td className="data py-3 pr-4">{money(inv.amount)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[inv.status] ?? ''}`}>
                      {inv.status === 'pending_payment' ? 'Pending' : inv.status}
                    </span>
                  </td>
                  <td className="data py-3 pr-4 text-ink-soft">{inv.paidAt ? new Date(inv.paidAt).toLocaleString() : '—'}</td>
                  <td className="py-3">
                    {inv.status !== 'paid' && (
                      <button onClick={() => void showQr(inv.id)} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper">
                        Show QR
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center italic text-ink-soft">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Recipes */}
      <SectionCard
        title="Recipes"
        sub="How much of each ingredient one serving uses. Without these, stock is never deducted."
      >
        <form onSubmit={addRecipe} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={recipeForm.dishId} onChange={(e) => setRecipeForm({ ...recipeForm, dishId: e.target.value })} className={field} required>
            <option value="">Dish…</option>
            {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={recipeForm.ingredientId} onChange={(e) => setRecipeForm({ ...recipeForm, ingredientId: e.target.value })} className={field} required>
            <option value="">Ingredient…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
          <input
            value={recipeForm.quantityPerServing}
            onChange={(e) => setRecipeForm({ ...recipeForm, quantityPerServing: e.target.value })}
            className={field}
            type="number"
            step="0.001"
            min="0.001"
            placeholder="Qty per serving"
            required
          />
          <button type="submit" disabled={busy} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-55">
            Save recipe
          </button>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4">Dish</th>
                <th className="py-2 pr-4">Ingredient</th>
                <th className="py-2 pr-4">Per serving</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-4">{r.dishName ?? r.dishId}</td>
                  <td className="py-3 pr-4">{r.ingredientName ?? r.ingredientId}</td>
                  <td className="data py-3 pr-4">{r.quantityPerServing} {r.unit}</td>
                  <td className="py-3">
                    <button onClick={() => void removeRecipe(r.id)} className="text-xs font-semibold text-busy hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {recipes.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center italic text-ink-soft">No recipes yet — payments will not deduct any stock.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
