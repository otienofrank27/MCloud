import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('MCloud Customer'),
  role: text('role').notNull().default('customer'), // super_admin | admin | support_agent | finance_manager | customer
  organizationName: text('organization_name').notNull().default('Personal Workspace'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  emailVerified: boolean('email_verified').notNull().default(true),
  passwordHash: text('password_hash').notNull().default(''),
  apiCredentialHash: text('api_credential_hash').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userSessions = pgTable('user_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  deviceLabel: text('device_label').notNull(),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  revoked: boolean('revoked').notNull().default(false),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingPlans = pgTable('hosting_plans', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  audienceLabel: text('audience_label').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(), // shared | vps | dedicated | application
  monthlyPriceCents: integer('monthly_price_cents').notNull(),
  annualPriceCents: integer('annual_price_cents').notNull(),
  storageGb: integer('storage_gb').notNull(),
  bandwidthTb: integer('bandwidth_tb').notNull(),
  ramGb: integer('ram_gb').notNull(),
  cpuCores: integer('cpu_cores').notNull(),
  maxWebsites: integer('max_websites').notNull(),
  maxDatabases: integer('max_databases').notNull(),
  maxDomains: integer('max_domains').notNull(),
  sslIncluded: boolean('ssl_included').notNull().default(true),
  backupsIncluded: boolean('backups_included').notNull().default(true),
  supportLevel: text('support_level').notNull().default('Standard 24/7'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingSubscriptions = pgTable('hosting_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  planId: integer('plan_id')
    .references(() => hostingPlans.id)
    .notNull(),
  billingCycle: text('billing_cycle').notNull().default('monthly'), // monthly | annual
  status: text('status').notNull().default('active'), // active | pending_payment | past_due | cancelled
  environmentLabel: text('environment_label').notNull(),
  region: text('region').notNull().default('eu-west-1'),
  autoRenew: boolean('auto_renew').notNull().default(true),
  currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
  currentPeriodEnd: timestamp('current_period_end').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingNodes = pgTable('hosting_nodes', {
  id: serial('id').primaryKey(),
  hostname: text('hostname').notNull().unique(),
  region: text('region').notNull(),
  nodeType: text('node_type').notNull(), // shared_cluster | vps_hypervisor | dedicated_baremetal | app_runner
  providerAdapter: text('provider_adapter').notNull().default('LocalDevInfrastructureAdapter'),
  ipAddress: text('ip_address').notNull(),
  osVersion: text('os_version').notNull().default('Ubuntu 24.04 LTS'),
  cpuCores: integer('cpu_cores').notNull(),
  ramGb: integer('ram_gb').notNull(),
  storageGb: integer('storage_gb').notNull(),
  cpuUsagePct: integer('cpu_usage_pct').notNull().default(18),
  ramUsagePct: integer('ram_usage_pct').notNull().default(32),
  storageUsagePct: integer('storage_usage_pct').notNull().default(24),
  networkMbps: integer('network_mbps').notNull().default(140),
  status: text('status').notNull().default('online'), // online | maintenance | degraded
  maintenanceNote: text('maintenance_note').notNull().default(''),
  lastHeartbeatAt: timestamp('last_heartbeat_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingAccounts = pgTable('hosting_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  subscriptionId: integer('subscription_id')
    .references(() => hostingSubscriptions.id, { onDelete: 'cascade' })
    .notNull(),
  nodeId: integer('node_id')
    .references(() => hostingNodes.id)
    .notNull(),
  accountCode: text('account_code').notNull().unique(),
  serviceType: text('service_type').notNull(), // shared | vps | dedicated | application
  region: text('region').notNull(),
  hostname: text('hostname').notNull(),
  ipAddress: text('ip_address').notNull(),
  osImage: text('os_image').notNull().default('Ubuntu 24.04 LTS'),
  sftpUsername: text('sftp_username').notNull(),
  sftpCredentialHash: text('sftp_credential_hash').notNull().default(''),
  storageUsedMb: integer('storage_used_mb').notNull().default(256),
  bandwidthUsedGb: integer('bandwidth_used_gb').notNull().default(4),
  cpuAllocation: integer('cpu_allocation').notNull().default(2),
  ramAllocationGb: integer('ram_allocation_gb').notNull().default(4),
  status: text('status').notNull().default('active'), // active | stopped | suspended
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const websites = pgTable('websites', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  hostingAccountId: integer('hosting_account_id')
    .references(() => hostingAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  primaryDomain: text('primary_domain').notNull(),
  runtime: text('runtime').notNull().default('nodejs'), // static | nodejs | php | python | docker
  documentRoot: text('document_root').notNull().default('/var/www/public'),
  sslEnabled: boolean('ssl_enabled').notNull().default(true),
  sslStatus: text('ssl_status').notNull().default('active'), // active | pending | unconfigured
  uptimePct: text('uptime_pct').notNull().default('99.98'),
  deploymentStatus: text('deployment_status').notNull().default('live'), // live | building | failed | stopped
  envVarsJson: text('env_vars_json').notNull().default('[]'),
  redirectRulesJson: text('redirect_rules_json').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const domains = pgTable('domains', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  domainName: text('domain_name').notNull().unique(),
  registrarAdapter: text('registrar_adapter').notNull().default('SandboxDnsAdapter'),
  registrationMode: text('registration_mode').notNull().default('connected'), // connected | transfer_requested | sandbox_registered
  status: text('status').notNull().default('active'), // active | pending_verification | expired
  nameserversJson: text('nameservers_json').notNull().default('["ns1.mcloud.host","ns2.mcloud.host"]'),
  sslStatus: text('ssl_status').notNull().default('active'),
  autoRenew: boolean('auto_renew').notNull().default(true),
  expiresAt: timestamp('expires_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dnsRecords = pgTable('dns_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  domainId: integer('domain_id')
    .references(() => domains.id, { onDelete: 'cascade' })
    .notNull(),
  recordType: text('record_type').notNull(), // A | AAAA | CNAME | MX | TXT | NS | SRV | CAA
  host: text('host').notNull(),
  value: text('value').notNull(),
  ttl: integer('ttl').notNull().default(3600),
  priority: integer('priority').notNull().default(10),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const managedDatabases = pgTable('managed_databases', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  hostingAccountId: integer('hosting_account_id')
    .references(() => hostingAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  engine: text('engine').notNull().default('postgresql'), // postgresql | mysql | mariadb
  version: text('version').notNull().default('16.4'),
  host: text('host').notNull(),
  port: integer('port').notNull().default(5432),
  storageUsedMb: integer('storage_used_mb').notNull().default(42),
  storageLimitMb: integer('storage_limit_mb').notNull().default(10240),
  status: text('status').notNull().default('running'),
  adapterNotice: text('adapter_notice').notNull().default('Logical tenant DB record (Cloud SQL PostgreSQL control plane)'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const databaseUsers = pgTable('database_users', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  databaseId: integer('database_id')
    .references(() => managedDatabases.id, { onDelete: 'cascade' })
    .notNull(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull().default(''),
  permissions: text('permissions').notNull().default('read_write'), // read_write | read_only | admin
  allowedHost: text('allowed_host').notNull().default('%'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hostingFiles = pgTable('hosting_files', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  hostingAccountId: integer('hosting_account_id')
    .references(() => hostingAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  parentPath: text('parent_path').notNull().default('/'),
  name: text('name').notNull(),
  fullPath: text('full_path').notNull(),
  isDirectory: boolean('is_directory').notNull().default(false),
  sizeBytes: integer('size_bytes').notNull().default(0),
  permissions: text('permissions').notNull().default('0644'),
  mimeType: text('mime_type').notNull().default('text/plain'),
  content: text('content').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  hostingAccountId: integer('hosting_account_id')
    .references(() => hostingAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  repoProvider: text('repo_provider').notNull().default('github'), // github | gitlab | archive
  repoUrl: text('repo_url').notNull(),
  branch: text('branch').notNull().default('main'),
  buildCommand: text('build_command').notNull().default('npm run build'),
  startCommand: text('start_command').notNull().default('npm start'),
  runtime: text('runtime').notNull().default('nodejs-22'),
  autoDeploy: boolean('auto_deploy').notNull().default(true),
  envVarsJson: text('env_vars_json').notNull().default('[]'),
  status: text('status').notNull().default('running'),
  activeDeploymentId: integer('active_deployment_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deployments = pgTable('deployments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  applicationId: integer('application_id')
    .references(() => applications.id, { onDelete: 'cascade' })
    .notNull(),
  commitHash: text('commit_hash').notNull(),
  commitMessage: text('commit_message').notNull(),
  branch: text('branch').notNull(),
  status: text('status').notNull().default('queued'), // queued | building | healthy | failed | rolled_back
  durationMs: integer('duration_ms').notNull().default(0),
  logsText: text('logs_text').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const backups = pgTable('backups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetType: text('target_type').notNull(), // website | database | hosting_account
  targetId: integer('target_id').notNull(),
  targetName: text('target_name').notNull(),
  backupType: text('backup_type').notNull().default('manual'), // manual | scheduled | automatic
  sizeMb: integer('size_mb').notNull().default(128),
  checksumSha256: text('checksum_sha256').notNull(),
  integrityVerified: boolean('integrity_verified').notNull().default(true),
  storageAdapter: text('storage_adapter').notNull().default('LocalVaultBackupAdapter'),
  status: text('status').notNull().default('completed'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const backupSchedules = pgTable('backup_schedules', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  targetName: text('target_name').notNull(),
  frequency: text('frequency').notNull().default('daily'), // daily | weekly | monthly
  retentionDays: integer('retention_days').notNull().default(30),
  enabled: boolean('enabled').notNull().default(true),
  nextRunAt: timestamp('next_run_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  subscriptionId: integer('subscription_id').references(() => hostingSubscriptions.id, {
    onDelete: 'set null',
  }),
  invoiceNumber: text('invoice_number').notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  discountCode: text('discount_code').notNull().default(''),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('paid'), // paid | open | void
  paymentProvider: text('payment_provider').notNull().default('sandbox_stripe'), // sandbox_stripe | sandbox_paypal | sandbox_mpesa
  description: text('description').notNull(),
  dueAt: timestamp('due_at').defaultNow().notNull(),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ticketNumber: text('ticket_number').notNull().unique(),
  subject: text('subject').notNull(),
  category: text('category').notNull().default('hosting'),
  priority: text('priority').notNull().default('medium'), // low | medium | high | urgent
  status: text('status').notNull().default('open'), // open | in_progress | waiting_customer | resolved | closed
  assignedAgentName: text('assigned_agent_name').notNull().default('MCloud Triage Queue'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .references(() => supportTickets.id, { onDelete: 'cascade' })
    .notNull(),
  senderUserId: integer('sender_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').notNull(),
  body: text('body').notNull(),
  attachmentName: text('attachment_name').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  ipAddress: text('ip_address').notNull().default('127.0.0.1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const contactInquiries = pgTable('contact_inquiries', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull().default(''),
  topic: text('topic').notNull().default('sales'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: text('setting_value').notNull(),
  description: text('description').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
