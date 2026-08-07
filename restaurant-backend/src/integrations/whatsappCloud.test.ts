import { describe, it, expect } from 'vitest';
import { normalisePhone } from './whatsappCloud';

describe('normalisePhone', () => {
  it('prefixes the default country on a bare national number', () => {
    expect(normalisePhone('9876543210', '91')).toBe('919876543210');
  });

  it('keeps a number that already has a country code', () => {
    expect(normalisePhone('+91 98765 43210', '91')).toBe('919876543210');
  });

  it('strips punctuation and a leading zero', () => {
    expect(normalisePhone('091-9876543210', '91')).toBe('919876543210');
  });

  it('strips a 00 international dial-out prefix', () => {
    expect(normalisePhone('00919876543210', '91')).toBe('919876543210');
  });

  it('handles legacy Twilio-style values', () => {
    expect(normalisePhone('whatsapp:+919876543210', '91')).toBe('919876543210');
  });

  it('rejects empty, too-short and too-long values', () => {
    expect(normalisePhone('', '91')).toBeNull();
    expect(normalisePhone('no digits', '91')).toBeNull();
    expect(normalisePhone('123', '91')).toBeNull();
    expect(normalisePhone('12345678901234567890', '91')).toBeNull();
  });
});
