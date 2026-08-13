import React, { useState } from 'react';
import { saveAuth, redirectForRole } from './auth';

type Role = 'customer' | 'manager';

export function Register() {
  const [role, setRole] = useState<Role>('customer');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', managerCode: '' });
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle' });

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus({ kind: 'error', message: payload?.message ?? 'Registration failed' });
        return;
      }

      saveAuth(payload.data.token, payload.data.user);
      setStatus({ kind: 'ok', message: 'Account created. Taking you in…' });
      setTimeout(() => redirectForRole(payload.data.user.role), 800);
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5';

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-ink bg-ink px-4 py-4 md:px-8">
        <p className="eyebrow text-white/55">Restaurant</p>
        <p className="mt-0.5 font-display text-lg font-bold text-white">Floor &amp; Service</p>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold">Create account</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {role === 'customer'
              ? 'Sign up to reserve a table, order from your seat, and get a message the moment a table is free.'
              : 'Manager accounts run the floor: reservations, orders, inventory, staff and feedback.'}
          </p>

          {/* Who is this account for? The fields below change with the answer. */}
          <div className="mt-6 flex gap-1 rounded-md border border-line bg-white p-1">
            {(['customer', 'manager'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`flex-1 rounded px-3 py-2 text-sm font-semibold capitalize transition ${
                  role === r ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper'
                }`}
              >
                {r === 'customer' ? '🍽️ Customer' : '🗝️ Manager'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-white p-5">
            <div className="grid gap-4">
              <div>
                <label htmlFor="name" className="eyebrow">Full name</label>
                <input id="name" value={form.name} required autoComplete="name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              </div>

              <div>
                <label htmlFor="email" className="eyebrow">Email</label>
                <input id="email" value={form.email} type="email" required autoComplete="email"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
              </div>

              <div>
                <label htmlFor="password" className="eyebrow">Password</label>
                <input id="password" value={form.password} type="password" minLength={6} required
                  autoComplete="new-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
                <p className="mt-1 text-xs text-ink-soft">At least 6 characters.</p>
              </div>

              {role === 'customer' && (
                <div>
                  <label htmlFor="phone" className="eyebrow">
                    Phone <span className="font-normal normal-case tracking-normal text-ink-soft">(optional)</span>
                  </label>
                  <input id="phone" value={form.phone} type="tel" autoComplete="tel"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
                  {/* Worth asking for: alerts go out on WhatsApp as well as email. */}
                  <p className="mt-1 text-xs text-ink-soft">For WhatsApp alerts when your table is ready.</p>
                </div>
              )}

              {role === 'manager' && (
                <div>
                  <label htmlFor="managerCode" className="eyebrow">Manager code</label>
                  <input id="managerCode" value={form.managerCode} required
                    onChange={(e) => setForm({ ...form, managerCode: e.target.value })} className={field} />
                  <p className="mt-1 text-xs text-ink-soft">
                    Provided by the restaurant owner — keeps strangers out of the console.
                  </p>
                </div>
              )}
            </div>

            {status.kind !== 'idle' && (
              <p role={status.kind === 'error' ? 'alert' : 'status'}
                className={`mt-5 rounded-md border px-3 py-2.5 text-sm ${
                  status.kind === 'ok'
                    ? 'border-free/30 bg-free/5 text-free'
                    : 'border-busy/30 bg-busy/5 text-busy'
                }`}>
                {status.message}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="mt-5 w-full rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">
              {loading ? 'Creating account…' : role === 'customer' ? 'Create customer account' : 'Create manager account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-soft">
            Already have an account?{' '}
            <a href="/login" className="font-semibold text-ink underline underline-offset-2">Sign in</a>
          </p>
        </div>
      </main>
    </div>
  );
}
