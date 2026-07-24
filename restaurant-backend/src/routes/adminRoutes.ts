import { Router } from 'express';
import { pool } from '../config/db';
import { sendNotification } from '../integrations/notificationSender';
import { AppError } from '../middleware/errorHandler';
import { createAuthMiddleware } from '../middleware/authMiddleware';
import { AuthService } from '../services/authService';

const authService = new AuthService(pool);
const { requireAuth } = createAuthMiddleware(authService);

export const adminRoutes = Router();

// View all users (manager only)
adminRoutes.get('/users', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, phone, password_hash IS NOT NULL AS has_password FROM users ORDER BY role, name'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// View a specific database table (manager only)
adminRoutes.get('/db/:tableName', requireAuth(['manager']), async (req, res, next) => {
  try {
    const allowedTables = ['users', 'tables', 'reservations', 'waitlist', 'notifications', 'table_watch', 'dishes', 'orders', 'order_items'];
    const tableName = typeof req.params['tableName'] === 'string' ? req.params['tableName'] : '';

    if (!tableName || !allowedTables.includes(tableName)) {
      throw new AppError(400, `Invalid table name. Allowed: ${allowedTables.join(', ')}`);
    }

    const result = await pool.query(`SELECT * FROM ${tableName}`);
    res.json({ success: true, table: tableName, rowCount: result.rows.length, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Verify email integration (manager only)
adminRoutes.post('/verify-mail', requireAuth(['manager']), async (req, res, next) => {
  try {
    const { testEmail } = req.body ?? {};

    if (!testEmail) {
      throw new AppError(400, 'Please provide a testEmail in the request body');
    }

    const smtpHost = process.env.MAIL_SMTP_HOST;
    const smtpUser = process.env.MAIL_SMTP_USER;
    const smtpPass = process.env.MAIL_SMTP_PASS;
    const smtpPort = process.env.MAIL_SMTP_PORT;
    const mailFrom = process.env.MAIL_FROM;

    const configStatus = {
      MAIL_SMTP_HOST: smtpHost ? '✅ set' : '🎨 missing',
      MAIL_SMTP_PORT: smtpPort ? '✅ set' : '🎨 missing',
      MAIL_SMTP_USER: smtpUser ? '✅ set' : '🎨 missing',
      MAIL_SMTP_PASS: smtpPass ? '✅ set (hidden)' : '🎨 missing',
      MAIL_FROM: mailFrom ? '✅ set' : '🎨 missing',
    };

    const testResult = await sendNotification({
      type: 'mail',
      recipient: testEmail,
      subject: 'Mail Integration Test - Restaurant App',
      content: [
        'This is a test email from your Restaurant Management System.',
        '',
        'If you received this email, your mail integration is working correctly!',
        '',
        `SMTP Host: ${smtpHost || 'not set'}`,
        `SMTP User: ${smtpUser || 'not set'}`, 
        `Sent at: ${new Date().toISOString()}`,
        '',
        'No action is needed - this is just a verification test.',
      ].join('\n'),
    });

    res.json({
      success: testResult.ok,
      message: testResult.ok
        ? `Test email sent successfully to ${testEmail}!`
        : `Failed to send email: ${testResult.error}`,
      configStatus,
      provider: testResult.provider,
      messageId: testResult.messageId ?? null,
      error: testResult.error ?? null,
    });
  } catch (error) {
    next(error);
  }
});

// Database health check (manager only)
adminRoutes.get('/db-health', requireAuth(['manager']), async (_req, res, next) => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;

    const tableCounts: Record<string, number> = {};
    const tables = ['users', 'tables', 'reservations', 'waitlist', 'notifications', 'table_watch', 'dishes', 'orders', 'order_items'];
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      tableCounts[t] = r.rows[0]?.c ?? 0;
    }

    res.json({
      success: true,
      database: process.env.DATABASE_URL ? 'connected (DATABASE_URL)' : 'connected (default)',
      latencyMs: latency,
      tables: tableCounts,
    });
  } catch (error) {
    next(error);
  }
});
