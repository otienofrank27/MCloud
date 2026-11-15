import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  applications,
  auditLogs,
  backups,
  domains,
  hostingAccounts,
  hostingFiles,
  hostingNodes,
  hostingPlans,
  hostingSubscriptions,
  invoices,
  managedDatabases,
  notifications,
  websites,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import {
  createNotification,
  emitRealtimeEvent,
  generateAccountCode,
  hashCredential,
  recordAuditLog,
} from '../services/infrastructure.ts';
import { sanitizeAccount, sanitizeAuditLog } from '../services/sanitize.ts';

export const hostingRouter = Router();

hostingRouter.use(requireAuth);

hostingRouter.get('/hosting/overview', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [
      userSubs,
      userAccounts,
      userSites,
      userDomains,
      userDbs,
      userApps,
      userBackups,
      userInvoices,
      userNotifs,
      recentAudit,
      plans,
      nodes,
    ] = await Promise.all([
      db
        .select()
        .from(hostingSubscriptions)
        .where(eq(hostingSubscriptions.userId, userId))
        .orderBy(desc(hostingSubscriptions.createdAt)),
      db
        .select()
        .from(hostingAccounts)
        .where(eq(hostingAccounts.userId, userId))
        .orderBy(desc(hostingAccounts.createdAt)),
      db
        .select()
        .from(websites)
        .where(eq(websites.userId, userId))
        .orderBy(desc(websites.createdAt)),
      db
        .select()
        .from(domains)
        .where(eq(domains.userId, userId))
        .orderBy(desc(domains.createdAt)),
      db
        .select()
        .from(managedDatabases)
        .where(eq(managedDatabases.userId, userId))
        .orderBy(desc(managedDatabases.createdAt)),
      db
        .select()
        .from(applications)
        .where(eq(applications.userId, userId))
        .orderBy(desc(applications.createdAt)),
      db
        .select()
        .from(backups)
        .where(eq(backups.userId, userId))
        .orderBy(desc(backups.createdAt))
        .limit(10),
      db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(desc(invoices.createdAt))
        .limit(5),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(8),
      db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10),
      db.select().from(hostingPlans),
      db.select().from(hostingNodes),
    ]);

    const activeSubs = userSubs.filter((s) => s.status === 'active');
    const primaryPlan = activeSubs.length
      ? plans.find((p) => p.id === activeSubs[0].planId) || null
      : null;

    const totalStorageMb = userAccounts.reduce((acc, a) => acc + a.storageUsedMb, 0);
    const totalBandwidthGb = userAccounts.reduce((acc, a) => acc + a.bandwidthUsedGb, 0);
    const allocatedStorageGb = activeSubs.reduce((acc, s) => {
      const p = plans.find((pl) => pl.id === s.planId);
      return acc + (p?.storageGb || 0);
    }, 0);

    res.json({
      summary: {
        totalServices: activeSubs.length,
        activeWebsites: userSites.filter((w) => w.deploymentStatus === 'live').length,
        totalWebsites: userSites.length,
        registeredDomains: userDomains.length,
        databases: userDbs.length,
        applications: userApps.length,
        backups: userBackups.length,
        storageUsedMb: totalStorageMb,
        allocatedStorageGb,
        bandwidthUsedGb: totalBandwidthGb,
        currentPlan: primaryPlan,
        onlineNodes: nodes.filter((n) => n.status === 'online').length,
        totalNodes: nodes.length,
      },
      subscriptions: userSubs,
      accounts: userAccounts.map(sanitizeAccount),
      websites: userSites,
      recentInvoices: userInvoices,
      pendingNotifications: userNotifs.filter((n) => !n.isRead),
      recentActivities: recentAudit.map(sanitizeAuditLog),
      plans,
    });
  } catch (error: any) {
    console.error('Error loading hosting overview:', error);
    res.status(500).json({ error: 'Failed to load dashboard overview' });
  }
});

const subscribeSchema = z.object({
  planId: z.number().int().positive(),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  environmentLabel: z.string().min(2).max(60).default('Production Cluster'),
  region: z.string().trim().min(2).max(100).default('eu-west-2 (London, UK)'),
  paymentProvider: z
    .enum(['sandbox_stripe', 'sandbox_paypal', 'sandbox_mpesa'])
    .default('sandbox_stripe'),
  discountCode: z.string().max(30).optional().default(''),
});

hostingRouter.post('/hosting/subscribe', async (req: AuthRequest, res) => {
  try {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid subscription details', issues: parsed.error.issues });
    }

    const user = req.dbUser!;
    const [plan] = await db
      .select()
      .from(hostingPlans)
      .where(eq(hostingPlans.id, parsed.data.planId))
      .limit(1);

    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: 'Selected hosting plan is unavailable' });
    }

    const basePrice =
      parsed.data.billingCycle === 'annual'
        ? plan.annualPriceCents
        : plan.monthlyPriceCents;

    const code = parsed.data.discountCode.trim().toUpperCase();
    const discountPct = code === 'MCLOUD20' ? 0.2 : code === 'SANDBOX100' ? 1 : 0;
    const finalPriceCents = Math.max(0, Math.round(basePrice * (1 - discountPct)));

    const requestedRegion = parsed.data.region;
    const regionPrefix = requestedRegion.split('-')[0]?.toLowerCase() || '';

    const nodes = await db.select().from(hostingNodes);
    const selectedNode =
      nodes.find((n) => n.region.toLowerCase() === requestedRegion.toLowerCase()) ||
      nodes.find((n) => n.region.toLowerCase().startsWith(`${regionPrefix}-`)) ||
      nodes.find((n) => n.region.startsWith('global-')) ||
      nodes.find((n) => n.status === 'online') ||
      nodes[0];

    if (!selectedNode) {
      return res.status(503).json({ error: 'No infrastructure nodes available' });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(
      periodEnd.getDate() + (parsed.data.billingCycle === 'annual' ? 365 : 30)
    );

    const [subscription] = await db
      .insert(hostingSubscriptions)
      .values({
        userId: user.id,
        planId: plan.id,
        billingCycle: parsed.data.billingCycle,
        status: 'active',
        environmentLabel: parsed.data.environmentLabel,
        region: requestedRegion,
        autoRenew: true,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    const accountCode = generateAccountCode('MC');
    const initialSftpSecret = crypto.randomBytes(16).toString('hex');
    const [account] = await db
      .insert(hostingAccounts)
      .values({
        userId: user.id,
        subscriptionId: subscription.id,
        nodeId: selectedNode.id,
        accountCode,
        serviceType: plan.category,
        region: requestedRegion,
        hostname: `${accountCode.toLowerCase()}.nodes.mcloud.host`,
        ipAddress: selectedNode.ipAddress,
        osImage: selectedNode.osVersion,
        sftpUsername: `mc_${accountCode.toLowerCase().replace('-', '')}`,
        sftpCredentialHash: hashCredential(initialSftpSecret),
        storageUsedMb: 128,
        bandwidthUsedGb: 1,
        cpuAllocation: plan.cpuCores,
        ramAllocationGb: plan.ramGb,
        status: 'active',
      })
      .returning();

    // Seed initial safe workspace files for the new hosting account
    await db.insert(hostingFiles).values([
      {
        userId: user.id,
        hostingAccountId: account.id,
        parentPath: '/',
        name: 'public_html',
        fullPath: '/public_html',
        isDirectory: true,
        sizeBytes: 0,
        permissions: '0755',
        mimeType: 'inode/directory',
        content: '',
      },
      {
        userId: user.id,
        hostingAccountId: account.id,
        parentPath: '/public_html',
        name: 'index.html',
        fullPath: '/public_html/index.html',
        isDirectory: false,
        sizeBytes: 248,
        permissions: '0644',
        mimeType: 'text/html',
        content: `<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8"><title>${parsed.data.environmentLabel}</title></head>\n  <body>\n    <h1>Deployed on MCloud (${accountCode})</h1>\n    <p>Environment: ${parsed.data.environmentLabel}</p>\n  </body>\n</html>\n`,
      },
      {
        userId: user.id,
        hostingAccountId: account.id,
        parentPath: '/',
        name: '.env.production',
        fullPath: '/.env.production',
        isDirectory: false,
        sizeBytes: 68,
        permissions: '0600',
        mimeType: 'text/plain',
        content: `NODE_ENV=production\nMCLOUD_REGION=${requestedRegion}\n`,
      },
    ]);

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${user.id}`;
    const [invoice] = await db
      .insert(invoices)
      .values({
        userId: user.id,
        subscriptionId: subscription.id,
        invoiceNumber,
        amountCents: finalPriceCents,
        taxCents: 0,
        discountCode: code,
        currency: 'USD',
        status: 'paid',
        paymentProvider: parsed.data.paymentProvider,
        description: `${plan.name} (${parsed.data.billingCycle}): ${parsed.data.environmentLabel}`,
        dueAt: now,
        paidAt: now,
      })
      .returning();

    await createNotification({
      userId: user.id,
      category: 'hosting',
      title: 'Hosting Environment Activated',
      message: `${plan.name} (${accountCode}) provisioned in ${requestedRegion} via ${parsed.data.paymentProvider}.`,
    });

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'hosting.subscription_activated',
      resourceType: 'hosting_subscription',
      resourceId: subscription.id,
      metadata: { planSlug: plan.slug, accountCode, amountCents: finalPriceCents },
    });

    emitRealtimeEvent({
      type: 'hosting:updated',
      userId: user.id,
      payload: { account: sanitizeAccount(account), subscription },
    });

    res.status(201).json({ subscription, account: sanitizeAccount(account), invoice });
  } catch (error: any) {
    console.error('Subscription activation error:', error);
    res.status(500).json({ error: 'Failed to activate hosting plan' });
  }
});

hostingRouter.post('/hosting/subscriptions/:id/upgrade', async (req: AuthRequest, res) => {
  try {
    const subId = Number(req.params.id);
    const { planId } = z.object({ planId: z.number().int().positive() }).parse(req.body);
    const user = req.dbUser!;

    const [sub] = await db
      .select()
      .from(hostingSubscriptions)
      .where(and(eq(hostingSubscriptions.id, subId), eq(hostingSubscriptions.userId, user.id)))
      .limit(1);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const [newPlan] = await db
      .select()
      .from(hostingPlans)
      .where(eq(hostingPlans.id, planId))
      .limit(1);

    if (!newPlan) {
      return res.status(404).json({ error: 'Target plan not found' });
    }

    const [updatedSub] = await db
      .update(hostingSubscriptions)
      .set({ planId: newPlan.id })
      .where(eq(hostingSubscriptions.id, sub.id))
      .returning();

    await db
      .update(hostingAccounts)
      .set({
        serviceType: newPlan.category,
        cpuAllocation: newPlan.cpuCores,
        ramAllocationGb: newPlan.ramGb,
      })
      .where(eq(hostingAccounts.subscriptionId, sub.id));

    await db.insert(invoices).values({
      userId: user.id,
      subscriptionId: sub.id,
      invoiceNumber: `INV-UPG-${Date.now().toString().slice(-6)}`,
      amountCents:
        sub.billingCycle === 'annual'
          ? newPlan.annualPriceCents
          : newPlan.monthlyPriceCents,
      currency: 'USD',
      status: 'paid',
      paymentProvider: 'sandbox_stripe',
      description: `Plan change to ${newPlan.name} (${sub.billingCycle})`,
      dueAt: new Date(),
      paidAt: new Date(),
    });

    await createNotification({
      userId: user.id,
      category: 'billing',
      title: 'Hosting Plan Updated',
      message: `Subscription "${sub.environmentLabel}" moved to ${newPlan.name}.`,
    });

    res.json({ subscription: updatedSub, plan: newPlan });
  } catch (error: any) {
    console.error('Upgrade error:', error);
    res.status(400).json({ error: error.message || 'Unable to change hosting plan' });
  }
});

hostingRouter.post('/hosting/subscriptions/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const subId = Number(req.params.id);
    const user = req.dbUser!;

    const [updated] = await db
      .update(hostingSubscriptions)
      .set({ status: 'cancelled', autoRenew: false })
      .where(and(eq(hostingSubscriptions.id, subId), eq(hostingSubscriptions.userId, user.id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await db
      .update(hostingAccounts)
      .set({ status: 'stopped' })
      .where(eq(hostingAccounts.subscriptionId, subId));

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'hosting.subscription_cancelled',
      resourceType: 'hosting_subscription',
      resourceId: subId,
    });

    res.json({ subscription: updated });
  } catch (error: any) {
    console.error('Cancel subscription failed:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

hostingRouter.post('/hosting/accounts/:id/power', async (req: AuthRequest, res) => {
  try {
    const accountId = Number(req.params.id);
    const { action } = z.object({ action: z.enum(['start', 'stop', 'restart']) }).parse(req.body);
    const user = req.dbUser!;

    const [account] = await db
      .select()
      .from(hostingAccounts)
      .where(and(eq(hostingAccounts.id, accountId), eq(hostingAccounts.userId, user.id)))
      .limit(1);

    if (!account) {
      return res.status(404).json({ error: 'Hosting account not found' });
    }

    const nextStatus = action === 'stop' ? 'stopped' : 'active';
    const [updated] = await db
      .update(hostingAccounts)
      .set({ status: nextStatus })
      .where(eq(hostingAccounts.id, account.id))
      .returning();

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: `hosting.power_${action}`,
      resourceType: 'hosting_account',
      resourceId: account.id,
    });

    emitRealtimeEvent({
      type: 'hosting:updated',
      userId: user.id,
      payload: { account: sanitizeAccount(updated) },
    });

    res.json({
      account: sanitizeAccount(updated),
      message: `Environment ${account.accountCode} ${action} completed.`,
    });
  } catch (error: any) {
    console.error('Power action error:', error);
    res.status(400).json({ error: 'Invalid power action' });
  }
});

hostingRouter.post('/hosting/accounts/:id/rotate-sftp', async (req: AuthRequest, res) => {
  try {
    const accountId = Number(req.params.id);
    const user = req.dbUser!;

    const [account] = await db
      .select()
      .from(hostingAccounts)
      .where(and(eq(hostingAccounts.id, accountId), eq(hostingAccounts.userId, user.id)))
      .limit(1);

    if (!account) return res.status(404).json({ error: 'Hosting account not found' });

    const newPassword = `mc_${crypto.randomBytes(12).toString('base64url')}`;
    const sftpCredentialHash = hashCredential(newPassword);

    await db
      .update(hostingAccounts)
      .set({ sftpCredentialHash })
      .where(eq(hostingAccounts.id, account.id));

    await recordAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'hosting.sftp_credential_rotated',
      resourceType: 'hosting_account',
      resourceId: account.id,
    });

    res.json({
      rotated: true,
      sftpUsername: account.sftpUsername,
      maskedCredential: `mc_********${newPassword.slice(-2)}`,
      notice:
        'SFTP credential rotated and encrypted with salted bcrypt in PostgreSQL. Raw secret keys are never exposed in API responses.',
    });
  } catch (error: any) {
    console.error('Rotate SFTP failed:', error);
    res.status(500).json({ error: 'Failed to rotate SFTP credential' });
  }
});

// Websites CRUD
hostingRouter.get('/websites', async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(websites)
      .where(eq(websites.userId, req.dbUser!.id))
      .orderBy(desc(websites.createdAt));
    res.json({ websites: list });
  } catch (error: any) {
    console.error('Failed listing websites:', error);
    res.status(500).json({ error: 'Failed to load websites' });
  }
});

const createWebsiteSchema = z.object({
  hostingAccountId: z.number().int().positive(),
  name: z.string().min(2).max(80),
  primaryDomain: z.string().min(3).max(160),
  runtime: z.enum(['static', 'nodejs', 'php', 'python', 'docker']).default('nodejs'),
  documentRoot: z.string().min(1).max(160).default('/public_html'),
  sslEnabled: z.boolean().default(true),
});

hostingRouter.post('/websites', async (req: AuthRequest, res) => {
  try {
    const parsed = createWebsiteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid website details', issues: parsed.error.issues });
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

    if (!account) {
      return res.status(404).json({ error: 'Hosting account not found' });
    }

    const [sub] = await db
      .select()
      .from(hostingSubscriptions)
      .where(eq(hostingSubscriptions.id, account.subscriptionId))
      .limit(1);

    const [plan] = sub
      ? await db.select().from(hostingPlans).where(eq(hostingPlans.id, sub.planId)).limit(1)
      : [null];

    const existingSites = await db
      .select()
      .from(websites)
      .where(eq(websites.hostingAccountId, account.id));

    if (plan && existingSites.length >= plan.maxWebsites) {
      return res.status(403).json({
        error: `Plan limit reached: ${plan.name} allows up to ${plan.maxWebsites} websites. Upgrade your plan to add more.`,
      });
    }

    const [site] = await db
      .insert(websites)
      .values({
        userId: user.id,
        hostingAccountId: account.id,
        name: parsed.data.name,
        primaryDomain: parsed.data.primaryDomain.toLowerCase(),
        runtime: parsed.data.runtime,
        documentRoot: parsed.data.documentRoot,
        sslEnabled: parsed.data.sslEnabled,
        sslStatus: parsed.data.sslEnabled ? 'active' : 'unconfigured',
        deploymentStatus: 'live',
      })
      .returning();

    await createNotification({
      userId: user.id,
      category: 'website',
      title: 'Website Provisioned',
      message: `${site.name} (${site.primaryDomain}) is configured on ${site.runtime}.`,
    });

    res.status(201).json({ website: site });
  } catch (error: any) {
    console.error('Create website failed:', error);
    res.status(500).json({ error: 'Failed to create website' });
  }
});

const patchWebsiteSchema = z.object({
  runtime: z.enum(['static', 'nodejs', 'php', 'python', 'docker']).optional(),
  documentRoot: z.string().min(1).max(160).optional(),
  sslEnabled: z.boolean().optional(),
  deploymentStatus: z.enum(['live', 'building', 'failed', 'stopped']).optional(),
  envVarsJson: z.string().optional(),
  redirectRulesJson: z.string().optional(),
});

hostingRouter.patch('/websites/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = patchWebsiteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid website update' });
    }

    const [updated] = await db
      .update(websites)
      .set({
        ...parsed.data,
        ...(parsed.data.sslEnabled !== undefined && {
          sslStatus: parsed.data.sslEnabled ? 'active' : 'unconfigured',
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(websites.id, id), eq(websites.userId, req.dbUser!.id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Website not found' });
    }
    res.json({ website: updated });
  } catch (error: any) {
    console.error('Update website failed:', error);
    res.status(500).json({ error: 'Failed to update website' });
  }
});

hostingRouter.delete('/websites/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(websites)
      .where(and(eq(websites.id, id), eq(websites.userId, req.dbUser!.id)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Website not found' });
    }
    res.json({ deleted: true });
  } catch (error: any) {
    console.error('Delete website failed:', error);
    res.status(500).json({ error: 'Failed to delete website' });
  }
});
