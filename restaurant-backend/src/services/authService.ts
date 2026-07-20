import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { AppError } from '../middleware/errorHandler';

export type UserRole = 'customer' | 'manager';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginEventMeta {
  ipAddress?: string;
  userAgent?: string;
}

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || 'restaurant-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

export class AuthService {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT ''
      )
    `);

    // Audit log of every successful authentication (login + registration).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS login_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        event TEXT NOT NULL,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    `);

    const managerEmail = process.env.MANAGER_EMAIL || 'manager@restaurant.com';
    const managerPassword = process.env.MANAGER_PASSWORD || 'manager123';
    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [managerEmail]);

    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(managerPassword, 10);
      await this.pool.query(
        'INSERT INTO users (id, email, password_hash, name, role, phone) VALUES ($1, $2, $3, $4, $5, $6)',
        ['mgr1', managerEmail, hash, 'Restaurant Manager', 'manager', '']
      );
    }
  }

  async recordLoginEvent(
    data: { userId: string; email: string; role: UserRole; event: 'login' | 'register' },
    meta: LoginEventMeta = {}
  ) {
    try {
      await this.pool.query(
        'INSERT INTO login_events (id, user_id, email, role, event, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          `le${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          data.userId,
          data.email,
          data.role,
          data.event,
          meta.ipAddress ?? '',
          meta.userAgent ?? '',
          new Date().toISOString(),
        ]
      );
    } catch (error) {
      // Never let audit logging break the auth flow.
      console.warn('[AuthService] failed to record login event', error);
    }
  }

  async registerCustomer(
    data: { email: string; password: string; name: string; phone?: string },
    meta: LoginEventMeta = {}
  ) {
    const email = data.email.trim().toLowerCase();
    if (!email || !data.password || !data.name) {
      throw new AppError(400, 'Email, password, and name are required');
    }

    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError(409, 'An account with this email already exists');
    }

    const userId = `u${Date.now()}`;
    const passwordHash = await bcrypt.hash(data.password, 10);

    await this.pool.query(
      'INSERT INTO users (id, email, password_hash, name, role, phone) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, email, passwordHash, data.name.trim(), 'customer', data.phone?.trim() ?? '']
    );

    await this.recordLoginEvent({ userId, email, role: 'customer', event: 'register' }, meta);

    return this.buildAuthResponse({ id: userId, email, name: data.name.trim(), role: 'customer', phone: data.phone?.trim() ?? '' });
  }

  async login(email: string, password: string, expectedRole?: UserRole, meta: LoginEventMeta = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await this.pool.query(
      'SELECT id, email, password_hash, name, role, phone FROM users WHERE email = $1',
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password');
    }

    if (expectedRole && user.role !== expectedRole) {
      throw new AppError(403, `This account is not registered as a ${expectedRole}`);
    }

    await this.recordLoginEvent(
      { userId: user.id, email: user.email, role: user.role as UserRole, event: 'login' },
      meta
    );

    return this.buildAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
    });
  }

  async getRecentLoginEvents(limit = 100) {
    const result = await this.pool.query(
      `SELECT id, user_id AS "userId", email, role, event,
              ip_address AS "ipAddress", user_agent AS "userAgent", created_at AS "createdAt"
       FROM login_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      'SELECT id, email, name, role, phone FROM users WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
    };
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch {
      throw new AppError(401, 'Invalid or expired token');
    }
  }

  private buildAuthResponse(user: AuthUser) {
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return { token, user };
  }
}
