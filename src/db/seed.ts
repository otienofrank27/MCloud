import { eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  hostingNodes,
  hostingPlans,
  systemSettings,
  users,
} from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  emailVerified = true
) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const defaultRole = 'customer';

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(users)
        .set({
          email: normalizedEmail,
          displayName: displayName || existing[0].displayName,
          emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated;
    }

    const [inserted] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName: displayName || normalizedEmail.split('@')[0] || 'MCloud User',
        role: defaultRole,
        organizationName: 'Personal Cloud Workspace',
        emailVerified,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted;
  } catch (error) {
    console.error('Failed to upsert user:', error);
    throw new Error('Unable to synchronize user profile.', { cause: error });
  }
}

let seededCatalogInMemory = false;

export async function ensurePlatformCatalogSeeded() {
  if (seededCatalogInMemory) return;

  try {
    const [{ count: planCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hostingPlans);

    if (planCount === 0) {
      await db
        .insert(hostingPlans)
        .values([
          {
            slug: 'developer-sandbox',
            name: 'Developer Sandbox',
            audienceLabel: 'For local evaluation & staging',
            description:
              'Zero-cost sandbox environment to evaluate MCloud website hosting, DNS zone editing, file management, and build pipelines.',
            category: 'shared',
            monthlyPriceCents: 0,
            annualPriceCents: 0,
            storageGb: 10,
            bandwidthTb: 1,
            ramGb: 1,
            cpuCores: 1,
            maxWebsites: 2,
            maxDatabases: 1,
            maxDomains: 2,
            sslIncluded: true,
            backupsIncluded: true,
            supportLevel: 'Community & Docs',
            isActive: true,
          },
          {
            slug: 'starter-cloud',
            name: 'Starter Cloud',
            audienceLabel: 'For early-stage sites & portfolios',
            description:
              'Isolated shared web hosting with automated SSL certificates, SFTP access, and managed database connectivity.',
            category: 'shared',
            monthlyPriceCents: 900,
            annualPriceCents: 9000,
            storageGb: 40,
            bandwidthTb: 2,
            ramGb: 2,
            cpuCores: 1,
            maxWebsites: 3,
            maxDatabases: 2,
            maxDomains: 3,
            sslIncluded: true,
            backupsIncluded: true,
            supportLevel: 'Standard 24/7',
            isActive: true,
          },
          {
            slug: 'professional-cloud',
            name: 'Professional Multi-Site',
            audienceLabel: 'For growing SaaS & agency workloads',
            description:
              'Multi-site web & Node.js application hosting with automated daily snapshots, Git deployment queues, and priority support.',
            category: 'application',
            monthlyPriceCents: 2400,
            annualPriceCents: 24000,
            storageGb: 120,
            bandwidthTb: 5,
            ramGb: 8,
            cpuCores: 4,
            maxWebsites: 15,
            maxDatabases: 10,
            maxDomains: 15,
            sslIncluded: true,
            backupsIncluded: true,
            supportLevel: 'Priority 24/7',
            isActive: true,
          },
          {
            slug: 'business-vps',
            name: 'Business VPS Compute',
            audienceLabel: 'For scaling services & custom stacks',
            description:
              'Dedicated vCPU/RAM virtual private server slice with power lifecycle controls, isolated containers, and real-time node telemetry.',
            category: 'vps',
            monthlyPriceCents: 6900,
            annualPriceCents: 69000,
            storageGb: 320,
            bandwidthTb: 12,
            ramGb: 16,
            cpuCores: 8,
            maxWebsites: 40,
            maxDatabases: 25,
            maxDomains: 40,
            sslIncluded: true,
            backupsIncluded: true,
            supportLevel: 'Dedicated Engineer',
            isActive: true,
          },
          {
            slug: 'enterprise-dedicated',
            name: 'Enterprise Bare Metal',
            audienceLabel: 'For high-throughput production clusters',
            description:
              'Single-tenant bare-metal hardware allocation with NVMe RAID arrays, custom network routing, and SLA-backed incident response.',
            category: 'dedicated',
            monthlyPriceCents: 19900,
            annualPriceCents: 199000,
            storageGb: 2000,
            bandwidthTb: 40,
            ramGb: 64,
            cpuCores: 24,
            maxWebsites: 150,
            maxDatabases: 100,
            maxDomains: 150,
            sslIncluded: true,
            backupsIncluded: true,
            supportLevel: '15-min SLA Response',
            isActive: true,
          },
        ])
        .onConflictDoNothing();
    }

    await db
      .insert(hostingNodes)
      .values([
        {
          hostname: 'global-anycast-01.mcloud.internal',
          region: 'global-anycast (Global Multi-Region Edge)',
          nodeType: 'app_runner',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.20.0.10',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 64,
          ramGb: 256,
          storageGb: 8000,
          cpuUsagePct: 24,
          ramUsagePct: 38,
          storageUsagePct: 21,
          networkMbps: 640,
          status: 'online',
          maintenanceNote: 'Global Anycast edge routing mesh ready',
        },
        {
          hostname: 'lon-edge-01.mcloud.internal',
          region: 'eu-west-2 (London, UK)',
          nodeType: 'shared_cluster',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.24.10.11',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 32,
          ramGb: 128,
          storageGb: 4000,
          cpuUsagePct: 22,
          ramUsagePct: 41,
          storageUsagePct: 28,
          networkMbps: 340,
          status: 'online',
          maintenanceNote: 'Nominal operation (Local dev cluster adapter)',
        },
        {
          hostname: 'fra-vps-02.mcloud.internal',
          region: 'eu-west-1 (Frankfurt, Germany)',
          nodeType: 'vps_hypervisor',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.24.20.14',
          osVersion: 'Debian 12 Bookworm',
          cpuCores: 64,
          ramGb: 256,
          storageGb: 8000,
          cpuUsagePct: 34,
          ramUsagePct: 52,
          storageUsagePct: 37,
          networkMbps: 520,
          status: 'online',
          maintenanceNote: 'KVM hypervisor adapter ready',
        },
        {
          hostname: 'iad-app-01.mcloud.internal',
          region: 'us-east-1 (Virginia, USA)',
          nodeType: 'app_runner',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.28.12.8',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 29,
          ramUsagePct: 46,
          storageUsagePct: 31,
          networkMbps: 410,
          status: 'online',
          maintenanceNote: 'North America container runner active',
        },
        {
          hostname: 'yyz-cloud-01.mcloud.internal',
          region: 'ca-central-1 (Toronto, Canada)',
          nodeType: 'vps_hypervisor',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.28.30.18',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 20,
          ramUsagePct: 35,
          storageUsagePct: 24,
          networkMbps: 360,
          status: 'online',
          maintenanceNote: 'Canada central cluster ready',
        },
        {
          hostname: 'gru-edge-01.mcloud.internal',
          region: 'sa-east-1 (Sao Paulo, Brazil)',
          nodeType: 'shared_cluster',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.30.14.22',
          osVersion: 'Debian 12 Bookworm',
          cpuCores: 32,
          ramGb: 128,
          storageGb: 4000,
          cpuUsagePct: 27,
          ramUsagePct: 44,
          storageUsagePct: 29,
          networkMbps: 310,
          status: 'online',
          maintenanceNote: 'South America edge node active',
        },
        {
          hostname: 'dxb-edge-01.mcloud.internal',
          region: 'me-central-1 (Dubai, UAE)',
          nodeType: 'vps_hypervisor',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.34.8.15',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 19,
          ramUsagePct: 33,
          storageUsagePct: 22,
          networkMbps: 295,
          status: 'online',
          maintenanceNote: 'Middle East gateway cluster active',
        },
        {
          hostname: 'los-edge-01.mcloud.internal',
          region: 'af-west-1 (Lagos, Nigeria)',
          nodeType: 'shared_cluster',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.36.4.12',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 32,
          ramGb: 128,
          storageGb: 4000,
          cpuUsagePct: 21,
          ramUsagePct: 36,
          storageUsagePct: 25,
          networkMbps: 260,
          status: 'online',
          maintenanceNote: 'West Africa regional cluster ready',
        },
        {
          hostname: 'nbo-edge-01.mcloud.internal',
          region: 'af-east-1 (Nairobi, Kenya)',
          nodeType: 'app_runner',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.36.12.19',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 32,
          ramGb: 128,
          storageGb: 4000,
          cpuUsagePct: 18,
          ramUsagePct: 31,
          storageUsagePct: 20,
          networkMbps: 245,
          status: 'online',
          maintenanceNote: 'East Africa regional cluster ready',
        },
        {
          hostname: 'jnb-vps-01.mcloud.internal',
          region: 'af-south-1 (Johannesburg, South Africa)',
          nodeType: 'vps_hypervisor',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.36.22.9',
          osVersion: 'Debian 12 Bookworm',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 23,
          ramUsagePct: 39,
          storageUsagePct: 27,
          networkMbps: 300,
          status: 'online',
          maintenanceNote: 'Southern Africa hypervisor active',
        },
        {
          hostname: 'bom-app-01.mcloud.internal',
          region: 'ap-south-1 (Mumbai, India)',
          nodeType: 'app_runner',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.38.6.14',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 31,
          ramUsagePct: 48,
          storageUsagePct: 33,
          networkMbps: 420,
          status: 'online',
          maintenanceNote: 'South Asia compute cluster active',
        },
        {
          hostname: 'sin-metal-01.mcloud.internal',
          region: 'ap-southeast-1 (Singapore)',
          nodeType: 'dedicated_baremetal',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.32.4.20',
          osVersion: 'Rocky Linux 9.4',
          cpuCores: 96,
          ramGb: 512,
          storageGb: 16000,
          cpuUsagePct: 16,
          ramUsagePct: 29,
          storageUsagePct: 19,
          networkMbps: 280,
          status: 'online',
          maintenanceNote: 'Single-tenant NVMe rack ready',
        },
        {
          hostname: 'hnd-vps-01.mcloud.internal',
          region: 'ap-northeast-1 (Tokyo, Japan)',
          nodeType: 'vps_hypervisor',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.40.8.17',
          osVersion: 'Debian 12 Bookworm',
          cpuCores: 64,
          ramGb: 256,
          storageGb: 8000,
          cpuUsagePct: 26,
          ramUsagePct: 42,
          storageUsagePct: 30,
          networkMbps: 490,
          status: 'online',
          maintenanceNote: 'Northeast Asia hypervisor ready',
        },
        {
          hostname: 'syd-edge-01.mcloud.internal',
          region: 'oc-east-1 (Sydney, Australia)',
          nodeType: 'shared_cluster',
          providerAdapter: 'LocalDevInfrastructureAdapter',
          ipAddress: '10.42.10.25',
          osVersion: 'Ubuntu 24.04 LTS',
          cpuCores: 48,
          ramGb: 192,
          storageGb: 6000,
          cpuUsagePct: 17,
          ramUsagePct: 30,
          storageUsagePct: 21,
          networkMbps: 315,
          status: 'online',
          maintenanceNote: 'Oceania cluster active',
        },
      ])
      .onConflictDoNothing({ target: hostingNodes.hostname });

    const [{ count: settingsCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(systemSettings);

    if (settingsCount === 0) {
      await db
        .insert(systemSettings)
        .values([
          {
            settingKey: 'payment_mode',
            settingValue: 'sandbox',
            description: 'Active billing gateway adapter (sandbox | stripe_live)',
          },
          {
            settingKey: 'infrastructure_adapter',
            settingValue: 'LocalDevInfrastructureAdapter',
            description: 'Active compute & hosting provisioning adapter',
          },
          {
            settingKey: 'default_nameservers',
            settingValue: 'ns1.mcloud.host,ns2.mcloud.host',
            description: 'Default authoritative DNS nameservers assigned to zones',
          },
          {
            settingKey: 'tax_rate_percent',
            settingValue: '0',
            description: 'Default VAT/sales tax rate applied to invoices',
          },
        ])
        .onConflictDoNothing();
    }

    seededCatalogInMemory = true;
  } catch (error) {
    console.error('Error seeding platform catalog:', error);
    throw new Error('Failed to initialize platform catalog.', { cause: error });
  }
}
