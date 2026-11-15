import crypto from 'crypto';
import { db } from '../db/index.ts';
import { auditLogs, notifications } from '../db/schema.ts';
import { hashSecretWithBcrypt, verifySecretWithBcrypt } from './password.ts';

export type BroadcastEvent = {
  type:
    | 'deployment:updated'
    | 'node:telemetry'
    | 'notification:created'
    | 'hosting:updated'
    | 'backup:completed';
  userId?: number;
  payload: unknown;
};

type BroadcastFn = (event: BroadcastEvent) => void;

let broadcaster: BroadcastFn = () => {};

export function registerWsBroadcaster(fn: BroadcastFn) {
  broadcaster = fn;
}

export function emitRealtimeEvent(event: BroadcastEvent) {
  broadcaster(event);
}

export async function recordAuditLog(params: {
  actorUserId?: number | null;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | number;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: String(params.resourceId),
      metadataJson: JSON.stringify(params.metadata || {}),
      ipAddress: params.ipAddress || '127.0.0.1',
    });
  } catch (error) {
    console.error('Audit log insert failed:', error);
  }
}

export async function createNotification(params: {
  userId: number;
  category: string;
  title: string;
  message: string;
}) {
  try {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: params.userId,
        category: params.category,
        title: params.title,
        message: params.message,
      })
      .returning();

    emitRealtimeEvent({
      type: 'notification:created',
      userId: params.userId,
      payload: created,
    });
    return created;
  } catch (error) {
    console.error('Notification insert failed:', error);
    return null;
  }
}

export function normalizeSafeHostingPath(rawPath: string): string {
  const cleaned = rawPath.replace(/\\/g, '/').trim();
  const segments = cleaned.split('/').filter(Boolean);
  const safeSegments: string[] = [];

  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new Error('Directory traversal segments are not permitted.');
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(seg)) {
      throw new Error(`Invalid path segment: ${seg}`);
    }
    safeSegments.push(seg);
  }

  return '/' + safeSegments.join('/');
}

export function generateSha256Checksum(seed: string): string {
  return crypto.createHash('sha256').update(seed + ':' + Date.now()).digest('hex');
}

export function hashCredential(secret: string): string {
  return hashSecretWithBcrypt(secret);
}

export function verifyCredential(secret: string, storedHash: string): boolean {
  return verifySecretWithBcrypt(secret, storedHash);
}

export function generateAccountCode(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export const InfrastructureAdapters = {
  compute: {
    name: 'LocalDevInfrastructureAdapter',
    label: 'Local Sandbox Compute Adapter',
    description:
      'Provisions isolated logical hosting environments, simulated VPS lifecycle actions, and workspace file sandboxes without executing host shell commands.',
  },
  dns: {
    name: 'SandboxDnsAdapter',
    label: 'Sandbox DNS & Registrar Adapter',
    description:
      'Manages zone records (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA) in PostgreSQL. External domain purchases require configuring a live registrar API.',
  },
  backup: {
    name: 'LocalVaultBackupAdapter',
    label: 'Checksum-Verified Snapshot Adapter',
    description:
      'Generates SHA-256 verified backup manifests and retention policies stored in the control plane database.',
  },
  payment: {
    name: 'SandboxPaymentAdapter',
    label: 'Sandbox Billing Adapter (Stripe / PayPal / M-Pesa test modes)',
    description:
      'Validates test checkouts and issues invoices without storing raw card numbers.',
  },
};
