/**
 * Meta WhatsApp Cloud API provider.
 *
 * Business-initiated messages (order confirmations, reservation reminders) MUST use a
 * pre-approved template. Free-form text only works inside the 24-hour window after the
 * customer last messaged you — outside that window Meta silently drops it, so we warn.
 *
 * Required env:
 *   WHATSAPP_PHONE_NUMBER_ID   from the Meta app dashboard (NOT the phone number itself)
 *   WHATSAPP_ACCESS_TOKEN      System User token (permanent) or 24h test token
 *   WHATSAPP_API_VERSION       optional, defaults to v21.0
 *   WHATSAPP_DEFAULT_COUNTRY   optional, defaults to 91 (India) — used to normalise
 *                              local numbers like "9876543210" to "+919876543210"
 */

export interface WhatsAppTemplate {
  /** Template name exactly as approved in the Meta dashboard. */
  name: string;
  /** BCP-47 code registered with the template, e.g. "en" or "en_US". */
  languageCode?: string;
  /** Ordered values for {{1}}, {{2}}, ... in the template body. */
  params?: string[];
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: 'meta';
  messageId?: string;
  error?: string;
}

/**
 * Normalise a phone number to E.164 without the leading "+".
 * Meta expects digits only: 919876543210
 *
 * Handles the formats this app actually receives:
 *   "9876543210"        -> 919876543210   (default country prefixed)
 *   "+91 98765 43210"   -> 919876543210
 *   "091-9876543210"    -> 919876543210
 *   "whatsapp:+9198..." -> 919876543210   (legacy Twilio-style values already in the DB)
 */
export function normalisePhone(raw: string, defaultCountry = process.env.WHATSAPP_DEFAULT_COUNTRY || '91'): string | null {
  if (!raw) return null;

  let digits = raw.replace(/^whatsapp:/i, '').replace(/\D/g, '');
  if (!digits) return null;

  // Strip international dial-out prefixes: 00XX... or a single leading 0 on a local number.
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  // Bare national number (India: 10 digits) — prefix the country code.
  if (digits.length <= 10) digits = `${defaultCountry}${digits}`;

  // E.164 allows at most 15 digits, and anything under 8 is not a real number.
  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

function requiredEnv(): { phoneNumberId: string; token: string; apiVersion: string } | { error: string } {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    return { error: 'Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN' };
  }

  return {
    phoneNumberId,
    token,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  };
}

/**
 * Send a WhatsApp message through the Meta Cloud API.
 *
 * Pass `template` for anything business-initiated. `body` is only used when no template
 * is supplied, and is only deliverable inside the 24-hour customer service window.
 */
export async function sendWhatsAppCloud(args: {
  to: string;
  body?: string;
  template?: WhatsAppTemplate;
}): Promise<WhatsAppSendResult> {
  const config = requiredEnv();
  if ('error' in config) {
    return { ok: false, provider: 'meta', error: config.error };
  }

  const to = normalisePhone(args.to);
  if (!to) {
    return { ok: false, provider: 'meta', error: `Invalid phone number: ${args.to}` };
  }

  if (!args.template) {
    console.warn(
      '[WhatsApp] Sending free-form text. This is only delivered inside the 24-hour ' +
        'customer service window — use an approved template for reminders and confirmations.'
    );
  }

  const payload = args.template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: args.template.name,
          language: { code: args.template.languageCode || 'en' },
          ...(args.template.params?.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: args.template.params.map((text) => ({ type: 'text', text })),
                  },
                ],
              }
            : {}),
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: args.body ?? '' },
      };

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  // Never let a slow/hanging Meta call block a reservation or an order response.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Meta nests the useful part in error.message; error.error_data.details is often more specific.
      const metaError =
        data?.error?.error_data?.details || data?.error?.message || `HTTP ${response.status}`;
      console.error(`[WhatsApp] send failed to=${to} error=${metaError}`);
      return { ok: false, provider: 'meta', error: metaError };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`[WhatsApp] sent to=${to} id=${messageId ?? 'unknown'}`);
    return { ok: true, provider: 'meta', messageId };
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? 'Request timed out after 10s' : err?.message ?? String(err);
    console.error(`[WhatsApp] send error to=${to}`, message);
    return { ok: false, provider: 'meta', error: message };
  } finally {
    clearTimeout(timeout);
  }
}
