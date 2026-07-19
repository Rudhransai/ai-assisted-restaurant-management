import React, { useState } from 'react';

export function PublicReservation() {
  const [form, setForm] = useState({
    guestName: '',
    email: '',
    phone: '',
    time: '20:00',
    partySize: '2',
  });
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; message?: string }>({
    kind: 'idle',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'idle' });

    try {
      const res = await fetch('/api/v1/public/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: form.guestName,
          email: form.email,
          phone: form.phone,
          time: form.time,
          partySize: Number(form.partySize),
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus({ kind: 'error', message: payload?.message ?? 'Failed to submit reservation' });
        return;
      }

      setStatus({
        kind: 'ok',
        message: payload?.data?.status
          ? `Added to waitlist (status: ${payload.data.status}). Manager will assign a table when available.`
          : 'Reservation received. Manager will contact you shortly.',
      });

      setForm({ guestName: '', email: '', phone: '', time: '20:00', partySize: '2' });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? String(err) });
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_35%),linear-gradient(135deg,_#fffaf2_0%,_#f8fafc_100%)] p-4 md:p-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold text-slate-900">Book a table</h1>
        <p className="mt-2 text-sm text-slate-600">
          If no table is available, we’ll add you to the waitlist. You’ll be notified when a table is assigned.
        </p>

        <form onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.guestName}
              onChange={(e) => setForm({ ...form, guestName: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Name"
            />
            <input
              value={form.partySize}
              onChange={(e) => setForm({ ...form, partySize: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Party size"
              type="number"
              min="1"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Email (optional for SMS/WhatsApp fallback)"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Phone (required)"
            />
            <input
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              placeholder="Time (HH:MM)"
            />
            <div />
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

          <div className="mt-5 flex justify-end">
            <button type="submit" className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">
              Reserve / Join waitlist
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

