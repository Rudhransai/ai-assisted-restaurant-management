import React, { useState } from 'react';
import { saveAuth, redirectForRole } from './auth';

type Role = 'customer' | 'manager';

export function Login() {
  const [role, setRole] = useState<Role>('customer');
  const [form, setForm] = useState({ email: '', password: '' });
  const [status, setStatus] = useState<{ kind: 'idle' | 'error'; message?: string }>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle' });

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus({ kind: 'error', message: payload?.message ?? 'Login failed' });
        return;
      }

      saveAuth(payload.data.token, payload.data.user);
      redirectForRole(payload.data.user.role);
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-ink bg-ink px-4 py-4 md:px-8">
        <p className="eyebrow text-white/55">Restaurant</p>
        <p className="mt-0.5 font-display text-lg font-bold text-white">Floor &amp; Service</p>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Pick how you're signing in, then enter your details.</p>

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
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-white p-5">
            <div className="grid gap-3">
              <div>
                <label htmlFor="email" className="eyebrow">Email</label>
                <input
                  id="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="eyebrow">Password</label>
                <input
                  id="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {status.kind === 'error' && (
              <p role="alert" className="mt-4 rounded-md border border-busy/30 bg-busy/5 px-3 py-2.5 text-sm text-busy">
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {role === 'customer' && (
            <p className="mt-4 text-center text-sm text-ink-soft">
              New here? <a href="/register" className="font-semibold text-ink underline underline-offset-2">Create an account</a>
            </p>
          )}

          {/*
            The seeded manager credentials used to be printed here in every environment.
            On a deployed site that hands anyone a manager login, so it is now
            development-only and Vite strips it from the production bundle.
          */}
          {role === 'manager' && import.meta.env.DEV && (
            <p className="mt-4 rounded-md border border-line bg-white px-3 py-2.5 text-xs text-ink-soft">
              Dev seed account: <span className="data">manager@restaurant.com</span> / <span className="data">manager123</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
