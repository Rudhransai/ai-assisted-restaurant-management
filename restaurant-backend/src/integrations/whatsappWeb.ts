/**
 * WhatsApp provider without Meta templates (Baileys).
 *
 * No Meta business account, no approved templates, no browser. This links a real
 * WhatsApp account over the same protocol WhatsApp Web uses: on first run a QR code is
 * printed in the server terminal — scan it from the phone (WhatsApp → Settings →
 * Linked devices → Link a device) and the session is saved to .baileys_auth/, so later
 * restarts reconnect silently. From then on every notification goes out as an ordinary
 * free-form message from that account.
 *
 * Enable with WHATSAPP_PROVIDER=web in .env.
 *
 * .baileys_auth/ holds live credentials for the linked account — it is git-ignored and
 * must never be committed.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { normalisePhone } from './whatsappCloud';

const AUTH_DIR = '.baileys_auth';

let sock: ReturnType<typeof makeWASocket> | null = null;
let isReady = false;
let starting: Promise<void> | null = null;
let readyResolvers: Array<() => void> = [];

function signalReady() {
  isReady = true;
  for (const resolve of readyResolvers) resolve();
  readyResolvers = [];
}

function waitUntilReady(timeoutMs: number): Promise<boolean> {
  if (isReady) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    readyResolvers.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export function initWhatsAppWeb(): Promise<void> {
  if (starting) return starting;
  starting = start();
  return starting;
}

async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined as any }));

  sock = makeWASocket({
    auth: state,
    ...(version ? { version } : {}),
    // Baileys logs a lot at info level; keep the terminal readable.
    logger: pino({ level: 'error' }) as any,
    browser: ['Restaurant Manager', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WhatsApp] Not linked yet. Scan this QR with the restaurant phone:');
      console.log('[WhatsApp] WhatsApp → Settings → Linked devices → Link a device\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('[WhatsApp] ✅ Connected. Notifications will be sent from this account.');
      signalReady();
    }

    if (connection === 'close') {
      isReady = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('[WhatsApp] Logged out from the phone. Delete .baileys_auth/ and restart to scan again.');
      } else {
        console.warn('[WhatsApp] Connection closed — reconnecting…');
        starting = null;
        void initWhatsAppWeb();
      }
    }
  });
}

export async function sendWhatsAppWeb(args: { to: string; body: string }): Promise<{
  ok: boolean;
  provider: 'whatsapp-web';
  messageId?: string;
  error?: string;
}> {
  const digits = normalisePhone(args.to);
  if (!digits) {
    return { ok: false, provider: 'whatsapp-web', error: `Invalid phone number: ${args.to}` };
  }

  if (!starting) void initWhatsAppWeb();

  // Give a cold connection time to come up, but never hang a request forever.
  const ready = await waitUntilReady(30_000);
  if (!ready || !sock) {
    return {
      ok: false,
      provider: 'whatsapp-web',
      error: 'WhatsApp is not connected. Check the server terminal for the QR code and scan it.',
    };
  }

  try {
    const jid = `${digits}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, { text: args.body });
    console.log(`[WhatsApp] sent to=${digits} id=${result?.key?.id ?? 'unknown'}`);
    return { ok: true, provider: 'whatsapp-web', ...(result?.key?.id ? { messageId: result.key.id } : {}) };
  } catch (err: any) {
    console.error(`[WhatsApp] send failed to=${digits}:`, err?.message ?? err);
    return { ok: false, provider: 'whatsapp-web', error: err?.message ?? String(err) };
  }
}
