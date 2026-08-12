import React from 'react';

/**
 * Public landing page — the first thing a visitor sees at "/" before signing in.
 * Guests can book straight away; staff and the manager route to their own doors.
 */

const FEATURES = [
  ['🍽️', 'Reservations & waitlist', 'Book online, pick your favourite table and time — walk-ins join a live queue with honest wait estimates.'],
  ['📲', 'WhatsApp confirmations', 'Every booking is confirmed instantly on WhatsApp and email, with a reminder and one-tap "I’m coming" before you arrive.'],
  ['💳', 'Scan-to-pay billing', 'The bill arrives as a QR code — pay from your own phone, receipt lands in your inbox before you reach the door.'],
  ['📦', 'Live inventory', 'Every dish ordered deducts its exact ingredients from stock, so the kitchen never discovers an empty shelf mid-service.'],
  ['🤖', 'AI-read feedback', 'On-device AI reads every review — sentiment, topics, weekly summaries — nothing outsourced, nothing ignored.'],
  ['🧑‍🍳', 'Staff self-service', 'The team checks in, requests leave and sets availability from their own portal — the manager just approves.'],
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Top bar */}
      <header className="border-b border-ink bg-ink px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="eyebrow text-white/55">Welcome to</p>
            <p className="mt-0.5 font-display text-xl font-bold text-white">Main Bistro</p>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/staff"
              className="hidden rounded-md px-3.5 py-2 text-sm font-semibold text-white/70 transition hover:text-white sm:block">
              Staff portal
            </a>
            <a href="/login"
              className="rounded-md border border-white/25 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 md:px-8">
        {/* Hero */}
        <section className="py-14 text-center md:py-20">
          <p className="eyebrow">Restaurant management, end to end</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
            A table when you want it.
            <br />
            A kitchen that never runs dry.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-soft md:text-lg">
            Main Bistro runs on one system — bookings, orders, payments, stock and staff —
            so the food gets the attention, not the paperwork.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="/reservation"
              className="w-full rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink-soft sm:w-auto">
              Book a table
            </a>
            <a href="/register"
              className="w-full rounded-md border border-line bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:border-ink sm:w-auto">
              Create an account to order
            </a>
          </div>
          <p className="mt-4 text-xs text-ink-soft">
            Booking takes under a minute — confirmation arrives on WhatsApp.
          </p>
        </section>

        {/* Feature grid */}
        <section className="pb-14 md:pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="rounded-lg border border-line bg-white p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mt-3 font-display text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Doors strip */}
        <section className="mb-14 rounded-lg border border-line bg-white p-6 md:mb-20">
          <div className="grid gap-6 text-center sm:grid-cols-3">
            <div>
              <p className="eyebrow">Guests</p>
              <p className="mt-1.5 text-sm text-ink-soft">Reserve a table or sign in to order from your seat.</p>
              <a href="/reservation" className="mt-2 inline-block text-sm font-semibold text-ink underline underline-offset-2">Book a table →</a>
            </div>
            <div>
              <p className="eyebrow">Staff</p>
              <p className="mt-1.5 text-sm text-ink-soft">Check in for your shift, request leave, set availability.</p>
              <a href="/staff" className="mt-2 inline-block text-sm font-semibold text-ink underline underline-offset-2">Staff portal →</a>
            </div>
            <div>
              <p className="eyebrow">Manager</p>
              <p className="mt-1.5 text-sm text-ink-soft">Floor map, orders, inventory, analytics and feedback.</p>
              <a href="/login" className="mt-2 inline-block text-sm font-semibold text-ink underline underline-offset-2">Sign in →</a>
            </div>
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
