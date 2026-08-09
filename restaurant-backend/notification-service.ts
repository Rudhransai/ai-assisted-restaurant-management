/**
 * Standalone WhatsApp notification service.
 *
 * Run this in its OWN terminal, next to the frontend and backend:
 *
 *     npm run notify
 *
 * The main backend hands every WhatsApp notification to this service, and this service
 * delivers it through the Meta WhatsApp Cloud API as a plain FREE-FORM TEXT message —
 * no message templates, nothing to create or approve in the Meta dashboard.
 *
 * Requirements (developers.facebook.com → your app → WhatsApp → API Setup):
 *   - WHATSAPP_PHONE_NUMBER_ID  the test number's id
 *   - WHATSAPP_ACCESS_TOKEN     a CURRENT temporary token (they expire every 24 h!)
 *   - the customer's phone number added under "To" as a verified recipient, and that
 *     phone must have sent one message to the test number first (free-form replies are
 *     only delivered inside WhatsApp's 24-hour customer-service window).
 */

import 'dotenv/config';
import express from 'express';
import { normalisePhone } from './src/integrations/whatsappCloud';

const app = express();
app.use(express.json());

const PORT = Number(process.env.NOTIFY_PORT || 5001);
const VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'whatsapp-notification-service' });
});

app.post('/send', async (req, res) => {
  const { to, message } = req.body ?? {};
  if (!to || !message) {
    res.status(400).json({ ok: false, error: 'to and message are required' });
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    res.status(500).json({ ok: false, error: 'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN missing in .env' });
    return;
  }

  const digits = normalisePhone(String(to));
  if (!digits) {
    res.status(400).json({ ok: false, error: `Invalid phone number: ${to}` });
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: 'text',
        text: { preview_url: false, body: String(message) },
      }),
    });
    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = data?.error?.error_data?.details || data?.error?.message || `HTTP ${response.status}`;
      console.error(`❌ send failed  to=${digits}  ${reason}`);
      if (String(data?.error?.code) === '190') {
        console.error('   ↳ The access token has EXPIRED. Copy a fresh one from');
        console.error('     developers.facebook.com → WhatsApp → API Setup and paste it into .env');
      }
      res.status(502).json({ ok: false, error: reason });
      return;
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`✅ sent  to=${digits}  id=${messageId ?? 'unknown'}`);
    console.log(`   "${(String(message).split('\n')[0] ?? '').slice(0, 80)}"`);
    res.json({ ok: true, messageId });
  } catch (err: any) {
    console.error(`❌ send error  to=${digits}`, err?.message ?? err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

app.listen(PORT, () => {
  console.log('──────────────────────────────────────────────────');
  console.log('  WhatsApp Notification Service (Meta Cloud API)');
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log('  Free-form text messages — no templates needed');
  console.log('──────────────────────────────────────────────────');
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    console.warn('⚠️  WHATSAPP_ACCESS_TOKEN is not set — sends will fail until you add it to .env');
  }
});
