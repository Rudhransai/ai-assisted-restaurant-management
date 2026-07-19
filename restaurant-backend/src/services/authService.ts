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

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-dev-secret-change-in-production';
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

  async registerCustomer(data: { email: string; password: string; name: string; phone?: string }) {
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

    return this.buildAuthResponse({ id: userId, email, name: data.name.trim(), role: 'customer', phone: data.phone?.trim() ?? '' });
  }

  async login(email: string, password: string, expectedRole?: UserRole) {
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

    return this.buildAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      phone: user.phone,
    });
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
