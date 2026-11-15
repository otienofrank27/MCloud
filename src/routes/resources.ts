import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  databaseUsers,
  dnsRecords,
  domains,
  hostingAccounts,
  hostingFiles,
  hostingPlans,
  hostingSubscriptions,
  managedDatabases,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import {
  createNotification,
  hashCredential,
  normalizeSafeHostingPath,
  recordAuditLog,
} from '../services/infrastructure.ts';
import { sanitizeDatabase, sanitizeDomain } from '../services/sanitize.ts';

export const resourcesRouter = Router();

resourcesRouter.use(requireAuth);

// --- DOMAINS & DNS ---
resourcesRouter.get('/domains', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const list = await db
      .select()
      .from(domains)
      .where(eq(domains.userId, userId))
      .orderBy(desc(domains.createdAt));

    const records = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.userId, userId));

    res.json({ domains: list.map(sanitizeDomain), dnsRecords: records });
  } catch (error: any) {
    console.error('Error listing domains:', error);
    res.status(500).json({ error: 'Failed to load domains' });
  }
});

const createDomainSchema = z.object({
  domainName: z
    .string()
    .min(4)
    .max(160)
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Enter a valid domain name'),
  registrationMode: z
    .enum(['connected', 'transfer_requested', 'sandbox_registered'])
    .default('connected'),
  autoRenew: z.boolean().default(true),
});

resourcesRouter.post('/domains', async (req: AuthRequest, res) => {
  try {
    const parsed = createDomainSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid domain' });
    }

    const user = req.dbUser!;
    const activeSubs = await db
      .select()
      .from(hostingSubscriptions)
      .where(and(eq(hostingSubscriptions.userId, user.id), eq(hostingSubscriptions.status, 'active')));

    if (activeSubs.length === 0) {
      return res.status(403).json({
        error: 'Activate a hosting plan first before adding domains.',
      });
    }

    const plans = await db.select().from(hostingPlans);
    const maxDomains = activeSubs.reduce((acc, s) => {
      const p = plans.find((pl) => pl.id === s.planId);
      return acc + (p?.maxDomains || 0);
    }, 0);

    const existing = await db
      .select()
      .from(domains)
      .where(eq(domains.userId, user.id));

    if (existing.length >= maxDomains) {
      return res.status(403).json({
        error: `Domain limit reached (${maxDomains}). Upgrade your hosting plan for more domains.`,
      });
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const [created] = await db
      .insert(domains)
      .values({
        userId: user.id,
        domainName: parsed.data.domainName.toLowerCase(),
        registrarAdapter: 'SandboxDnsAdapter',
        registrationMode: parsed.data.registrationMode,
        status:
          parsed.data.registrationMode === 'transfer_requested'
            ? 'pending_verification'
            : 'active',
        autoRenew: parsed.data.autoRenew,
        expiresAt,
      })
      .returning();

    await db.insert(dnsRecords).values([
      {
        userId: user.id,
        domainId: created.id,
        recordType: 'A',
        host: '@',
        value: '10.24.10.11',
        ttl: 3600,
      },
      {
        userId: user.id,
        domainId: created.id,
        recordType: 'CNAME',
        host: 'www',
        value: created.domainName,
        ttl: 3600,
      },
      {
        userId: user.id,
        domainId: created.id,
        recordType: 'TXT',
        host: '@',
        value: 'v=spf1 include:_spf.mcloud.host ~all',
        ttl: 3600,
      },
    ]);

    await createNotification({
      userId: user.id,
      category: 'domain',
      title: 'DNS Zone Created',
      message: `${created.domainName} configured with authoritative MCloud nameservers.`,
    });

    res.status(201).json({ domain: sanitizeDomain(created) });
  } catch (error: any) {
    console.error('Create domain failed:', error);
    res.status(400).json({ error: 'Domain already exists or could not be added' });
  }
});

resourcesRouter.patch('/domains/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = z
      .object({
        autoRenew: z.boolean().optional(),
        nameserversJson: z.string().optional(),
      })
      .parse(req.body);

    const [updated] = await db
      .update(domains)
      .set(body)
      .where(and(eq(domains.id, id), eq(domains.userId, req.dbUser!.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Domain not found' });
    res.json({ domain: sanitizeDomain(updated) });
  } catch (error: any) {
    res.status(400).json({ error: 'Failed updating domain' });
  }
});

resourcesRouter.delete('/domains/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(domains)
      .where(and(eq(domains.id, id), eq(domains.userId, req.dbUser!.id)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Domain not found' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

const dnsRecordSchema = z.object({
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
  host: z.string().min(1).max(120),
  value: z.string().min(1).max(500),
  ttl: z.number().int().min(60).max(86400).default(3600),
  priority: z.number().int().min(0).max(65535).default(10),
});

resourcesRouter.post('/dns/:domainId', async (req: AuthRequest, res) => {
  try {
    const domainId = Number(req.params.domainId);
    const parsed = dnsRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid DNS record', issues: parsed.error.issues });
    }

    const user = req.dbUser!;
    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) return res.status(404).json({ error: 'Domain not found' });

    const [record] = await db
      .insert(dnsRecords)
      .values({
        userId: user.id,
        domainId: domain.id,
        ...parsed.data,
      })
      .returning();

    res.status(201).json({ record });
  } catch (error: any) {
    console.error('Failed creating DNS record:', error);
    res.status(500).json({ error: 'Failed to create DNS record' });
  }
});

resourcesRouter.delete('/dns/record/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(dnsRecords)
      .where(and(eq(dnsRecords.id, id), eq(dnsRecords.userId, req.dbUser!.id)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'DNS record not found' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete DNS record' });
  }
});

// --- MANAGED DATABASES ---
resourcesRouter.get('/databases', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [dbs, dbUsers] = await Promise.all([
      db
        .select()
        .from(managedDatabases)
        .where(eq(managedDatabases.userId, userId))
        .orderBy(desc(managedDatabases.createdAt)),
      db.select().from(databaseUsers).where(eq(databaseUsers.userId, userId)),
    ]);

    res.json({
      databases: dbs.map(sanitizeDatabase),
      databaseUsers: dbUsers.map(({ passwordHash: _h, userId: _u, ...u }) => u),
    });
  } catch (error: any) {
    console.error('Error fetching databases:', error);
    res.status(500).json({ error: 'Failed to fetch databases' });
  }
});

const createDatabaseSchema = z.object({
  hostingAccountId: z.number().int().positive(),
  name: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-zA-Z0-9_]+$/, 'Database name must contain only letters, numbers, and underscores'),
  engine: z.enum(['postgresql', 'mysql', 'mariadb']).default('postgresql'),
});

resourcesRouter.post('/databases', async (req: AuthRequest, res) => {
  try {
    const parsed = createDatabaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid database name' });
    }

    const user = req.dbUser!;
    const [account] = await db
      .select()
      .from(hostingAccounts)
      .where(
        and(
          eq(hostingAccounts.id, parsed.data.hostingAccountId),
          eq(hostingAccounts.userId, user.id)
        )
      )
      .limit(1);

    if (!account) return res.status(404).json({ error: 'Hosting account not found' });

    const [sub] = await db
      .select()
      .from(hostingSubscriptions)
      .where(eq(hostingSubscriptions.id, account.subscriptionId))
      .limit(1);
    const [plan] = sub
      ? await db.select().from(hostingPlans).where(eq(hostingPlans.id, sub.planId)).limit(1)
      : [null];

    const existingDbs = await db
      .select()
      .from(managedDatabases)
      .where(eq(managedDatabases.userId, user.id));

    if (plan && existingDbs.length >= plan.maxDatabases) {
      return res.status(403).json({
        error: `Plan limit reached: ${plan.name} supports up to ${plan.maxDatabases} databases.`,
      });
    }

    const engineMeta =
      parsed.data.engine === 'postgresql'
        ? { version: '16.4', port: 5432 }
        : parsed.data.engine === 'mysql'
          ? { version: '8.0', port: 3306 }
          : { version: '11.4', port: 3306 };

    const [created] = await db
      .insert(managedDatabases)
      .values({
        userId: user.id,
        hostingAccountId: account.id,
        name: parsed.data.name.toLowerCase(),
        engine: parsed.data.engine,
        version: engineMeta.version,
        host: `${parsed.data.engine}.internal.mcloud.host`,
        port: engineMeta.port,
        storageUsedMb: 16,
        storageLimitMb: (plan?.storageGb || 10) * 256,
        status: 'running',
        adapterNotice:
          'Logical tenant DB record managed in Cloud SQL PostgreSQL control plane',
      })
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'database.created',
      resourceType: 'managed_database',
      resourceId: created.id,
      metadata: { engine: created.engine, name: created.name },
    });

    res.status(201).json({ database: sanitizeDatabase(created) });
  } catch (error: any) {
    console.error('Error creating database:', error);
    res.status(500).json({ error: 'Failed to create database' });
  }
});

resourcesRouter.delete('/databases/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(managedDatabases)
      .where(and(eq(managedDatabases.id, id), eq(managedDatabases.userId, req.dbUser!.id)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Database not found' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete database' });
  }
});

resourcesRouter.post('/databases/:id/users', async (req: AuthRequest, res) => {
  try {
    const databaseId = Number(req.params.id);
    const body = z
      .object({
        username: z
          .string()
          .min(2)
          .max(32)
          .regex(/^[a-zA-Z0-9_]+$/),
        password: z.string().min(8).max(128).optional(),
        permissions: z.enum(['read_write', 'read_only', 'admin']).default('read_write'),
        allowedHost: z.string().min(1).max(60).default('%'),
      })
      .parse(req.body);

    const user = req.dbUser!;
    const [dbRec] = await db
      .select()
      .from(managedDatabases)
      .where(and(eq(managedDatabases.id, databaseId), eq(managedDatabases.userId, user.id)))
      .limit(1);

    if (!dbRec) return res.status(404).json({ error: 'Database not found' });

    const plainPassword = body.password || crypto.randomBytes(12).toString('base64url');
    const passwordHash = hashCredential(plainPassword);

    const [createdUser] = await db
      .insert(databaseUsers)
      .values({
        userId: user.id,
        databaseId: dbRec.id,
        username: body.username.toLowerCase(),
        passwordHash,
        permissions: body.permissions,
        allowedHost: body.allowedHost,
      })
      .returning();

    const { passwordHash: _omitted, userId: _uid, ...safeUser } = createdUser;
    res.status(201).json({ databaseUser: safeUser });
  } catch (error: any) {
    res.status(400).json({ error: 'Failed to add database user' });
  }
});

resourcesRouter.delete('/databases/users/:userId', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.userId);
    const [deleted] = await db
      .delete(databaseUsers)
      .where(and(eq(databaseUsers.id, id), eq(databaseUsers.userId, req.dbUser!.id)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Database user not found' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove database user' });
  }
});

// --- SCOPED HOSTING FILE MANAGER ---
resourcesRouter.get('/files', async (req: AuthRequest, res) => {
  try {
    const accountId = Number(req.query.accountId);
    const rawPath = String(req.query.path || '/');
    const search = String(req.query.q || '').trim();

    if (!Number.isInteger(accountId)) {
      return res.status(400).json({ error: 'Valid accountId query parameter required' });
    }

    const user = req.dbUser!;
    const safePath = normalizeSafeHostingPath(rawPath);

    const [account] = await db
      .select()
      .from(hostingAccounts)
      .where(and(eq(hostingAccounts.id, accountId), eq(hostingAccounts.userId, user.id)))
      .limit(1);

    if (!account) return res.status(404).json({ error: 'Hosting account not found' });

    const files = search
      ? await db
          .select()
          .from(hostingFiles)
          .where(
            and(
              eq(hostingFiles.hostingAccountId, account.id),
              eq(hostingFiles.userId, user.id),
              ilike(hostingFiles.name, `%${search}%`)
            )
          )
      : await db
          .select()
          .from(hostingFiles)
          .where(
            and(
              eq(hostingFiles.hostingAccountId, account.id),
              eq(hostingFiles.userId, user.id),
              eq(hostingFiles.parentPath, safePath)
            )
          );

    res.json({ path: safePath, files });
  } catch (error: any) {
    console.error('File list error:', error);
    res.status(400).json({ error: 'Invalid file path' });
  }
});

const createFileSchema = z.object({
  hostingAccountId: z.number().int().positive(),
  parentPath: z.string().default('/'),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid filename characters'),
  isDirectory: z.boolean().default(false),
  content: z.string().max(250000).optional().default(''),
  mimeType: z.string().max(80).optional().default('text/plain'),
});

resourcesRouter.post('/files', async (req: AuthRequest, res) => {
  try {
    const parsed = createFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid file payload' });
    }

    const user = req.dbUser!;
    const safeParent = normalizeSafeHostingPath(parsed.data.parentPath);
    const fullPath =
      safeParent === '/' ? `/${parsed.data.name}` : `${safeParent}/${parsed.data.name}`;

    const [account] = await db
      .select()
      .from(hostingAccounts)
      .where(
        and(
          eq(hostingAccounts.id, parsed.data.hostingAccountId),
          eq(hostingAccounts.userId, user.id)
        )
      )
      .limit(1);

    if (!account) return res.status(404).json({ error: 'Hosting account not found' });

    const sizeBytes = parsed.data.isDirectory
      ? 0
      : Buffer.byteLength(parsed.data.content, 'utf8');

    const [created] = await db
      .insert(hostingFiles)
      .values({
        userId: user.id,
        hostingAccountId: account.id,
        parentPath: safeParent,
        name: parsed.data.name,
        fullPath,
        isDirectory: parsed.data.isDirectory,
        sizeBytes,
        permissions: parsed.data.isDirectory ? '0755' : '0644',
        mimeType: parsed.data.isDirectory ? 'inode/directory' : parsed.data.mimeType,
        content: parsed.data.isDirectory ? '' : parsed.data.content,
      })
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: parsed.data.isDirectory ? 'file.mkdir' : 'file.created',
      resourceType: 'hosting_file',
      resourceId: created.id,
      metadata: { fullPath },
    });

    res.status(201).json({ file: created });
  } catch (error: any) {
    console.error('Create file failed:', error);
    res.status(400).json({ error: 'Failed to create file' });
  }
});

resourcesRouter.patch('/files/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = z
      .object({
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._-]+$/)
          .optional(),
        content: z.string().max(250000).optional(),
        permissions: z
          .string()
          .regex(/^0[0-7]{3}$/)
          .optional(),
      })
      .parse(req.body);

    const user = req.dbUser!;
    const [existing] = await db
      .select()
      .from(hostingFiles)
      .where(and(eq(hostingFiles.id, id), eq(hostingFiles.userId, user.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'File not found' });

    const newName = body.name ?? existing.name;
    const newFullPath =
      existing.parentPath === '/' ? `/${newName}` : `${existing.parentPath}/${newName}`;
    const newContent = body.content ?? existing.content;

    const [updated] = await db
      .update(hostingFiles)
      .set({
        name: newName,
        fullPath: newFullPath,
        content: newContent,
        sizeBytes: existing.isDirectory ? 0 : Buffer.byteLength(newContent, 'utf8'),
        permissions: body.permissions ?? existing.permissions,
        updatedAt: new Date(),
      })
      .where(eq(hostingFiles.id, existing.id))
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'file.updated',
      resourceType: 'hosting_file',
      resourceId: updated.id,
      metadata: { fullPath: updated.fullPath },
    });

    res.json({ file: updated });
  } catch (error: any) {
    res.status(400).json({ error: 'Failed to update file' });
  }
});

resourcesRouter.delete('/files/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(hostingFiles)
      .where(and(eq(hostingFiles.id, id), eq(hostingFiles.userId, req.dbUser!.id)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'File not found' });

    await recordAuditLog({
      actorUserId: req.dbUser!.id,
      actorEmail: req.dbUser!.email,
      action: 'file.deleted',
      resourceType: 'hosting_file',
      resourceId: id,
      metadata: { fullPath: deleted.fullPath },
    });

    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});
