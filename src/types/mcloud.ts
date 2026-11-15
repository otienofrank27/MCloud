export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'support_agent'
  | 'finance_manager'
  | 'customer';

export interface DbUser {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  organizationName: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  hasPassword?: boolean;
  hasApiCredential?: boolean;
  createdAt: string;
}

export interface UserSession {
  id: number;
  deviceLabel: string;
  ipAddress: string;
  revoked: boolean;
  lastActiveAt: string;
  createdAt: string;
}

export interface HostingPlan {
  id: number;
  slug: string;
  name: string;
  audienceLabel: string;
  description: string;
  category: 'shared' | 'vps' | 'dedicated' | 'application';
  monthlyPriceCents: number;
  annualPriceCents: number;
  storageGb: number;
  bandwidthTb: number;
  ramGb: number;
  cpuCores: number;
  maxWebsites: number;
  maxDatabases: number;
  maxDomains: number;
  sslIncluded: boolean;
  backupsIncluded: boolean;
  supportLevel: string;
  isActive: boolean;
}

export interface HostingSubscription {
  id: number;
  userId: number;
  planId: number;
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'pending_payment' | 'past_due' | 'cancelled';
  environmentLabel: string;
  region: string;
  autoRenew: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface HostingAccount {
  id: number;
  userId: number;
  subscriptionId: number;
  nodeId: number;
  accountCode: string;
  serviceType: string;
  region: string;
  hostname: string;
  ipAddress: string;
  osImage: string;
  sftpUsername: string;
  storageUsedMb: number;
  bandwidthUsedGb: number;
  cpuAllocation: number;
  ramAllocationGb: number;
  status: 'active' | 'stopped' | 'suspended';
  createdAt: string;
}

export interface Website {
  id: number;
  userId: number;
  hostingAccountId: number;
  name: string;
  primaryDomain: string;
  runtime: 'static' | 'nodejs' | 'php' | 'python' | 'docker';
  documentRoot: string;
  sslEnabled: boolean;
  sslStatus: string;
  uptimePct: string;
  deploymentStatus: 'live' | 'building' | 'failed' | 'stopped';
  envVarsJson: string;
  redirectRulesJson: string;
  createdAt: string;
}

export interface Domain {
  id: number;
  domainName: string;
  registrationMode: string;
  status: string;
  nameserversJson: string;
  sslStatus: string;
  autoRenew: boolean;
  expiresAt: string;
}

export interface DnsRecord {
  id: number;
  domainId: number;
  recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA';
  host: string;
  value: string;
  ttl: number;
  priority: number;
}

export interface ManagedDatabase {
  id: number;
  hostingAccountId: number;
  name: string;
  engine: 'postgresql' | 'mysql' | 'mariadb';
  version: string;
  host: string;
  port: number;
  storageUsedMb: number;
  storageLimitMb: number;
  status: string;
  createdAt: string;
}

export interface DatabaseUser {
  id: number;
  databaseId: number;
  username: string;
  permissions: 'read_write' | 'read_only' | 'admin';
  allowedHost: string;
  createdAt: string;
}

export interface HostingFile {
  id: number;
  hostingAccountId: number;
  parentPath: string;
  name: string;
  fullPath: string;
  isDirectory: boolean;
  sizeBytes: number;
  permissions: string;
  mimeType: string;
  content: string;
  updatedAt: string;
}

export interface Application {
  id: number;
  hostingAccountId: number;
  name: string;
  repoProvider: 'github' | 'gitlab' | 'archive';
  repoUrl: string;
  branch: string;
  buildCommand: string;
  startCommand: string;
  runtime: string;
  autoDeploy: boolean;
  status: string;
  activeDeploymentId: number | null;
  createdAt: string;
}

export interface Deployment {
  id: number;
  applicationId: number;
  commitHash: string;
  commitMessage: string;
  branch: string;
  status: string;
  durationMs: number;
  logsText: string;
  createdAt: string;
}

export interface Backup {
  id: number;
  targetType: string;
  targetId: number;
  targetName: string;
  backupType: string;
  sizeMb: number;
  checksumSha256: string;
  integrityVerified: boolean;
  status: string;
  createdAt: string;
}

export interface BackupSchedule {
  id: number;
  targetType: string;
  targetId: number;
  targetName: string;
  frequency: string;
  retentionDays: number;
  enabled: boolean;
  nextRunAt: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  amountCents: number;
  taxCents: number;
  discountCode: string;
  currency: string;
  status: string;
  paymentProvider: string;
  description: string;
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  userId: number;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAgentName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  senderName: string;
  senderRole: string;
  body: string;
  attachmentName: string;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  category: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface HostingNode {
  id: number;
  hostname: string;
  region: string;
  nodeType: string;
  providerAdapter: string;
  ipAddress: string;
  osVersion: string;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  cpuUsagePct: number;
  ramUsagePct: number;
  storageUsagePct: number;
  networkMbps: number;
  status: 'online' | 'maintenance' | 'degraded';
  maintenanceNote: string;
  lastHeartbeatAt: string;
}

export interface AuditLog {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}
