import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { ensurePlatformCatalogSeeded, getOrCreateUser } from '../db/seed.ts';
import { db } from '../db/index.ts';
import { userSessions, users } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import { parseCookieToken, verifySessionToken } from '../services/session-token.ts';

export type DbUser = typeof users.$inferSelect;

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]
      : null;
  const cookieToken = parseCookieToken(req.headers.cookie);
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }
  try {
    const sessionPayload = verifySessionToken(token);
    if (sessionPayload) {
      await ensurePlatformCatalogSeeded();
      const [dbUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, sessionPayload.userId), eq(users.uid, sessionPayload.sub)))
        .limit(1);

      if (!dbUser) {
        return res.status(401).json({ error: 'Unauthorized: Account not found' });
      }

      const [sessionRow] = await db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.id, sessionPayload.sessionId),
            eq(userSessions.userId, dbUser.id)
          )
        )
        .limit(1);

      if (!sessionRow || sessionRow.revoked) {
        return res.status(401).json({ error: 'Unauthorized: Session has been revoked' });
      }

      await db
        .update(userSessions)
        .set({ lastActiveAt: new Date() })
        .where(eq(userSessions.id, sessionRow.id));

      req.dbUser = dbUser;
      return next();
    }

    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;

    await ensurePlatformCatalogSeeded();
    const dbUser = await getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@mcloud.local`,
      decoded.name,
      Boolean(decoded.email_verified)
    );
    req.dbUser = dbUser;

    // Record active session lazily if none exists for this user agent
    const ua = String(req.headers['user-agent'] || 'Web Console').slice(0, 120);
    const ip =
      String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
        .split(',')[0]
        .trim();

    const existingSessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, dbUser.id))
      .limit(5);

    if (existingSessions.length === 0) {
      await db.insert(userSessions).values({
        userId: dbUser.id,
        deviceLabel: ua.includes('Chrome')
          ? 'Chrome Browser Session'
          : ua.includes('Firefox')
            ? 'Firefox Browser Session'
            : 'MCloud Web Console',
        ipAddress: ip,
        userAgent: ua,
        revoked: false,
      });
    }

    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.dbUser.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires role [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
};
