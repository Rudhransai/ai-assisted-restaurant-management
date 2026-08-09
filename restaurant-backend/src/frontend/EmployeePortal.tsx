import React, { useState } from 'react';

/**
 * Kiosk-style staff portal at /staff — no login. The employee identifies themselves with
 * their employee code, then marks their own attendance and submits their own leave and
 * availability. The manager only reviews and approves from the dashboard.
 */

type SelfStatus = {
  employee: { id: string; employeeCode: string; fullName: string; role: string; status: string };
  todayAttendance: { checkIn: string; checkOut: string; attendanceStatus: string; workingHours: number; shiftName?: string } | null;
  upcomingShifts: Array<{ shiftDate: string; shiftName: string; startTime: string; endTime: string }>;
  recentLeave: Array<{ id: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string }>;
};

export function EmployeePortal() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<SelfStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'Casual Leave', startDate: '', endDate: '', reason: '' });
  const [availForm, setAvailForm] = useState({ availableFrom: '', availableTo: '', status: 'Available', remarks: '' });

  const field = 'mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5';

  const refresh = async (empCode: string) => {
    const res = await fetch(`/api/v1/staff/self/${encodeURIComponent(empCode)}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(null);
      setMsg({ kind: 'error', text: payload?.message ?? 'No employee found with that code.' });
      return;
    }
    setStatus(payload.data);
    setMsg(null);
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try { await refresh(code.trim()); } finally { setBusy(false); }
  };

  const act = async (path: string, body?: unknown) => {
    if (!status) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/staff/self/${encodeURIComponent(status.employee.employeeCode)}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'error', text: payload?.message ?? 'That did not work — try again.' });
        return false;
      }
      await refresh(status.employee.employeeCode);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async () => { if (await act('check-in')) setMsg({ kind: 'ok', text: '✅ Checked in. Have a good shift!' }); };
  const checkOut = async () => { if (await act('check-out')) setMsg({ kind: 'ok', text: '✅ Checked out. See you tomorrow!' }); };

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.startDate || !leaveForm.endDate) return;
    if (await act('leave', leaveForm)) {
      setMsg({ kind: 'ok', text: '✅ Leave request submitted — pending manager approval.' });
      setLeaveForm({ leaveType: 'Casual Leave', startDate: '', endDate: '', reason: '' });
    }
  };

  const submitAvail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availForm.availableFrom || !availForm.availableTo) return;
    if (await act('availability', availForm)) {
      setMsg({ kind: 'ok', text: '✅ Availability recorded.' });
      setAvailForm({ availableFrom: '', availableTo: '', status: 'Available', remarks: '' });
    }
  };

  const checkedIn = !!status?.todayAttendance?.checkIn;
  const checkedOut = !!status?.todayAttendance?.checkOut;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-ink bg-ink px-4 py-4 md:px-8">
        <p className="eyebrow text-white/55">Restaurant</p>
        <p className="mt-0.5 font-display text-lg font-bold text-white">Staff portal</p>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-10 md:px-8">
        <h1 className="font-display text-3xl font-bold">Your shift, your records</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Enter your employee code to mark attendance, request leave, or set your availability.
          Your manager sees everything you submit here.
        </p>

        <form onSubmit={lookup} className="mt-6 flex gap-3 rounded-lg border border-line bg-white p-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Employee code (e.g. EMP001)"
            className="w-full rounded-md border border-line bg-white px-3 py-2.5"
            autoComplete="off"
          />
          <button type="submit" disabled={busy}
            className="shrink-0 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">
            {busy && !status ? 'Looking…' : 'Continue'}
          </button>
        </form>

        {msg && (
          <p role="status" className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${msg.kind === 'ok' ? 'border-free/30 bg-free/5 text-free' : 'border-busy/30 bg-busy/5 text-busy'}`}>
            {msg.text}
          </p>
        )}

        {status && (
          <div className="mt-6 space-y-6">
            {/* Who + today's attendance */}
            <section className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold">{status.employee.fullName}</p>
                  <p className="text-sm text-ink-soft">{status.employee.role} · {status.employee.employeeCode}</p>
                </div>
                <div className="flex gap-2">
                  {!checkedIn && (
                    <button onClick={() => void checkIn()} disabled={busy}
                      className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">
                      Check in
                    </button>
                  )}
                  {checkedIn && !checkedOut && (
                    <button onClick={() => void checkOut()} disabled={busy}
                      className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">
                      Check out
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-line bg-paper px-3 py-2.5">
                  <p className="eyebrow">Check-in</p>
                  <p className="mt-1 font-semibold">{status.todayAttendance?.checkIn || '—'}</p>
                </div>
                <div className="rounded-md border border-line bg-paper px-3 py-2.5">
                  <p className="eyebrow">Check-out</p>
                  <p className="mt-1 font-semibold">{status.todayAttendance?.checkOut || '—'}</p>
                </div>
                <div className="rounded-md border border-line bg-paper px-3 py-2.5">
                  <p className="eyebrow">Shift today</p>
                  <p className="mt-1 font-semibold">{status.todayAttendance?.shiftName || status.upcomingShifts[0]?.shiftName || 'Unassigned'}</p>
                </div>
              </div>
            </section>

            {/* Upcoming shifts */}
            <section className="rounded-lg border border-line bg-white p-5">
              <p className="eyebrow mb-3">Your upcoming shifts</p>
              {status.upcomingShifts.length === 0 ? (
                <p className="text-sm text-ink-soft italic">Nothing scheduled yet — check back later.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {status.upcomingShifts.map((s, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2">
                      <span className="font-semibold">{s.shiftDate}</span>
                      <span>{s.shiftName}</span>
                      <span className="text-ink-soft">{s.startTime} – {s.endTime}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Leave request */}
            <section className="rounded-lg border border-line bg-white p-5">
              <p className="eyebrow mb-3">Request leave</p>
              <form onSubmit={submitLeave} className="grid gap-3 sm:grid-cols-2">
                <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className={field}>
                  <option>Casual Leave</option><option>Sick Leave</option><option>Earned Leave</option><option>Unpaid Leave</option>
                </select>
                <input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason (optional)" className={field} />
                <div>
                  <label className="eyebrow">From</label>
                  <input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className={field} />
                </div>
                <div>
                  <label className="eyebrow">To</label>
                  <input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className={field} />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={busy} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">Submit request</button>
                </div>
              </form>
              {status.recentLeave.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {status.recentLeave.map((l) => (
                    <li key={l.id} className="flex items-center justify-between rounded-md border border-line bg-paper px-3 py-2">
                      <span>{l.leaveType} · {l.startDate} → {l.endDate}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.status === 'Approved' ? 'bg-free/10 text-free' : l.status === 'Rejected' ? 'bg-busy/10 text-busy' : 'bg-hold/10 text-hold'}`}>{l.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Availability */}
            <section className="rounded-lg border border-line bg-white p-5">
              <p className="eyebrow mb-3">Set your availability</p>
              <form onSubmit={submitAvail} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="eyebrow">Available from</label>
                  <input type="date" required value={availForm.availableFrom} onChange={(e) => setAvailForm({ ...availForm, availableFrom: e.target.value })} className={field} />
                </div>
                <div>
                  <label className="eyebrow">Available to</label>
                  <input type="date" required value={availForm.availableTo} onChange={(e) => setAvailForm({ ...availForm, availableTo: e.target.value })} className={field} />
                </div>
                <select value={availForm.status} onChange={(e) => setAvailForm({ ...availForm, status: e.target.value })} className={field}>
                  <option>Available</option><option>Unavailable</option>
                </select>
                <input value={availForm.remarks} onChange={(e) => setAvailForm({ ...availForm, remarks: e.target.value })} placeholder="Remarks (optional)" className={field} />
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={busy} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-55">Save availability</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
