import { Router } from 'express';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { hostingNodes, hostingPlans, contactInquiries } from '../db/schema.ts';
import { ensurePlatformCatalogSeeded } from '../db/seed.ts';
import { ALL_GLOBAL_REGIONS, GLOBAL_REGION_GROUPS } from '../lib/regions.ts';

export const publicRouter = Router();

publicRouter.get('/plans', async (_req, res) => {
  try {
    await ensurePlatformCatalogSeeded();
    const plans = await db
      .select()
      .from(hostingPlans)
      .orderBy(asc(hostingPlans.monthlyPriceCents));
    res.json({ plans: plans.filter((p) => p.isActive) });
  } catch (error: any) {
    console.error('Error fetching public plans:', error);
    res.status(500).json({ error: 'Failed to load hosting plans' });
  }
});

publicRouter.get('/nodes-summary', async (_req, res) => {
  try {
    await ensurePlatformCatalogSeeded();
    const nodes = await db
      .select({
        region: hostingNodes.region,
        status: hostingNodes.status,
      })
      .from(hostingNodes);

    const activeRegions = Array.from(
      new Set(nodes.filter((n) => n.status === 'online').map((n) => n.region))
    ).sort();

    res.json({
      totalZones: Math.max(ALL_GLOBAL_REGIONS.length, activeRegions.length),
      regions: activeRegions,
    });
  } catch (error: any) {
    console.error('Error fetching node summary:', error);
    res.status(500).json({ error: 'Failed to load regional availability' });
  }
});

publicRouter.get('/regions', (_req, res) => {
  res.json({
    groups: GLOBAL_REGION_GROUPS,
    totalRegions: ALL_GLOBAL_REGIONS.length,
    supportsCustomRegion: true,
  });
});

const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  company: z.string().max(120).optional().default(''),
  topic: z.string().min(2).max(60).optional().default('sales'),
  message: z.string().min(10).max(3000),
});

publicRouter.post('/contact', async (req, res) => {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Please check your contact form details.',
      });
    }

    await db.insert(contactInquiries).values(parsed.data);

    res.status(201).json({
      ok: true,
      message: 'Your inquiry has been logged for our infrastructure team.',
    });
  } catch (error: any) {
    console.error('Failed to save contact inquiry:', error);
    res.status(500).json({ error: 'Unable to submit contact inquiry.' });
  }
});

