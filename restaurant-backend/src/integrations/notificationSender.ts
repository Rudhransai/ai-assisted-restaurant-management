import nodemailer from 'nodemailer';

export type NotificationType = 'mail' | 'whatsapp' | 'sms';


export interface SendNotificationInput {
  type: NotificationType;
  recipient: string; // email or phone, depending on type
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
  if (!v) return undefined;
  return v;
}

export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  if (!input?.recipient || !input?.content) {
    return {
      ok: false,
      provider: 'none',
      error: 'Missing recipient/content',
    };
  }

  // MAIL (existing)
  if (input.type === 'mail') {
    const host = env('MAIL_SMTP_HOST');
    const portRaw = env('MAIL_SMTP_PORT');
    const user = env('MAIL_SMTP_USER');
    const pass = env('MAIL_SMTP_PASS');
    const from = env('MAIL_FROM');

    const port = portRaw ? Number(portRaw) : undefined;

    if (!host || !port || !user || !pass || !from) {
      return {
        ok: false,
        provider: 'smtp',
        error: 'Missing MAIL_* environment variables',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to: input.recipient,
        subject: input.subject ?? 'Restaurant notification',
        text: input.content,
      });

      console.log(
        `[NotificationSender] mail sent provider=smtp to=${input.recipient} msgId=${info.messageId}`
      );

      return {
        ok: true,
        provider: 'smtp',
        messageId: info.messageId ?? undefined,
      };
    } catch (err: any) {
      console.error('[NotificationSender] mail send failed', err);
      return {
        ok: false,
        provider: 'smtp',
        error: err?.message ?? String(err),
      };
    }
  }

  // WHATSAPP/SMS (Twilio - optional, only if env vars exist)
  const twilioAccountSid = env('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = env('TWILIO_AUTH_TOKEN');
  const twilioFromWhatsApp = env('TWILIO_FROM_WHATSAPP');
  const twilioFromSms = env('TWILIO_FROM_SMS');

  if (!twilioAccountSid || !twilioAuthToken) {
    return {
      ok: false,
      provider: 'twilio',
      error: 'Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN',
    };
  }

  try {
    const { Twilio } = await import('twilio');
    const client = new Twilio(twilioAccountSid, twilioAuthToken);

    if (input.type === 'whatsapp') {
      if (!twilioFromWhatsApp) {
        return {
          ok: false,
          provider: 'twilio',
          error: 'Missing TWILIO_FROM_WHATSAPP',
        };
      }

      const msg = await client.messages.create({
        from: twilioFromWhatsApp,
        to: input.recipient,
        body: input.content,
      });

      console.log(
        `[NotificationSender] whatsapp sent provider=twilio to=${input.recipient} msgId=${msg.sid}`
      );

      return { ok: true, provider: 'twilio', messageId: msg.sid };
    }

    // sms
    if (!twilioFromSms) {
      return {
        ok: false,
        provider: 'twilio',
        error: 'Missing TWILIO_FROM_SMS',
      };
    }

    const msg = await client.messages.create({
      from: twilioFromSms,
      to: input.recipient,
      body: input.content,
    });

    console.log(
      `[NotificationSender] sms sent provider=twilio to=${input.recipient} msgId=${msg.sid}`
    );

    return { ok: true, provider: 'twilio', messageId: msg.sid };
  } catch (err: any) {
    console.error('[NotificationSender] twilio send failed', err);
    return {
      ok: false,
      provider: 'twilio',
      error: err?.message ?? String(err),
    };
  }
}

