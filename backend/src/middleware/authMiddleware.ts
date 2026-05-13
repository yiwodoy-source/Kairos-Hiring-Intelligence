import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth';

export interface AuthRequest extends Request {
    user?: JwtPayload & { username?: string; role?: string };
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    // Validate token format (basic check)
    if (!token.includes('.') || token.split('.').length !== 3) {
        return res.status(403).json({ success: false, message: 'Invalid token format.' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), {
            algorithms: ['HS256'],
            issuer: 'nexus-hr-backend',
            audience: 'nexus-hr-frontend',
        }) as JwtPayload;

        // Additional validation
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now) {
            return res.status(403).json({ success: false, message: 'Token has expired.' });
        }

        req.user = decoded;
        next();
    } catch (err: unknown) {
        let message = 'Invalid or expired token.';
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'TokenExpiredError') {
            message = 'Token has expired.';
        } else if (errName === 'JsonWebTokenError') {
            message = 'Invalid token.';
        }
        console.log(`[AUTH] Token verification failed: ${message} from IP: ${req.ip}`);
        res.status(403).json({ success: false, message });
    }
};
