import nodemailer from 'nodemailer';

export type NotificationType = 'mail' | 'whatsapp' | 'sms';

export interface SendNotificationInput {
  type: NotificationType;
  recipient: string; // email address or phone number, depending on type
  content: string;
  subject?: string;
}

export interface SendNotificationResult {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v || undefined;
}

function buildHtmlBody(content: string): string {
  const lines = content.split('\n').map((line) => {
    if (!line.trim()) return '<br/>';
    return `<p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.6;">${line}</p>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#92400e;padding:28px 32px;">
              <p style="margin:0;color:#fef3c7;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Restaurant</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Notification</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${lines.join('\n              ')}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f3f4f6;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated message from your restaurant management system. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  if (!input?.recipient || !input?.content) {
    return { ok: false, provider: 'none', error: 'Missing recipient or content' };
  }

  // ── MAIL ──────────────────────────────────────────────────────────────────
  if (input.type === 'mail') {
    const smtpHost = env('MAIL_SMTP_HOST');
    const portRaw  = env('MAIL_SMTP_PORT');
    const user     = env('MAIL_SMTP_USER');
    const pass     = env('MAIL_SMTP_PASS');
    const from     = env('MAIL_FROM');

    if (!smtpHost || !portRaw || !user || !pass || !from) {
      return { ok: false, provider: 'smtp', error: 'Missing MAIL_* environment variables' };
    }

    const port = Number(portRaw);

    try {
      // Use Gmail service shorthand when possible for most reliable config
      const isGmail = smtpHost === 'smtp.gmail.com';
      const transportConfig = isGmail
        ? { service: 'gmail', auth: { user, pass } }
        : {
            host: smtpHost,
            port,
            secure: port === 465,
            requireTLS: port === 587,
            auth: { user, pass },
          };

      const transporter = nodemailer.createTransport(transportConfig);

      const info = await transporter.sendMail({
        from,
        to: input.recipient,          // always the CUSTOMER's email, never the SMTP sender
        subject: input.subject ?? 'Notification from the restaurant',
        text: input.content,          // plain-text fallback
        html: buildHtmlBody(input.content),
      });

      console.log(
        `[NotificationSender] ✉️  mail sent  from=${from}  to=${input.recipient}  msgId=${info.messageId}`
      );

      return { ok: true, provider: isGmail ? 'gmail' : 'smtp', messageId: info.messageId ?? undefined };
    } catch (err: any) {
      console.error('[NotificationSender] mail send failed', err?.message ?? err);
      return { ok: false, provider: 'smtp', error: err?.message ?? String(err) };
    }
  }

  // ── WHATSAPP / SMS (Twilio) ────────────────────────────────────────────────
  const twilioAccountSid   = env('TWILIO_ACCOUNT_SID');
  const twilioAuthToken    = env('TWILIO_AUTH_TOKEN');
  const twilioFromWhatsApp = env('TWILIO_FROM_WHATSAPP');
  const twilioFromSms      = env('TWILIO_FROM_SMS');

  if (!twilioAccountSid || !twilioAuthToken) {
    return { ok: false, provider: 'twilio', error: 'Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN' };
  }

  try {
    const { Twilio } = await import('twilio');
    const client = new Twilio(twilioAccountSid, twilioAuthToken);

    if (input.type === 'whatsapp') {
      if (!twilioFromWhatsApp) {
        return { ok: false, provider: 'twilio', error: 'Missing TWILIO_FROM_WHATSAPP' };
      }
      const msg = await client.messages.create({
        from: twilioFromWhatsApp,
        to: input.recipient,
        body: input.content,
      });
      console.log(`[NotificationSender] WhatsApp sent to=${input.recipient} sid=${msg.sid}`);
      return { ok: true, provider: 'twilio', messageId: msg.sid };
    }

    // SMS
    if (!twilioFromSms) {
      return { ok: false, provider: 'twilio', error: 'Missing TWILIO_FROM_SMS' };
    }
    const msg = await client.messages.create({
      from: twilioFromSms,
      to: input.recipient,
      body: input.content,
    });
    console.log(`[NotificationSender] SMS sent to=${input.recipient} sid=${msg.sid}`);
    return { ok: true, provider: 'twilio', messageId: msg.sid };
  } catch (err: any) {
    console.error('[NotificationSender] Twilio send failed', err?.message ?? err);
    return { ok: false, provider: 'twilio', error: err?.message ?? String(err) };
  }
}
