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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Choose your role and enter your credentials.</p>

        <div className="mt-6 flex gap-2 rounded-xl border border-slate-200 bg-white/90 p-1">
          {(['customer', 'manager'] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                role === r ? 'bg-amber-700 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="grid gap-3">
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Email"
              type="email"
              required
            />
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Password"
              type="password"
              required
            />
          </div>

          {status.kind === 'error' && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {role === 'customer' && (
          <p className="mt-4 text-center text-sm text-slate-600">
            New here?{' '}
            <a href="/register" className="font-medium text-amber-800 hover:underline">
              Create an account
            </a>
          </p>
        )}

        {role === 'manager' && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
            Default manager: <span className="font-mono">manager@restaurant.com</span> / <span className="font-mono">manager123</span>
          </p>
        )}
      </div>
    </div>
  );
}
