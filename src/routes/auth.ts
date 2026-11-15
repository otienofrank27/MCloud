import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { userSessions, users } from '../db/schema.ts';
import { ensurePlatformCatalogSeeded } from '../db/seed.ts';
import { recordAuditLog } from '../services/infrastructure.ts';
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../services/password.ts';
import {
  SESSION_COOKIE_NAME,
  parseCookieToken,
  signSessionToken,
  verifySessionToken,
} from '../services/session-token.ts';
import { sanitizeSession, sanitizeUser } from '../services/sanitize.ts';

export const authRouter = Router();

const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(isHttps),
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

function deriveDeviceLabel(userAgent: string): string {
  if (userAgent.includes('Chrome')) return 'Chrome Browser Session';
  if (userAgent.includes('Firefox')) return 'Firefox Browser Session';
  if (userAgent.includes('Safari')) return 'Safari Browser Session';
  return 'MCloud Web Console';
}

const registerSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(100),
  organizationName: z.string().min(2).max(120).optional().default('Personal Cloud Workspace'),
});

authRouter.post('/auth/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid registration details',
      });
    }

    await ensurePlatformCatalogSeeded();

    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.',
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const uid = `local_${crypto.randomUUID()}`;

    const [createdUser] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName: parsed.data.displayName.trim(),
        role: 'customer',
        organizationName: parsed.data.organizationName.trim(),
        emailVerified: true,
        passwordHash,
      })
      .returning();

    const ua = String(req.headers['user-agent'] || 'MCloud Web Console').slice(0, 120);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();

    const [session] = await db
      .insert(userSessions)
      .values({
        userId: createdUser.id,
        deviceLabel: deriveDeviceLabel(ua),
        ipAddress: ip,
        userAgent: ua,
        revoked: false,
      })
      .returning();

    const token = signSessionToken({
      uid: createdUser.uid,
      userId: createdUser.id,
      sessionId: session.id,
    });

    await recordAuditLog({
      actorUserId: createdUser.id,
      actorEmail: createdUser.email,
      action: 'auth.registered_with_password',
      resourceType: 'user',
      resourceId: createdUser.id,
      ipAddress: ip,
    });

    setSessionCookie(req, res, token);

    res.status(201).json({
      authenticated: true,
      user: sanitizeUser(createdUser),
      sessions: [sanitizeSession(session)],
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    const msg =
      error?.message && String(error.message).includes('Password')
        ? error.message
        : 'Unable to register account';
    res.status(400).json({ error: msg });
  }
});

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(128),
});

authRouter.post('/auth/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Enter a valid email and password.' });
    }

    await ensurePlatformCatalogSeeded();

    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const isValid = await verifyPassword(
      parsed.data.password,
      user?.passwordHash || ''
    );

    if (!user || !isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (needsRehash(user.passwordHash)) {
      const upgradedHash = await hashPassword(parsed.data.password);
      await db
        .update(users)
        .set({ passwordHash: upgradedHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const ua = String(req.headers['user-agent'] || 'MCloud Web Console').slice(0, 120);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();

    const [session] = await db
      .insert(userSessions)
      .values({
        userId: user.id,
        deviceLabel: deriveDeviceLabel(ua),
        ipAddress: ip,
        userAgent: ua,
        revoked: false,
      })
      .returning();

    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, user.id))
      .orderBy(desc(userSessions.lastActiveAt))
      .limit(10);

    const token = signSessionToken({
      uid: user.uid,
      userId: user.id,
      sessionId: session.id,
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'auth.logged_in_with_password',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: ip,
    });

    setSessionCookie(req, res, token);

    res.json({
      authenticated: true,
      user: sanitizeUser(user),
      sessions: sessions.map(sanitizeSession),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]
        : null;
    const token = bearerToken || parseCookieToken(req.headers.cookie);

    if (token) {
      const payload = verifySessionToken(token);
      if (payload?.sessionId) {
        await db
          .update(userSessions)
          .set({ revoked: true })
          .where(eq(userSessions.id, payload.sessionId));
      }
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ loggedOut: true });
  } catch {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ loggedOut: true });
  }
});
