import React, { useState } from 'react';
import { saveAuth, redirectForRole } from './auth';

export function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
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
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus({ kind: 'error', message: payload?.message ?? 'Registration failed' });
        return;
      }

      saveAuth(payload.data.token, payload.data.user);
      setStatus({ kind: 'ok', message: 'Account created! Redirecting…' });
      setTimeout(() => redirectForRole('customer'), 800);
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold text-slate-900">Create account</h1>
        <p className="mt-2 text-sm text-slate-600">Register to select a table and get email alerts when it becomes free.</p>

        <form onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="grid gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Full name"
              required
            />
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
              minLength={6}
              required
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Phone (optional)"
            />
          </div>

          {status.kind !== 'idle' && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                status.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-amber-800 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
