import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications, userSessions, users } from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { hashCredential, recordAuditLog } from '../services/infrastructure.ts';
import { hashPassword, verifyPassword } from '../services/password.ts';
import { sanitizeSession, sanitizeUser } from '../services/sanitize.ts';

export const accountRouter = Router();

accountRouter.use(requireAuth);

accountRouter.get('/auth/me', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, user.id))
      .orderBy(desc(userSessions.lastActiveAt));

    res.json({
      user: sanitizeUser(user),
      sessions: sessions.map(sanitizeSession),
    });
  } catch (error: any) {
    console.error('Error in /auth/me:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

accountRouter.post('/users/me/rotate-api-credential', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    const rawSecret = `mc_live_${crypto.randomBytes(24).toString('hex')}`;
    const apiCredentialHash = hashCredential(rawSecret);

    await db
      .update(users)
      .set({ apiCredentialHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.api_credential_rotated',
      resourceType: 'user',
      resourceId: user.id,
    });

    res.json({
      rotated: true,
      maskedCredential: `mc_live_****${rawSecret.slice(-4)}`,
      hasApiCredential: true,
      notice:
        'Workspace API credential rotated and encrypted with salted bcrypt. Raw API keys and secret keys are never exposed in responses.',
    });
  } catch (error: any) {
    console.error('Failed rotating API credential:', error);
    res.status(500).json({ error: 'Failed to rotate API credential' });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128),
});

accountRouter.post('/users/me/password', async (req: AuthRequest, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid password payload',
      });
    }

    const user = req.dbUser!;
    if (user.passwordHash) {
      if (!parsed.data.currentPassword) {
        return res.status(400).json({ error: 'Current password is required.' });
      }
      const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }

    const nextHash = await hashPassword(parsed.data.newPassword);
    const [updated] = await db
      .update(users)
      .set({ passwordHash: nextHash, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.password_updated',
      resourceType: 'user',
      resourceId: user.id,
    });

    res.json({
      user: sanitizeUser(updated),
      message: 'Account password encrypted with bcrypt and updated.',
    });
  } catch (error: any) {
    console.error('Failed updating password:', error);
    const msg =
      error?.message && String(error.message).includes('Password')
        ? error.message
        : 'Failed to update password';
    res.status(400).json({ error: msg });
  }
});

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  organizationName: z.string().min(2).max(120).optional(),
  twoFactorEnabled: z.boolean().optional(),
});

accountRouter.patch('/users/me', async (req: AuthRequest, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid profile fields', issues: parsed.error.issues });
    }

    const user = req.dbUser!;
    const [updated] = await db
      .update(users)
      .set({
        ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
        ...(parsed.data.organizationName !== undefined && {
          organizationName: parsed.data.organizationName,
        }),
        ...(parsed.data.twoFactorEnabled !== undefined && {
          twoFactorEnabled: parsed.data.twoFactorEnabled,
        }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.profile_updated',
      resourceType: 'user',
      resourceId: user.id,
      metadata: parsed.data,
    });

    res.json({ user: sanitizeUser(updated) });
  } catch (error: any) {
    console.error('Failed updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

accountRouter.delete('/users/me', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'user.account_deleted',
      resourceType: 'user',
      resourceId: user.id,
    });

    await db.delete(users).where(eq(users.id, user.id));
    res.json({ deleted: true });
  } catch (error: any) {
    console.error('Failed deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

accountRouter.get('/users/sessions', async (req: AuthRequest, res) => {
  try {
    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, req.dbUser!.id))
      .orderBy(desc(userSessions.lastActiveAt));
    res.json({ sessions: sessions.map(sanitizeSession) });
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

accountRouter.post('/users/sessions/:id/revoke', async (req: AuthRequest, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const [revoked] = await db
      .update(userSessions)
      .set({ revoked: true })
      .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, req.dbUser!.id)))
      .returning();

    if (!revoked) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session: sanitizeSession(revoked) });
  } catch (error: any) {
    console.error('Failed revoking session:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

accountRouter.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.dbUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ notifications: list });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

accountRouter.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, req.dbUser!.id)))
      .returning();
    res.json({ notification: updated });
  } catch (error: any) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

accountRouter.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.dbUser!.id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});
