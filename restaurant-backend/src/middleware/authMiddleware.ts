import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import type { UserRole } from '../services/authService';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export const createAuthMiddleware = (authService: AuthService) => {
  const requireAuth = (roles?: UserRole[]) => {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return next(new AppError(401, 'Authentication required'));
      }

      try {
        const token = header.slice(7);
        const payload = authService.verifyToken(token);
        if (roles && !roles.includes(payload.role)) {
          return next(new AppError(403, 'You do not have permission to access this resource'));
        }
        req.auth = payload;
        next();
      } catch (error) {
        next(error);
      }
    };
  };

  return { requireAuth };
};
