import { describe, it, expect } from 'vitest';
import { parseReservationTime, formatReservationTime } from './reservationTime';

describe('parseReservationTime', () => {
  // Fixed reference clock: 7 Aug 2026, 18:00 local time.
  const now = new Date(2026, 7, 7, 18, 0, 0);

  it('interprets a bare HH:MM still ahead today as today', () => {
    const result = parseReservationTime('19:30', now);
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(7);
    expect(result!.getHours()).toBe(19);
    expect(result!.getMinutes()).toBe(30);
  });

  it('rolls a bare HH:MM already past today over to tomorrow', () => {
    const result = parseReservationTime('09:00', now);
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(8);
    expect(result!.getHours()).toBe(9);
  });

  it('rolls the current minute over to tomorrow', () => {
    const result = parseReservationTime('18:00', now);
    expect(result!.getDate()).toBe(8);
  });

  it('accepts single-digit hours', () => {
    const result = parseReservationTime('9:15', now);
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(9);
    expect(result!.getMinutes()).toBe(15);
  });

  it('accepts datetime-local input as local time', () => {
    const result = parseReservationTime('2026-12-24T20:00', now);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(11);
    expect(result!.getDate()).toBe(24);
    expect(result!.getHours()).toBe(20);
  });

  it('accepts full ISO input', () => {
    const result = parseReservationTime('2026-12-24T20:00:00.000Z', now);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-12-24T20:00:00.000Z');
  });

  it('rejects empty and unparseable input', () => {
    expect(parseReservationTime('', now)).toBeNull();
    expect(parseReservationTime('   ', now)).toBeNull();
    expect(parseReservationTime('around eight', now)).toBeNull();
    expect(parseReservationTime('25:00', now)).toBeNull();
    expect(parseReservationTime('19:60', now)).toBeNull();
  });
});

describe('formatReservationTime', () => {
  it('formats an ISO timestamp for humans', () => {
    const stored = new Date(2026, 7, 7, 19, 30).toISOString();
    const display = formatReservationTime(stored);
    expect(display).toContain('Aug');
    expect(display).toContain('7');
    expect(display.toLowerCase()).toContain('pm');
  });

  it('returns legacy free-form values as stored', () => {
    expect(formatReservationTime('19:30-ish, ask for Raj')).toBe('19:30-ish, ask for Raj');
  });
});
