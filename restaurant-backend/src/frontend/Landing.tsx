import React, { useEffect, useMemo, useState } from 'react';

/**
 * Public landing page — the first thing a visitor sees at "/" before signing in.
 *
 * Two live sections keep it honest rather than decorative: the availability strip
 * shows the real floor (auto-refreshing), and the menu tabs show the real dishes the
 * kitchen sells — both from public read-only endpoints.
 */

type PublicTable = { id: string; tableNumber: string; capacity: number; zone: string; status: string };
type Dish = { id: string; name: string; description: string; price: number; category: string };

const FEATURES = [
  ['🍽️', 'Reservations & waitlist', 'Book online, pick your favourite table and time — walk-ins join a live queue with honest wait estimates.'],
  ['📲', 'WhatsApp confirmations', 'Every booking is confirmed instantly on WhatsApp and email, with a reminder and one-tap "I’m coming" before you arrive.'],
  ['💳', 'Scan-to-pay billing', 'The bill arrives as a QR code — pay from your own phone, receipt lands in your inbox before you reach the door.'],
  ['📦', 'Live inventory', 'Every dish ordered deducts its exact ingredients from stock, so the kitchen never runs out mid-service.'],
  ['🤖', 'AI-read feedback', 'On-device AI reads every review — sentiment, topics, weekly summaries — nothing outsourced, nothing ignored.'],
  ['⏰', 'Smart reminders', 'Forgot your booking? We nudge you two hours ahead — confirm or cancel with a single tap.'],
];

export function Landing() {
  const [tables, setTables] = useState<PublicTable[]>([]);
  const [menu, setMenu] = useState<Dish[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');

  // Live floor status; refreshed every 30 s so the numbers stay honest.
  useEffect(() => {
    const load = () =>
      fetch('/api/v1/public/tables')
        .then((r) => r.json())
        .then((p) => { if (Array.isArray(p?.data)) setTables(p.data); })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch('/api/v1/public/menu')
      .then((r) => r.json())
      .then((p) => {
        if (Array.isArray(p?.data) && p.data.length > 0) {
          setMenu(p.data);
          setActiveCategory(p.data[0].category);
        }
      })
      .catch(() => undefined);
  }, []);

  const categories = useMemo(() => [...new Set(menu.map((d) => d.category))], [menu]);
  const dishes = useMemo(() => menu.filter((d) => d.category === activeCategory), [menu, activeCategory]);
  const freeCount = tables.filter((t) => t.status === 'Available').length;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-ink bg-ink px-4 py-3.5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="eyebrow text-white/55">Welcome to</p>
            <p className="mt-0.5 font-display text-xl font-bold text-white">Main Bistro</p>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#menu" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-white/70 transition hover:text-white sm:block">Menu</a>
            <a href="#why" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-white/70 transition hover:text-white sm:block">Why us</a>
            <a href="/login" className="rounded-md border border-white/25 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10">Sign in</a>
            <a href="/reservation" className="rounded-md bg-white px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-white/85">Book a table</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8">
        {/* Hero */}
        <section className="pb-10 pt-14 text-center md:pt-20">
          <p className="eyebrow rise">Restaurant management, end to end</p>
          <h1 className="rise rise-1 mx-auto mt-3 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
            A table when you want it.
            <br />
            A kitchen that never runs dry.
          </h1>
          <p className="rise rise-2 mx-auto mt-5 max-w-2xl text-base text-ink-soft md:text-lg">
            Main Bistro runs on one system — bookings, orders, payments and stock —
            so the food gets the attention, not the paperwork.
          </p>
          <div className="rise rise-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/reservation"
              className="lift w-full rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white sm:w-auto">
              Book a table
            </a>
            <a href="/register"
              className="lift w-full rounded-md border border-line bg-white px-6 py-3 text-sm font-semibold text-ink sm:w-auto">
              Create an account to order
            </a>
          </div>
          <p className="rise rise-3 mt-4 text-xs text-ink-soft">
            Booking takes under a minute — confirmation arrives on WhatsApp.
          </p>
        </section>

        {/* Live availability strip */}
        {tables.length > 0 && (
          <section className="rise rise-3 mb-14 rounded-lg border border-line bg-white p-5 md:mb-16">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div>
                <p className="flex items-center gap-2 font-display text-lg font-bold">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${freeCount > 0 ? 'bg-free pulse-dot' : 'bg-busy'}`} />
                  {freeCount > 0
                    ? `${freeCount} of ${tables.length} tables free right now`
                    : 'Fully booked right now — join the waitlist'}
                </p>
                <p className="mt-1 text-sm text-ink-soft">Live from the floor · updates every 30 seconds</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Table availability map">
                {tables.map((t) => (
                  <span key={t.id} title={`Table ${t.tableNumber} (${t.zone}) — ${t.status}`}
                    className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold text-white transition-transform hover:scale-110 ${
                      t.status === 'Available' ? 'bg-free' : t.status === 'Reserved' ? 'bg-hold' : 'bg-busy'
                    }`}>
                    {t.tableNumber}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-1 text-xs text-ink-soft">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-free" /> Free</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-hold" /> Reserved</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-busy" /> Occupied</span>
              </div>
            </div>
          </section>
        )}

        {/* Menu with category tabs */}
        {menu.length > 0 && (
          <section id="menu" className="mb-14 scroll-mt-24 md:mb-16">
            <div className="text-center">
              <p className="eyebrow">Taste first, book after</p>
              <h2 className="mt-2 font-display text-3xl font-bold">Our menu</h2>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setActiveCategory(c)}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeCategory === c
                      ? 'bg-ink text-white'
                      : 'border border-line bg-white text-ink-soft hover:border-ink hover:text-ink'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dishes.map((d) => (
                <div key={d.id} className="lift rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-bold">{d.name}</h3>
                    <span className="data shrink-0 text-sm font-semibold">₹{d.price.toFixed(2)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{d.description}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center">
              <a href="/register" className="text-sm font-semibold text-ink underline underline-offset-2">
                Create an account to order any of these from your table →
              </a>
            </p>
          </section>
        )}

        {/* Feature grid */}
        <section id="why" className="mb-14 scroll-mt-24 md:mb-16">
          <div className="text-center">
            <p className="eyebrow">Why dine with us</p>
            <h2 className="mt-2 font-display text-3xl font-bold">Small details, done automatically</h2>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="lift rounded-lg border border-line bg-white p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mt-3 font-display text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mb-14 rounded-lg bg-ink p-8 text-center text-white md:mb-20 md:p-10">
          <h2 className="font-display text-2xl font-bold md:text-3xl">Hungry already?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/70 md:text-base">
            Reserve in under a minute. We’ll confirm on WhatsApp, remind you before you arrive,
            and have the table ready when you walk in.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/reservation" className="lift w-full rounded-md bg-white px-6 py-3 text-sm font-semibold text-ink sm:w-auto">
              Book a table
            </a>
            <a href="/login" className="lift w-full rounded-md border border-white/30 px-6 py-3 text-sm font-semibold text-white sm:w-auto">
              Sign in
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-ink-soft sm:flex-row">
          <p>Main Bistro · AI-Assisted Restaurant Management System</p>
          <p>Open daily · 12:00 – 23:00</p>
        </div>
      </footer>
    </div>
  );
}
