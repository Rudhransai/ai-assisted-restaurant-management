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
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'idle' });
    setSubmitting(true);

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
        setStatus({ kind: 'error', message: payload?.message ?? 'We could not save that booking. Check your details and try again.' });
        return;
      }

      setStatus({
        kind: 'ok',
        message: payload?.data?.status
          ? "You're on the list. We'll message you as soon as a table is ready."
          : "Booking received. We'll be in touch shortly to confirm.",
      });

      setForm({ guestName: '', email: '', phone: '', time: '20:00', partySize: '2' });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message ?? String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5';

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-ink bg-ink px-4 py-4 md:px-8">
        <p className="eyebrow text-white/55">Restaurant</p>
        <p className="mt-0.5 font-display text-lg font-bold text-white">Book a table</p>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-10 md:px-8">
        <h1 className="font-display text-3xl font-bold">Reserve your table</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Tell us when you're coming and how many of you there are. If nothing is free at that
          time, we'll hold your place on the waitlist and message you the moment a table opens.
        </p>

        <form onSubmit={submit} className="mt-6 rounded-lg border border-line bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="guestName" className="eyebrow">Name</label>
              <input id="guestName" value={form.guestName} required autoComplete="name"
                onChange={(e) => setForm({ ...form, guestName: e.target.value })} className={field} />
            </div>

            <div>
              <label htmlFor="partySize" className="eyebrow">Guests</label>
              <input id="partySize" value={form.partySize} type="number" min="1" max="30" required
                onChange={(e) => setForm({ ...form, partySize: e.target.value })} className={field} />
            </div>

            <div>
              <label htmlFor="time" className="eyebrow">Time</label>
              <input id="time" value={form.time} type="time" required
                onChange={(e) => setForm({ ...form, time: e.target.value })} className={field} />
            </div>

            <div>
              <label htmlFor="phone" className="eyebrow">Phone</label>
              <input id="phone" value={form.phone} type="tel" required autoComplete="tel"
                onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} />
              <p className="mt-1 text-xs text-ink-soft">We'll send your confirmation here on WhatsApp.</p>
            </div>

            <div>
              <label htmlFor="email" className="eyebrow">Email <span className="font-normal normal-case tracking-normal text-ink-soft">(optional)</span></label>
              <input id="email" value={form.email} type="email" autoComplete="email"
                onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
            </div>
          </div>

          {status.kind !== 'idle' && (
            <p role="status"
              className={`mt-5 rounded-md border px-3 py-2.5 text-sm ${
                status.kind === 'ok'
                  ? 'border-free/30 bg-free/5 text-free'
                  : 'border-busy/30 bg-busy/5 text-busy'
              }`}>
              {status.message}
            </p>
          )}

          <button type="submit" disabled={submitting}
            className="mt-5 w-full rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55 sm:w-auto">
            {submitting ? 'Booking…' : 'Book table'}
          </button>
        </form>
      </main>
    </div>
  );
}
