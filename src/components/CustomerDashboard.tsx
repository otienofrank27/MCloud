import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BellIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FolderIcon,
  MoonIcon,
  SunIcon,
  TrashIcon,
} from './Icons';
import { MCloudLogo } from './MCloudLogo';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  ALL_GLOBAL_REGIONS,
  DEFAULT_REGION,
  GLOBAL_REGION_GROUPS,
  PREFERRED_REGION_STORAGE_KEY,
} from '../lib/regions';
import {
  AppNotification,
  Application,
  AuditLog,
  Backup,
  BackupSchedule,
  DatabaseUser,
  Deployment,
  DnsRecord,
  Domain,
  HostingAccount,
  HostingFile,
  HostingPlan,
  HostingSubscription,
  Invoice,
  ManagedDatabase,
  SupportTicket,
  TicketMessage,
  Website,
} from '../types/mcloud';

export type DashboardTab =
  | 'overview'
  | 'hosting'
  | 'websites'
  | 'domains'
  | 'databases'
  | 'files'
  | 'deployments'
  | 'monitoring'
  | 'backups'
  | 'billing'
  | 'support'
  | 'settings';

interface CustomerDashboardProps {
  preselectedPlanId?: number | null;
  onClearPreselect: () => void;
  onBackToSite: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  preselectedPlanId,
  onClearPreselect,
  onBackToSite,
  onNotify,
}) => {
  const {
    dbUser,
    sessions,
    theme,
    toggleTheme,
    logout,
    refreshProfile,
    wsConnected,
    liveTelemetry,
    lastRealtimeEvent,
  } = useAuth();

  const [tab, setTab] = useState<DashboardTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core overview state
  const [summary, setSummary] = useState<any>(null);
  const [plans, setPlans] = useState<HostingPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<HostingSubscription[]>([]);
  const [accounts, setAccounts] = useState<HostingAccount[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [databases, setDatabases] = useState<ManagedDatabase[]>([]);
  const [dbUsers, setDbUsers] = useState<DatabaseUser[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupSchedules, setBackupSchedules] = useState<BackupSchedule[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // Checkout Modal State
  const [checkoutPlan, setCheckoutPlan] = useState<HostingPlan | null>(null);
  const [checkoutCycle, setCheckoutCycle] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutLabel, setCheckoutLabel] = useState('Production Environment');
  const [checkoutRegion, setCheckoutRegion] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(PREFERRED_REGION_STORAGE_KEY);
      if (!saved) return DEFAULT_REGION;
      return ALL_GLOBAL_REGIONS.includes(saved) ? saved : '__custom__';
    } catch {
      return DEFAULT_REGION;
    }
  });
  const [customCheckoutRegion, setCustomCheckoutRegion] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(PREFERRED_REGION_STORAGE_KEY);
      if (saved && !ALL_GLOBAL_REGIONS.includes(saved)) return saved;
    } catch {
      // Ignore storage errors
    }
    return '';
  });
  const [checkoutProvider, setCheckoutProvider] = useState<
    'sandbox_stripe' | 'sandbox_paypal' | 'sandbox_mpesa'
  >('sandbox_stripe');
  const [checkoutDiscount, setCheckoutDiscount] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Website Modal / Form State
  const [siteForm, setSiteForm] = useState({
    hostingAccountId: 0,
    name: '',
    primaryDomain: '',
    runtime: 'nodejs' as Website['runtime'],
    documentRoot: '/public_html',
  });
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null);

  // Domain & DNS State
  const [domainForm, setDomainForm] = useState({
    domainName: '',
    registrationMode: 'connected' as 'connected' | 'transfer_requested' | 'sandbox_registered',
  });
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [dnsForm, setDnsForm] = useState({
    recordType: 'A' as DnsRecord['recordType'],
    host: '@',
    value: '',
    ttl: 3600,
    priority: 10,
  });

  // Database State
  const [dbForm, setDbForm] = useState({
    hostingAccountId: 0,
    name: '',
    engine: 'postgresql' as 'postgresql' | 'mysql' | 'mariadb',
  });
  const [dbUserForm, setDbUserForm] = useState({
    databaseId: 0,
    username: '',
    password: '',
    permissions: 'read_write' as 'read_write' | 'read_only' | 'admin',
  });
  const [revealedDbIds, setRevealedDbIds] = useState<Record<number, boolean>>({});
  const [rotatedSftp, setRotatedSftp] = useState<{
    accountId: number;
    sftpUsername: string;
    maskedCredential: string;
    notice: string;
  } | null>(null);
  const [rotatedApiKey, setRotatedApiKey] = useState<{
    maskedCredential: string;
    notice: string;
  } | null>(null);

  // File Manager State
  const [fileAccountId, setFileAccountId] = useState<number>(0);
  const [filePath, setFilePath] = useState('/');
  const [fileSearch, setFileSearch] = useState('');
  const [files, setFiles] = useState<HostingFile[]>([]);
  const [newFileModal, setNewFileModal] = useState<'file' | 'folder' | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [activeFile, setActiveFile] = useState<HostingFile | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorPermissions, setEditorPermissions] = useState('0644');

  // Application & Deployment State
  const [appForm, setAppForm] = useState({
    hostingAccountId: 0,
    name: '',
    repoProvider: 'github' as 'github' | 'gitlab' | 'archive',
    repoUrl: '',
    branch: 'main',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    runtime: 'nodejs-22',
  });
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);

  // Monitoring chart history
  const [telemetryHistory, setTelemetryHistory] = useState<
    Array<{ time: string; cpu: number; ram: number; network: number }>
  >([]);

  // Backup State
  const [backupTargetKey, setBackupTargetKey] = useState('');
  const [scheduleFreq, setScheduleFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Support State
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'hosting' as const,
    priority: 'medium' as const,
    message: '',
    attachmentName: '',
  });
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketReply, setTicketReply] = useState('');

  // Account Settings State
  const [profileForm, setProfileForm] = useState({
    displayName: dbUser?.displayName || '',
    organizationName: dbUser?.organizationName || '',
    twoFactorEnabled: Boolean(dbUser?.twoFactorEnabled),
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const loadAllDashboardData = useCallback(async () => {
    try {
      setError(null);
      const [ov, dom, dbs, apps, bks, inv, tkt, ntf] = await Promise.all([
        apiFetch('/api/hosting/overview'),
        apiFetch('/api/domains'),
        apiFetch('/api/databases'),
        apiFetch('/api/applications'),
        apiFetch('/api/backups'),
        apiFetch('/api/billing/invoices'),
        apiFetch('/api/support/tickets'),
        apiFetch('/api/notifications'),
      ]);

      setSummary(ov.summary);
      setPlans(ov.plans || []);
      setSubscriptions(ov.subscriptions || []);
      setAccounts(ov.accounts || []);
      setWebsites(ov.websites || []);
      setRecentActivity(ov.recentActivities || []);
      setDomains(dom.domains || []);
      setDnsRecords(dom.dnsRecords || []);
      setDatabases(dbs.databases || []);
      setDbUsers(dbs.databaseUsers || []);
      setApplications(apps.applications || []);
      setDeployments(apps.deployments || []);
      setBackups(bks.backups || []);
      setBackupSchedules(bks.schedules || []);
      setInvoices(inv.invoices || []);
      setTickets(tkt.tickets || []);
      setTicketMessages(tkt.messages || []);
      setNotifications(ntf.notifications || []);

      if (ov.accounts?.length > 0) {
        const firstAccId = ov.accounts[0].id;
        setSiteForm((prev) => ({
          ...prev,
          hostingAccountId: prev.hostingAccountId || firstAccId,
        }));
        setDbForm((prev) => ({
          ...prev,
          hostingAccountId: prev.hostingAccountId || firstAccId,
        }));
        setAppForm((prev) => ({
          ...prev,
          hostingAccountId: prev.hostingAccountId || firstAccId,
        }));
        setFileAccountId((prev) => prev || firstAccId);
      }
      if (dom.domains?.length > 0) {
        setSelectedDomainId((prev) => prev || dom.domains[0].id);
      }
      if (dbs.databases?.length > 0) {
        setDbUserForm((prev) => ({
          ...prev,
          databaseId: prev.databaseId || dbs.databases[0].id,
        }));
      }
      if (apps.applications?.length > 0) {
        setSelectedAppId((prev) => prev || apps.applications[0].id);
      }
      if (tkt.tickets?.length > 0) {
        setSelectedTicketId((prev) => prev || tkt.tickets[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllDashboardData();
  }, [loadAllDashboardData]);

  useEffect(() => {
    if (dbUser) {
      setProfileForm({
        displayName: dbUser.displayName,
        organizationName: dbUser.organizationName,
        twoFactorEnabled: dbUser.twoFactorEnabled,
      });
    }
  }, [dbUser]);

  // Preselect plan when arriving from Public Pricing page
  useEffect(() => {
    if (preselectedPlanId && plans.length > 0) {
      const target = plans.find((p) => p.id === preselectedPlanId);
      if (target) {
        setTab('hosting');
        setCheckoutPlan(target);
        onClearPreselect();
      }
    }
  }, [preselectedPlanId, plans, onClearPreselect]);

  // Append WebSocket live telemetry snapshots to chart history
  useEffect(() => {
    if (liveTelemetry.length === 0) return;
    const avgCpu = Math.round(
      liveTelemetry.reduce((acc, n) => acc + n.cpuUsagePct, 0) / liveTelemetry.length
    );
    const avgRam = Math.round(
      liveTelemetry.reduce((acc, n) => acc + n.ramUsagePct, 0) / liveTelemetry.length
    );
    const totalNet = liveTelemetry.reduce((acc, n) => acc + n.networkMbps, 0);
    const label = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setTelemetryHistory((prev) => [
      ...prev.slice(-19),
      { time: label, cpu: avgCpu, ram: avgRam, network: totalNet },
    ]);
  }, [liveTelemetry]);

  // Refresh notifications/deployments when realtime WebSocket event arrives
  useEffect(() => {
    if (!lastRealtimeEvent) return;
    if (
      lastRealtimeEvent.type === 'notification:created' ||
      lastRealtimeEvent.type === 'deployment:updated' ||
      lastRealtimeEvent.type === 'backup:completed'
    ) {
      loadAllDashboardData();
    }
  }, [lastRealtimeEvent, loadAllDashboardData]);

  // Load files when fileAccountId or filePath or fileSearch changes
  const fetchFiles = useCallback(async () => {
    if (!fileAccountId) {
      setFiles([]);
      return;
    }
    try {
      const q = fileSearch.trim()
        ? `&q=${encodeURIComponent(fileSearch.trim())}`
        : '';
      const data = await apiFetch<{ files: HostingFile[] }>(
        `/api/files?accountId=${fileAccountId}&path=${encodeURIComponent(filePath)}${q}`
      );
      setFiles(data.files || []);
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  }, [fileAccountId, filePath, fileSearch, onNotify]);

  useEffect(() => {
    if (tab === 'files') {
      fetchFiles();
    }
  }, [tab, fetchFiles]);

  const unreadNotifs = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    const effectiveRegion =
      checkoutRegion === '__custom__'
        ? customCheckoutRegion.trim()
        : checkoutRegion;
    if (effectiveRegion.length < 2) {
      onNotify('Please specify a valid city, country, or cloud region.', 'error');
      return;
    }
    setBusyAction(true);
    try {
      await apiFetch('/api/hosting/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          planId: checkoutPlan.id,
          billingCycle: checkoutCycle,
          environmentLabel: checkoutLabel,
          region: effectiveRegion,
          paymentProvider: checkoutProvider,
          discountCode: checkoutDiscount,
        }),
      });
      try {
        localStorage.setItem(PREFERRED_REGION_STORAGE_KEY, effectiveRegion);
      } catch {
        // Ignore storage errors
      }
      onNotify(`${checkoutPlan.name} activated in ${effectiveRegion}.`);
      setCheckoutPlan(null);
      setCheckoutDiscount('');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePowerAction = async (
    accountId: number,
    action: 'start' | 'stop' | 'restart'
  ) => {
    try {
      const res = await apiFetch(`/api/hosting/accounts/${accountId}/power`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      onNotify(res.message);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleUpgradeSub = async (subId: number, targetPlanId: number) => {
    try {
      await apiFetch(`/api/hosting/subscriptions/${subId}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ planId: targetPlanId }),
      });
      onNotify('Hosting subscription plan updated.');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCancelSub = async (subId: number) => {
    try {
      await apiFetch(`/api/hosting/subscriptions/${subId}/cancel`, {
        method: 'POST',
      });
      onNotify('Subscription cancelled.');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/websites', {
        method: 'POST',
        body: JSON.stringify(siteForm),
      });
      onNotify(`Website ${siteForm.name} provisioned.`);
      setSiteForm((p) => ({ ...p, name: '', primaryDomain: '' }));
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleUpdateWebsite = async (site: Website) => {
    try {
      await apiFetch(`/api/websites/${site.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          runtime: site.runtime,
          documentRoot: site.documentRoot,
          sslEnabled: site.sslEnabled,
          envVarsJson: site.envVarsJson,
          redirectRulesJson: site.redirectRulesJson,
        }),
      });
      onNotify(`Updated settings for ${site.name}.`);
      setEditingWebsite(null);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleDeleteWebsite = async (id: number) => {
    try {
      await apiFetch(`/api/websites/${id}`, { method: 'DELETE' });
      onNotify('Website removed.');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ domain: Domain }>('/api/domains', {
        method: 'POST',
        body: JSON.stringify(domainForm),
      });
      onNotify(`Domain ${res.domain.domainName} added.`);
      setDomainForm((p) => ({ ...p, domainName: '' }));
      setSelectedDomainId(res.domain.id);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleAddDnsRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomainId) return;
    try {
      await apiFetch(`/api/dns/${selectedDomainId}`, {
        method: 'POST',
        body: JSON.stringify(dnsForm),
      });
      onNotify(`${dnsForm.recordType} record added.`);
      setDnsForm((p) => ({ ...p, value: '' }));
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/databases', {
        method: 'POST',
        body: JSON.stringify(dbForm),
      });
      onNotify(`Database ${dbForm.name} created.`);
      setDbForm((p) => ({ ...p, name: '' }));
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateDbUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUserForm.databaseId) return;
    try {
      await apiFetch(`/api/databases/${dbUserForm.databaseId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          username: dbUserForm.username,
          permissions: dbUserForm.permissions,
          ...(dbUserForm.password.trim() ? { password: dbUserForm.password.trim() } : {}),
        }),
      });
      onNotify(`Database user ${dbUserForm.username} added (password encrypted with bcrypt).`);
      setDbUserForm((p) => ({ ...p, username: '', password: '' }));
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleRotateSftp = async (accountId: number) => {
    try {
      const res = await apiFetch<{
        sftpUsername: string;
        maskedCredential: string;
        notice: string;
      }>(`/api/hosting/accounts/${accountId}/rotate-sftp`, {
        method: 'POST',
      });
      setRotatedSftp({ accountId, ...res });
      onNotify('SFTP credential rotated and stored as a salted bcrypt hash.');
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleRotateApiCredential = async () => {
    try {
      const res = await apiFetch<{
        maskedCredential: string;
        notice: string;
      }>('/api/users/me/rotate-api-credential', {
        method: 'POST',
      });
      setRotatedApiKey(res);
      await refreshProfile();
      onNotify('Workspace API credential rotated and stored as a salted bcrypt hash.');
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateFileEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileAccountId || !newFileModal) return;
    try {
      await apiFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({
          hostingAccountId: fileAccountId,
          parentPath: filePath,
          name: newFileName,
          isDirectory: newFileModal === 'folder',
          content: newFileModal === 'file' ? '// Created in MCloud File Manager\n' : '',
        }),
      });
      onNotify(`${newFileModal === 'folder' ? 'Folder' : 'File'} created.`);
      setNewFileModal(null);
      setNewFileName('');
      await fetchFiles();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleUploadTextFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fileAccountId) return;
    if (file.size > 200_000) {
      onNotify('Upload limited to 200 KB text/config files in sandbox mode.', 'error');
      return;
    }
    const text = await file.text();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      await apiFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({
          hostingAccountId: fileAccountId,
          parentPath: filePath,
          name: safeName,
          isDirectory: false,
          content: text,
          mimeType: file.type || 'text/plain',
        }),
      });
      onNotify(`Uploaded ${safeName}.`);
      await fetchFiles();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleSaveFileEdit = async () => {
    if (!activeFile) return;
    try {
      const res = await apiFetch<{ file: HostingFile }>(`/api/files/${activeFile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: editorContent,
          permissions: editorPermissions,
        }),
      });
      setActiveFile(res.file);
      onNotify(`Saved ${res.file.fullPath}.`);
      await fetchFiles();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleDownloadFile = (file: HostingFile) => {
    const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ application: Application }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(appForm),
      });
      onNotify(`Application ${res.application.name} registered.`);
      setAppForm((p) => ({ ...p, name: '', repoUrl: '' }));
      setSelectedAppId(res.application.id);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleDeployApp = async (appId: number) => {
    try {
      await apiFetch(`/api/applications/${appId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ commitMessage: 'Console manual release trigger' }),
      });
      onNotify('Build pipeline completed and marked healthy.');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleRollback = async (appId: number, deploymentId: number) => {
    try {
      await apiFetch(`/api/applications/${appId}/rollback/${deploymentId}`, {
        method: 'POST',
      });
      onNotify(`Rolled back to deployment #${deploymentId}.`);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateBackup = async () => {
    if (!backupTargetKey) {
      onNotify('Select a website, database, or hosting account first.', 'error');
      return;
    }
    const [targetType, idStr, ...nameParts] = backupTargetKey.split(':');
    try {
      await apiFetch('/api/backups', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId: Number(idStr),
          targetName: nameParts.join(':'),
          backupType: 'manual',
        }),
      });
      onNotify('Checksum-verified backup snapshot created.');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleScheduleBackup = async () => {
    if (!backupTargetKey) return;
    const [targetType, idStr, ...nameParts] = backupTargetKey.split(':');
    try {
      await apiFetch('/api/backup-schedules', {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId: Number(idStr),
          targetName: nameParts.join(':'),
          frequency: scheduleFreq,
          retentionDays: 30,
        }),
      });
      onNotify(`Scheduled ${scheduleFreq} backup policy.`);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      });
      onNotify(`Ticket ${res.ticket.ticketNumber} opened.`);
      setTicketForm({
        subject: '',
        category: 'hosting',
        priority: 'medium',
        message: '',
        attachmentName: '',
      });
      setSelectedTicketId(res.ticket.id);
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !ticketReply.trim()) return;
    try {
      await apiFetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: ticketReply }),
      });
      setTicketReply('');
      await loadAllDashboardData();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });
      await refreshProfile();
      onNotify('Account settings saved.');
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      onNotify('New password and confirmation do not match.', 'error');
      return;
    }
    setPasswordBusy(true);
    try {
      await apiFetch('/api/users/me/password', {
        method: 'POST',
        body: JSON.stringify({
          ...(dbUser?.hasPassword ? { currentPassword: passwordForm.currentPassword } : {}),
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await refreshProfile();
      onNotify('Account password encrypted with bcrypt and saved.');
    } catch (err: any) {
      onNotify(err.message, 'error');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await apiFetch('/api/users/me', { method: 'DELETE' });
      await logout();
      onBackToSite();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const navItems: Array<{ id: DashboardTab; label: string; code: string }> = [
    { id: 'overview', label: 'Overview', code: 'OV' },
    { id: 'hosting', label: 'Hosting & Plans', code: 'HS' },
    { id: 'websites', label: 'Websites', code: 'WB' },
    { id: 'domains', label: 'Domains & DNS', code: 'DN' },
    { id: 'databases', label: 'Databases', code: 'DB' },
    { id: 'files', label: 'File Manager', code: 'FM' },
    { id: 'deployments', label: 'App Deployments', code: 'DP' },
    { id: 'monitoring', label: 'Resource Monitor', code: 'MN' },
    { id: 'backups', label: 'Backups', code: 'BK' },
    { id: 'billing', label: 'Billing & Invoices', code: 'BL' },
    { id: 'support', label: 'Support Tickets', code: 'SP' },
    { id: 'settings', label: 'Account Settings', code: 'ST' },
  ];

  const backupTargetOptions = [
    ...websites.map((w) => ({
      key: `website:${w.id}:${w.name}`,
      label: `Website · ${w.name}`,
    })),
    ...databases.map((d) => ({
      key: `database:${d.id}:${d.name}`,
      label: `Database · ${d.name}`,
    })),
    ...accounts.map((a) => ({
      key: `hosting_account:${a.id}:${a.accountCode}`,
      label: `Hosting · ${a.accountCode}`,
    })),
  ];

  const selectedDomain = domains.find((d) => d.id === selectedDomainId) || domains[0];
  const selectedApp = applications.find((a) => a.id === selectedAppId) || applications[0];
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  return (
    <div className="min-h-screen flex bg-[#F1F4F8] text-slate-900 dark:bg-[#0B111E] dark:text-slate-100">
      {/* Sidebar 256px */}
      <aside className="w-64 shrink-0 hidden lg:flex flex-col bg-[#F8FAFC] dark:bg-[#111A2C] border-r border-slate-300/80 dark:border-slate-800">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-300/80 dark:border-slate-800">
          <button
            type="button"
            onClick={onBackToSite}
            className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap"
          >
            <MCloudLogo className="w-7 h-7" />
            <span>MCloud</span>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-blue-700 text-slate-50'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-[#EAEFF5] dark:hover:bg-[#18233A]'
              }`}
            >
              <span
                className={`w-5 text-[10px] font-mono ${
                  tab === item.id ? 'text-sky-200' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {item.code}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-300/80 dark:border-slate-800 space-y-1.5">
          <button
            type="button"
            onClick={onBackToSite}
            className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] rounded-lg transition-colors"
          >
            Back to Public Website
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-6 bg-[#F8FAFC] dark:bg-[#111A2C] border-b border-slate-300/80 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <select
              aria-label="Switch dashboard section"
              value={tab}
              onChange={(e) => setTab(e.target.value as DashboardTab)}
              className="lg:hidden px-2.5 py-1.5 text-sm bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              {navItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              Console /{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {navItems.find((i) => i.id === tab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle Light or Dark theme"
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] rounded-lg transition-colors"
            >
              {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifDrawer((s) => !s)}
                aria-label="Notifications"
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] rounded-lg relative transition-colors"
              >
                <BellIcon className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[10px] font-mono bg-blue-700 text-slate-50 px-1 rounded">
                    {unreadNotifs}
                  </span>
                )}
              </button>

              {showNotifDrawer && (
                <div className="absolute right-0 mt-2 w-80 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300 dark:border-slate-800 rounded-xl p-4 z-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Notifications
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/notifications/read-all', { method: 'POST' });
                        await loadAllDashboardData();
                      }}
                      className="text-xs text-blue-700 dark:text-sky-400 hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-lg border text-xs ${
                            n.isRead
                              ? 'border-slate-200 dark:border-slate-800 text-slate-500'
                              : 'border-blue-300 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30'
                          }`}
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {n.title}
                          </div>
                          <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                            {n.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {dbUser?.displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {dbUser?.role}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 rounded-xl">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">
              Loading MCloud workspace...
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  {subscriptions.length === 0 && (
                    <div className="p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                          Activate Your First MCloud Environment
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          Select the $0 Developer Sandbox or any Cloud/VPS plan to unlock websites, domains, databases, files, and builds.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTab('hosting')}
                        className="px-4 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg whitespace-nowrap"
                      >
                        Choose Hosting Plan
                      </button>
                    </div>
                  )}

                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Hosting Services',
                        value: summary?.totalServices ?? 0,
                        sub: summary?.currentPlan?.name || 'No active plan',
                      },
                      {
                        label: 'Active Websites',
                        value: summary?.activeWebsites ?? 0,
                        sub: `${summary?.totalWebsites ?? 0} total configured`,
                      },
                      {
                        label: 'Registered Domains',
                        value: summary?.registeredDomains ?? 0,
                        sub: `${dnsRecords.length} DNS records`,
                      },
                      {
                        label: 'Managed Databases',
                        value: summary?.databases ?? 0,
                        sub: `${summary?.storageUsedMb ?? 0} MB / ${summary?.allocatedStorageGb ?? 0} GB used`,
                      },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl"
                      >
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {kpi.label}
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1.5">
                          {kpi.value}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                          {kpi.sub}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                      Quick Actions
                    </h2>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTab('hosting')}
                        className="px-3.5 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Activate Hosting Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('websites')}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Create Website
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('domains')}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Connect Domain
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('databases')}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Add Database
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('deployments')}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Deploy Application
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('support')}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Contact Support
                      </button>
                    </div>
                  </div>

                  {/* Two-column activity & invoices */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                        Recent Activity
                      </h2>
                      {recentActivity.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">
                          Actions you perform will appear in your audit trail here.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {recentActivity.slice(0, 6).map((act) => (
                            <div
                              key={act.id}
                              className="py-2.5 flex items-center justify-between text-xs gap-4"
                            >
                              <span className="font-mono text-slate-800 dark:text-slate-200">
                                {act.action}
                              </span>
                              <span className="text-slate-500 tabular-nums shrink-0">
                                {new Date(act.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Recent Invoices
                        </h2>
                        <button
                          type="button"
                          onClick={() => setTab('billing')}
                          className="text-xs text-blue-700 dark:text-sky-400 hover:underline"
                        >
                          View All
                        </button>
                      </div>
                      {invoices.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">
                          No invoices issued yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {invoices.slice(0, 5).map((inv) => (
                            <div
                              key={inv.id}
                              className="py-2.5 flex items-center justify-between text-xs gap-4"
                            >
                              <div>
                                <div className="font-mono font-medium text-slate-900 dark:text-white">
                                  {inv.invoiceNumber}
                                </div>
                                <div className="text-slate-500 truncate max-w-[220px]">
                                  {inv.description}
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums shrink-0">
                                <div className="text-slate-900 dark:text-white">
                                  ${(inv.amountCents / 100).toFixed(2)}
                                </div>
                                <div className="text-emerald-600 dark:text-emerald-400">
                                  {inv.status}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* HOSTING & PLANS TAB */}
              {tab === 'hosting' && (
                <div className="space-y-8">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                        Hosting Environments & Subscriptions
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Manage active hosting environments, VPS power controls, SFTP credentials, and plan tiers.
                      </p>
                    </div>
                  </div>

                  {rotatedSftp && (
                    <div className="p-4 bg-[#EAEFF5] dark:bg-[#0E1626] border border-blue-400 dark:border-blue-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          SFTP Credential Rotated ({rotatedSftp.sftpUsername})
                        </div>
                        <div className="font-mono text-blue-700 dark:text-sky-400">
                          {rotatedSftp.maskedCredential}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {rotatedSftp.notice}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRotatedSftp(null)}
                        className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#F8FAFC] dark:hover:bg-[#111A2C] transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {accounts.length > 0 && (
                    <div className="space-y-4">
                      {accounts.map((acc) => {
                        const sub = subscriptions.find((s) => s.id === acc.subscriptionId);
                        const plan = plans.find((p) => p.id === sub?.planId);
                        return (
                          <div
                            key={acc.id}
                            className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300/80 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                          >
                            <div className="space-y-1.5">
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {acc.accountCode} · {acc.serviceType.toUpperCase()} · {acc.region} ·{' '}
                                <span
                                  className={
                                    acc.status === 'active'
                                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                      : 'text-amber-600 dark:text-amber-400 font-medium'
                                  }
                                >
                                  {acc.status}
                                </span>
                              </div>
                              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {sub?.environmentLabel || acc.hostname}{' '}
                                <span className="text-xs font-normal text-slate-500">
                                  ({plan?.name})
                                </span>
                              </div>
                              <div className="text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                                Host: {acc.hostname} · IP: {acc.ipAddress} · SFTP User: {acc.sftpUsername} ·{' '}
                                {acc.cpuAllocation} vCPU / {acc.ramAllocationGb} GB RAM
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handlePowerAction(acc.id, 'start')}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                              >
                                Start
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePowerAction(acc.id, 'restart')}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                              >
                                Restart
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePowerAction(acc.id, 'stop')}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                              >
                                Stop
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRotateSftp(acc.id)}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                              >
                                Rotate SFTP
                              </button>
                              {sub && sub.status === 'active' && (
                                <select
                                  aria-label="Change plan"
                                  value={sub.planId}
                                  onChange={(e) =>
                                    handleUpgradeSub(sub.id, Number(e.target.value))
                                  }
                                  className="px-2.5 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                                >
                                  {plans.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      Plan: {p.name} (${(p.monthlyPriceCents / 100).toFixed(0)}/mo)
                                    </option>
                                  ))}
                                </select>
                              )}
                              {sub && sub.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelSub(sub.id)}
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Plan Catalog to Provision New Hosting */}
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                      Available Plans (Sandbox Checkout)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {plans.map((plan) => (
                        <div
                          key={plan.id}
                          className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300/80 dark:border-slate-800 rounded-xl flex flex-col justify-between"
                        >
                          <div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {plan.category.toUpperCase()} · {plan.audienceLabel}
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-1">
                              {plan.name}
                            </h3>
                            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                              ${(plan.monthlyPriceCents / 100).toFixed(0)}
                              <span className="text-xs font-normal text-slate-500"> / mo</span>
                            </div>
                            <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-1 font-mono tabular-nums">
                              <div>{plan.cpuCores} vCPU · {plan.ramGb} GB RAM · {plan.storageGb} GB NVMe</div>
                              <div>Up to {plan.maxWebsites} websites · {plan.maxDatabases} DBs · {plan.maxDomains} domains</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCheckoutPlan(plan)}
                            className="mt-5 w-full py-2 px-4 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors"
                          >
                            {plan.monthlyPriceCents === 0 ? 'Activate Free Sandbox' : 'Configure & Activate'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* WEBSITES TAB */}
              {tab === 'websites' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                      Add New Website
                    </h2>
                    {accounts.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        Activate a hosting plan first before adding a website.
                      </div>
                    ) : (
                      <form
                        onSubmit={handleCreateWebsite}
                        className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
                      >
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Environment</label>
                          <select
                            value={siteForm.hostingAccountId}
                            onChange={(e) =>
                              setSiteForm({ ...siteForm, hostingAccountId: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.accountCode} ({a.region})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Site Name</label>
                          <input
                            required
                            value={siteForm.name}
                            onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
                            placeholder="Company Portal"
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Domain</label>
                          <input
                            required
                            value={siteForm.primaryDomain}
                            onChange={(e) =>
                              setSiteForm({ ...siteForm, primaryDomain: e.target.value })
                            }
                            placeholder="portal.example.com"
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Runtime</label>
                          <select
                            value={siteForm.runtime}
                            onChange={(e) =>
                              setSiteForm({
                                ...siteForm,
                                runtime: e.target.value as Website['runtime'],
                              })
                            }
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="nodejs">Node.js</option>
                            <option value="static">Static HTML/SPA</option>
                            <option value="php">PHP 8.3</option>
                            <option value="python">Python 3.12</option>
                            <option value="docker">Docker Container</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                        >
                          Create Website
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-3 px-4 font-medium">Website</th>
                          <th className="py-3 px-4 font-medium">Domain</th>
                          <th className="py-3 px-4 font-medium">Runtime</th>
                          <th className="py-3 px-4 font-medium">Document Root</th>
                          <th className="py-3 px-4 font-medium">SSL</th>
                          <th className="py-3 px-4 font-medium">Uptime</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {websites.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500">
                              No websites configured yet.
                            </td>
                          </tr>
                        ) : (
                          websites.map((w) => (
                            <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                                {w.name}
                              </td>
                              <td className="py-3 px-4 font-mono">{w.primaryDomain}</td>
                              <td className="py-3 px-4 font-mono">{w.runtime}</td>
                              <td className="py-3 px-4 font-mono">{w.documentRoot}</td>
                              <td className="py-3 px-4">
                                <span
                                  className={
                                    w.sslEnabled
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-amber-600'
                                  }
                                >
                                  {w.sslEnabled ? 'TLS Active' : 'Disabled'}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums">{w.uptimePct}%</td>
                              <td className="py-3 px-4 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingWebsite({ ...w })}
                                  className="text-blue-700 dark:text-sky-400 hover:underline"
                                >
                                  Configure
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWebsite(w.id)}
                                  className="text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DOMAINS & DNS TAB */}
              {tab === 'domains' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      Connect, Transfer, or Sandbox-Register Domain
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Sandbox domain registration and DNS zone management. External registrar purchases are not executed without a registrar integration.
                    </p>
                    <form
                      onSubmit={handleCreateDomain}
                      className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                    >
                      <div className="md:col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Domain Name</label>
                        <input
                          required
                          value={domainForm.domainName}
                          onChange={(e) =>
                            setDomainForm({ ...domainForm, domainName: e.target.value })
                          }
                          placeholder="example.com"
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Mode</label>
                        <select
                          value={domainForm.registrationMode}
                          onChange={(e) =>
                            setDomainForm({
                              ...domainForm,
                              registrationMode: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="connected">Connect External Domain</option>
                          <option value="transfer_requested">Request Transfer</option>
                          <option value="sandbox_registered">Sandbox Domain Zone</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Add Domain
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Domains ({domains.length})
                      </h3>
                      {domains.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">
                          No domains added yet.
                        </div>
                      ) : (
                        domains.map((d) => (
                          <div
                            key={d.id}
                            onClick={() => setSelectedDomainId(d.id)}
                            className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between ${
                              selectedDomain?.id === d.id
                                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-mono font-medium text-slate-900 dark:text-white">
                                {d.domainName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {d.status} · SSL {d.sslStatus} · Exp{' '}
                                {new Date(d.expiresAt).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await apiFetch(`/api/domains/${d.id}`, { method: 'DELETE' });
                                await loadAllDashboardData();
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              title="Delete domain"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="lg:col-span-8 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                      {selectedDomain ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                                DNS Zone: {selectedDomain.domainName}
                              </h3>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Nameservers: ns1.mcloud.host, ns2.mcloud.host
                              </div>
                            </div>
                          </div>

                          <form
                            onSubmit={handleAddDnsRecord}
                            className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end"
                          >
                            <div>
                              <label className="block text-[11px] text-slate-500 mb-1">Type</label>
                              <select
                                value={dnsForm.recordType}
                                onChange={(e) =>
                                  setDnsForm({
                                    ...dnsForm,
                                    recordType: e.target.value as DnsRecord['recordType'],
                                  })
                                }
                                className="w-full px-2 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                              >
                                {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map(
                                  (t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-500 mb-1">Host</label>
                              <input
                                required
                                value={dnsForm.host}
                                onChange={(e) => setDnsForm({ ...dnsForm, host: e.target.value })}
                                placeholder="@"
                                className="w-full px-2 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[11px] text-slate-500 mb-1">Value</label>
                              <input
                                required
                                value={dnsForm.value}
                                onChange={(e) => setDnsForm({ ...dnsForm, value: e.target.value })}
                                placeholder="192.0.2.1 or target.example.com"
                                className="w-full px-2 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-500 mb-1">TTL</label>
                              <input
                                type="number"
                                value={dnsForm.ttl}
                                onChange={(e) =>
                                  setDnsForm({ ...dnsForm, ttl: Number(e.target.value) })
                                }
                                className="w-full px-2 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <button
                              type="submit"
                              className="px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                            >
                              Add Record
                            </button>
                          </form>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                                <tr>
                                  <th className="py-2 pr-3">Type</th>
                                  <th className="py-2 pr-3">Host</th>
                                  <th className="py-2 pr-3">Value</th>
                                  <th className="py-2 pr-3">TTL</th>
                                  <th className="py-2 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                {dnsRecords
                                  .filter((r) => r.domainId === selectedDomain.id)
                                  .map((r) => (
                                    <tr key={r.id}>
                                      <td className="py-2 pr-3 font-semibold">{r.recordType}</td>
                                      <td className="py-2 pr-3">{r.host}</td>
                                      <td className="py-2 pr-3 break-all">{r.value}</td>
                                      <td className="py-2 pr-3 tabular-nums">{r.ttl}</td>
                                      <td className="py-2 text-right">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await apiFetch(`/api/dns/record/${r.id}`, {
                                              method: 'DELETE',
                                            });
                                            await loadAllDashboardData();
                                          }}
                                          className="text-red-600 dark:text-red-400 hover:underline font-sans"
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500 py-10 text-center">
                          Select or add a domain to manage its DNS records.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DATABASES TAB */}
              {tab === 'databases' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      Provision Managed Database
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Creates logical tenant database definitions & user permissions in the Cloud SQL PostgreSQL control plane.
                    </p>
                    <form
                      onSubmit={handleCreateDatabase}
                      className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                    >
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Environment</label>
                        <select
                          value={dbForm.hostingAccountId}
                          onChange={(e) =>
                            setDbForm({ ...dbForm, hostingAccountId: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.accountCode}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Database Name</label>
                        <input
                          required
                          value={dbForm.name}
                          onChange={(e) => setDbForm({ ...dbForm, name: e.target.value })}
                          placeholder="app_production"
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Engine</label>
                        <select
                          value={dbForm.engine}
                          onChange={(e) =>
                            setDbForm({
                              ...dbForm,
                              engine: e.target.value as 'postgresql' | 'mysql' | 'mariadb',
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="postgresql">PostgreSQL 16</option>
                          <option value="mysql">MySQL 8.0</option>
                          <option value="mariadb">MariaDB 11.4</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Create Database
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {databases.map((d) => {
                      const usersForDb = dbUsers.filter((u) => u.databaseId === d.id);
                      const revealed = Boolean(revealedDbIds[d.id]);
                      return (
                        <div
                          key={d.id}
                          className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-xs text-slate-500">
                                {d.engine.toUpperCase()} {d.version} · {d.status}
                              </div>
                              <h3 className="text-base font-semibold font-mono text-slate-900 dark:text-white mt-0.5">
                                {d.name}
                              </h3>
                              <div className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                                Storage: {d.storageUsedMb} MB / {d.storageLimitMb} MB
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/databases/${d.id}`, { method: 'DELETE' });
                                await loadAllDashboardData();
                              }}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="p-3 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between gap-2">
                            <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                              {revealed
                                ? `${d.engine}://<user>:<secret>@${d.host}:${d.port}/${d.name}`
                                : `${d.engine}://••••••@${d.host}:${d.port}/${d.name}`}
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedDbIds((p) => ({ ...p, [d.id]: !p[d.id] }))
                              }
                              className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 shrink-0 transition-colors"
                              title="Toggle connection string visibility"
                            >
                              {revealed ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <div>
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Database Users ({usersForDb.length})
                            </div>
                            <div className="space-y-1.5">
                              {usersForDb.map((du) => (
                                <div
                                  key={du.id}
                                  className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-[#EAEFF5] dark:bg-[#0E1626] rounded border border-slate-100 dark:border-slate-800"
                                >
                                  <span className="font-mono">
                                    {du.username} · {du.permissions}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiFetch(`/api/databases/users/${du.id}`, {
                                        method: 'DELETE',
                                      });
                                      await loadAllDashboardData();
                                    }}
                                    className="text-red-600 hover:underline"
                                  >
                                    Revoke
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {databases.length > 0 && (
                    <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-300/80 dark:border-slate-800 rounded-xl">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        Add Database User & Permissions
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Passwords are salted and encrypted with bcrypt before storage. Plaintext credentials are never saved.
                      </p>
                      <form
                        onSubmit={handleCreateDbUser}
                        className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
                      >
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Database</label>
                          <select
                            value={dbUserForm.databaseId}
                            onChange={(e) =>
                              setDbUserForm({ ...dbUserForm, databaseId: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            {databases.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.engine})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Username</label>
                          <input
                            required
                            value={dbUserForm.username}
                            onChange={(e) =>
                              setDbUserForm({ ...dbUserForm, username: e.target.value })
                            }
                            placeholder="svc_writer"
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Password</label>
                          <input
                            type="password"
                            minLength={8}
                            value={dbUserForm.password}
                            onChange={(e) =>
                              setDbUserForm({ ...dbUserForm, password: e.target.value })
                            }
                            placeholder="Min 8 chars (optional)"
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Role</label>
                          <select
                            value={dbUserForm.permissions}
                            onChange={(e) =>
                              setDbUserForm({
                                ...dbUserForm,
                                permissions: e.target.value as any,
                              })
                            }
                            className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="read_write">Read / Write</option>
                            <option value="read_only">Read Only</option>
                            <option value="admin">Database Admin</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg transition-colors"
                        >
                          Grant User
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* FILE MANAGER TAB */}
              {tab === 'files' && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        aria-label="Select hosting account"
                        value={fileAccountId}
                        onChange={(e) => {
                          setFileAccountId(Number(e.target.value));
                          setFilePath('/');
                          setActiveFile(null);
                        }}
                        className="px-3 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountCode} ({a.hostname})
                          </option>
                        ))}
                      </select>

                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <span>Path: {filePath}</span>
                        {filePath !== '/' && (
                          <button
                            type="button"
                            onClick={() => {
                              const parts = filePath.split('/').filter(Boolean);
                              parts.pop();
                              setFilePath('/' + parts.join('/'));
                            }}
                            className="text-blue-700 dark:text-sky-400 hover:underline font-sans"
                          >
                            Up
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                        placeholder="Search files..."
                        className="px-2.5 py-1.5 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setNewFileModal('folder')}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                      >
                        New Folder
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewFileModal('file')}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                      >
                        New File
                      </button>
                      <label className="px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-slate-50 rounded-lg cursor-pointer transition-colors">
                        <span>Upload</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".txt,.html,.css,.js,.ts,.json,.env,.md,.xml,.yml,.yaml"
                          onChange={handleUploadTextFile}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <tr>
                            <th className="py-2.5 px-3">Name</th>
                            <th className="py-2.5 px-3">Perm</th>
                            <th className="py-2.5 px-3">Size</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {files.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-500">
                                Empty directory.
                              </td>
                            </tr>
                          ) : (
                            files.map((f) => (
                              <tr
                                key={f.id}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <td className="py-2.5 px-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (f.isDirectory) {
                                          setFilePath(f.fullPath);
                                          setFileSearch('');
                                        } else {
                                          setActiveFile(f);
                                          setEditorContent(f.content);
                                          setEditorPermissions(f.permissions);
                                        }
                                      }}
                                      className="flex items-center gap-2 font-mono text-slate-900 dark:text-slate-100 hover:underline"
                                    >
                                      {f.isDirectory ? (
                                        <FolderIcon className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                                      ) : (
                                        <FileIcon className="w-3.5 h-3.5 text-slate-500" />
                                      )}
                                      <span>{f.name}</span>
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">{f.permissions}</td>
                                  <td className="py-2.5 px-3 font-mono tabular-nums">
                                    {f.isDirectory ? 'dir' : `${f.sizeBytes} B`}
                                  </td>
                                  <td className="py-2.5 px-3 text-right space-x-2">
                                    {!f.isDirectory && (
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadFile(f)}
                                        title="Download"
                                        className="text-slate-600 dark:text-slate-300 hover:text-blue-700 transition-colors"
                                      >
                                        <DownloadIcon className="w-3.5 h-3.5 inline" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await apiFetch(`/api/files/${f.id}`, { method: 'DELETE' });
                                        if (activeFile?.id === f.id) setActiveFile(null);
                                        await fetchFiles();
                                      }}
                                      className="text-red-600 hover:text-red-700 transition-colors"
                                      title="Delete"
                                    >
                                      <TrashIcon className="w-3.5 h-3.5 inline" />
                                    </button>
                                  </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:col-span-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col">
                      {activeFile ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                            <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white">
                              {activeFile.fullPath}
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                aria-label="Permissions"
                                value={editorPermissions}
                                onChange={(e) => setEditorPermissions(e.target.value)}
                                className="w-16 px-2 py-1 text-xs font-mono bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded"
                              />
                              <button
                                type="button"
                                onClick={handleSaveFileEdit}
                                className="px-3 py-1 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded"
                              >
                                Save File
                              </button>
                            </div>
                          </div>
                          <textarea
                            rows={14}
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            className="mt-3 w-full flex-1 p-3 text-xs font-mono bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </>
                      ) : (
                        <div className="py-16 text-center text-xs text-slate-500">
                          Click any file on the left to inspect, edit code, change permissions, or download.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* APPLICATIONS & DEPLOYMENTS TAB */}
              {tab === 'deployments' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                      Connect Application Repository
                    </h2>
                    <form
                      onSubmit={handleCreateApp}
                      className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
                    >
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Hosting</label>
                        <select
                          value={appForm.hostingAccountId}
                          onChange={(e) =>
                            setAppForm({ ...appForm, hostingAccountId: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.accountCode}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">App Name</label>
                        <input
                          required
                          value={appForm.name}
                          onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                          placeholder="checkout-api"
                          className="w-full px-2.5 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Source</label>
                        <select
                          value={appForm.repoProvider}
                          onChange={(e) =>
                            setAppForm({ ...appForm, repoProvider: e.target.value as any })
                          }
                          className="w-full px-2.5 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="github">GitHub</option>
                          <option value="gitlab">GitLab</option>
                          <option value="archive">Source Archive</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Repository URL</label>
                        <input
                          required
                          value={appForm.repoUrl}
                          onChange={(e) => setAppForm({ ...appForm, repoUrl: e.target.value })}
                          placeholder="https://github.com/org/checkout-api"
                          className="w-full px-2.5 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Register App
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-5 space-y-3">
                      {applications.length === 0 ? (
                        <div className="p-6 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 text-center">
                          No applications registered yet.
                        </div>
                      ) : (
                        applications.map((a) => (
                          <div
                            key={a.id}
                            onClick={() => setSelectedAppId(a.id)}
                            className={`p-4 bg-[#F8FAFC] dark:bg-[#111A2C] border rounded-xl cursor-pointer ${
                              selectedApp?.id === a.id
                                ? 'border-blue-600'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {a.name}
                                </div>
                                <div className="text-xs font-mono text-slate-500 mt-0.5">
                                  {a.repoProvider} · {a.branch} · {a.status}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeployApp(a.id);
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                              >
                                Deploy Now
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="lg:col-span-7 p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                      {selectedApp ? (
                        <>
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Deployment History: {selectedApp.name}
                              </h3>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">
                                Build: {selectedApp.buildCommand} · Start: {selectedApp.startCommand}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {deployments
                              .filter((d) => d.applicationId === selectedApp.id)
                              .map((dep) => (
                                <div
                                  key={dep.id}
                                  className="p-3 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 rounded-lg space-y-2"
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="font-mono">
                                      <span className="font-semibold text-slate-900 dark:text-white">
                                        {dep.commitHash}
                                      </span>{' '}
                                      · {dep.commitMessage} ·{' '}
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        {dep.status}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRollback(selectedApp.id, dep.id)}
                                      className="text-blue-700 dark:text-sky-400 hover:underline"
                                    >
                                      Rollback
                                    </button>
                                  </div>
                                  <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                                    {dep.logsText}
                                  </pre>
                                </div>
                              ))}
                          </div>
                        </>
                      ) : (
                        <div className="py-12 text-center text-xs text-slate-500">
                          Select an application to inspect build logs and rollback history.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MONITORING TAB */}
              {tab === 'monitoring' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                          Real-Time Node Telemetry
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Streamed over authenticated WebSocket (/ws/telemetry) every 5 seconds.
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 text-xs font-mono">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            wsConnected ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        <span>{wsConnected ? 'Live stream connected' : 'Connecting stream...'}</span>
                      </div>
                    </div>

                    <div className="h-72">
                      {telemetryHistory.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                          Awaiting initial WebSocket telemetry sample...
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={telemetryHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area
                              type="monotone"
                              dataKey="cpu"
                              name="Avg CPU %"
                              stroke="#1D4ED8"
                              fill="#1D4ED8"
                              fillOpacity={0.15}
                            />
                            <Area
                              type="monotone"
                              dataKey="ram"
                              name="Avg Memory %"
                              stroke="#0284C7"
                              fill="#0284C7"
                              fillOpacity={0.12}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {liveTelemetry.map((node) => (
                      <div
                        key={node.id}
                        className="p-4 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2"
                      >
                        <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate">
                          {node.hostname}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {node.region} · {node.status}
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono tabular-nums space-y-1">
                          <div className="flex justify-between">
                            <span>CPU</span>
                            <span>{node.cpuUsagePct}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>RAM</span>
                            <span>{node.ramUsagePct}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Network</span>
                            <span>{node.networkMbps} Mbps</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BACKUPS TAB */}
              {tab === 'backups' && (
                <div className="space-y-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Create & Schedule Integrity-Verified Backups
                    </h2>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[240px]">
                        <label className="block text-xs text-slate-500 mb-1">Target Resource</label>
                        <select
                          value={backupTargetKey}
                          onChange={(e) => setBackupTargetKey(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="">Select website, database, or hosting...</option>
                          {backupTargetOptions.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateBackup}
                        className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Run Manual Backup
                      </button>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Schedule</label>
                        <select
                          value={scheduleFreq}
                          onChange={(e) => setScheduleFreq(e.target.value as any)}
                          className="px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="daily">Daily (30d retention)</option>
                          <option value="weekly">Weekly (30d retention)</option>
                          <option value="monthly">Monthly (30d retention)</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleScheduleBackup}
                        className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        Add Schedule
                      </button>
                    </div>
                  </div>

                  {backupSchedules.length > 0 && (
                    <div className="p-4 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                        Active Backup Schedules
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {backupSchedules.map((sc) => (
                          <div
                            key={sc.id}
                            className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white">
                                {sc.targetName}
                              </div>
                              <div className="text-slate-500">
                                {sc.frequency} · {sc.retentionDays}d retention
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/backup-schedules/${sc.id}`, {
                                  method: 'DELETE',
                                });
                                await loadAllDashboardData();
                              }}
                              className="text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <tr>
                          <th className="py-3 px-4">Target</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 px-4">SHA-256 Checksum</th>
                          <th className="py-3 px-4">Verified</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {backups.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500">
                              No backup snapshots created yet.
                            </td>
                          </tr>
                        ) : (
                          backups.map((b) => (
                            <tr key={b.id}>
                              <td className="py-3 px-4 font-medium">{b.targetName}</td>
                              <td className="py-3 px-4">{b.backupType}</td>
                              <td className="py-3 px-4 font-mono tabular-nums">{b.sizeMb} MB</td>
                              <td className="py-3 px-4 font-mono">
                                {b.checksumSha256.slice(0, 16)}...
                              </td>
                              <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                                {b.integrityVerified ? 'Verified' : 'Pending'}
                              </td>
                              <td className="py-3 px-4 text-right space-x-3">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/backups/${b.id}/restore`, {
                                      method: 'POST',
                                    });
                                    onNotify(`Restored snapshot for ${b.targetName}.`);
                                    await loadAllDashboardData();
                                  }}
                                  className="text-blue-700 dark:text-sky-400 hover:underline"
                                >
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/backups/${b.id}`, {
                                      method: 'DELETE',
                                    });
                                    await loadAllDashboardData();
                                  }}
                                  className="text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* BILLING TAB */}
              {tab === 'billing' && (
                <div className="bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                        Invoices & Sandbox Payment History
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Raw card numbers are never collected or stored. Invoices reflect sandbox checkout activity.
                      </p>
                    </div>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Invoice</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Provider</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No billing history yet.
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="py-3 px-4 font-mono font-medium">{inv.invoiceNumber}</td>
                            <td className="py-3 px-4">{inv.description}</td>
                            <td className="py-3 px-4 font-mono">{inv.paymentProvider}</td>
                            <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                              {inv.status}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums">
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                              ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SUPPORT TAB */}
              {tab === 'support' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 space-y-5">
                    <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                        Open Support Ticket
                      </h2>
                      <form onSubmit={handleCreateTicket} className="space-y-3">
                        <input
                          required
                          value={ticketForm.subject}
                          onChange={(e) =>
                            setTicketForm({ ...ticketForm, subject: e.target.value })
                          }
                          placeholder="Subject"
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={ticketForm.category}
                            onChange={(e) =>
                              setTicketForm({ ...ticketForm, category: e.target.value as any })
                            }
                            className="px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="hosting">Hosting</option>
                            <option value="domains">Domains & DNS</option>
                            <option value="databases">Databases</option>
                            <option value="deployments">Deployments</option>
                            <option value="billing">Billing</option>
                            <option value="security">Security</option>
                          </select>
                          <select
                            value={ticketForm.priority}
                            onChange={(e) =>
                              setTicketForm({ ...ticketForm, priority: e.target.value as any })
                            }
                            className="px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                        <input
                          value={ticketForm.attachmentName}
                          onChange={(e) =>
                            setTicketForm({ ...ticketForm, attachmentName: e.target.value })
                          }
                          placeholder="Optional attachment filename (e.g., error-log.txt)"
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <textarea
                          required
                          minLength={10}
                          rows={3}
                          value={ticketForm.message}
                          onChange={(e) =>
                            setTicketForm({ ...ticketForm, message: e.target.value })
                          }
                          placeholder="Describe your issue..."
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <button
                          type="submit"
                          className="w-full py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                        >
                          Submit Ticket
                        </button>
                      </form>
                    </div>

                    <div className="p-4 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase">
                        Your Tickets ({tickets.length})
                      </h3>
                      {tickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTicketId(t.id)}
                          className={`w-full text-left p-3 rounded-lg border text-xs ${
                            selectedTicket?.id === t.id
                              ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {t.subject}
                          </div>
                          <div className="text-slate-500 mt-0.5 font-mono">
                            {t.ticketNumber} · {t.status} · {t.priority}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between">
                    {selectedTicket ? (
                      <>
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {selectedTicket.subject}
                              </h3>
                              <div className="text-xs text-slate-500">
                                {selectedTicket.ticketNumber} · Assigned: {selectedTicket.assignedAgentName} · Status: {selectedTicket.status}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const next =
                                  selectedTicket.status === 'closed' ? 'open' : 'closed';
                                await apiFetch(`/api/support/tickets/${selectedTicket.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: next }),
                                });
                                await loadAllDashboardData();
                              }}
                              className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
                            >
                              {selectedTicket.status === 'closed' ? 'Reopen' : 'Close Ticket'}
                            </button>
                          </div>

                          <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                            {ticketMessages
                              .filter((m) => m.ticketId === selectedTicket.id)
                              .map((m) => (
                                <div
                                  key={m.id}
                                  className="p-3 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                                >
                                  <div className="flex justify-between text-slate-500 mb-1">
                                    <span className="font-semibold text-slate-900 dark:text-white">
                                      {m.senderName} ({m.senderRole})
                                    </span>
                                    <span className="tabular-nums">
                                      {new Date(m.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {m.body}
                                  </p>
                                  {m.attachmentName && (
                                    <div className="mt-1.5 font-mono text-[11px] text-blue-700 dark:text-sky-400">
                                      Attachment: {m.attachmentName}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>

                        <form onSubmit={handleSendTicketReply} className="flex gap-2">
                          <input
                            value={ticketReply}
                            onChange={(e) => setTicketReply(e.target.value)}
                            placeholder="Write a reply..."
                            className="flex-1 px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                          >
                            Send
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="py-16 text-center text-xs text-slate-500">
                        Open or select a support ticket to view conversation history.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SETTINGS & SESSIONS TAB */}
              {tab === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Profile & Security Preferences
                    </h2>
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Display Name</label>
                        <input
                          required
                          value={profileForm.displayName}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, displayName: e.target.value })
                          }
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Workspace / Organization
                        </label>
                        <input
                          required
                          value={profileForm.organizationName}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, organizationName: e.target.value })
                          }
                          className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={profileForm.twoFactorEnabled}
                          onChange={(e) =>
                            setProfileForm({
                              ...profileForm,
                              twoFactorEnabled: e.target.checked,
                            })
                          }
                        />
                        <span>Require additional 2FA verification flag on sensitive actions</span>
                      </label>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                      >
                        Save Profile
                      </button>
                    </form>

                    <div className="pt-5 border-t border-slate-300/80 dark:border-slate-800 space-y-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          Account Password (bcrypt)
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {dbUser?.hasPassword
                            ? 'Password login is active and stored as a salted bcrypt hash (cost factor 12).'
                            : 'No password configured yet. Set one to enable direct email and password sign-in.'}
                        </p>
                      </div>
                      <form onSubmit={handleUpdatePassword} className="space-y-3">
                        {dbUser?.hasPassword && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              Current Password
                            </label>
                            <input
                              required
                              type="password"
                              autoComplete="current-password"
                              value={passwordForm.currentPassword}
                              onChange={(e) =>
                                setPasswordForm({
                                  ...passwordForm,
                                  currentPassword: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              New Password
                            </label>
                            <input
                              required
                              type="password"
                              minLength={8}
                              autoComplete="new-password"
                              value={passwordForm.newPassword}
                              onChange={(e) =>
                                setPasswordForm({
                                  ...passwordForm,
                                  newPassword: e.target.value,
                                })
                              }
                              placeholder="Min 8 chars, letter + number"
                              className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              Confirm Password
                            </label>
                            <input
                              required
                              type="password"
                              minLength={8}
                              autoComplete="new-password"
                              value={passwordForm.confirmPassword}
                              onChange={(e) =>
                                setPasswordForm({
                                  ...passwordForm,
                                  confirmPassword: e.target.value,
                                })
                              }
                              placeholder="Repeat new password"
                              className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={passwordBusy}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-lg"
                        >
                          {passwordBusy
                            ? 'Encrypting...'
                            : dbUser?.hasPassword
                              ? 'Update Password'
                              : 'Set Account Password'}
                        </button>
                      </form>
                    </div>

                    <div className="pt-5 border-t border-slate-300/80 dark:border-slate-800 space-y-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          Workspace API Credential
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Status: {dbUser?.hasApiCredential ? 'Active bcrypt hash persisted' : 'Not yet issued'}. Rotating generates a new key on the server and persists only its salted bcrypt hash without exposing raw secrets.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRotateApiCredential}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-[#EAEFF5] dark:hover:bg-[#18233A] transition-colors"
                      >
                        Rotate API Credential
                      </button>
                      {rotatedApiKey && (
                        <div className="p-3 bg-[#EAEFF5] dark:bg-[#0E1626] border border-blue-400 dark:border-blue-800 rounded-lg space-y-1 text-xs">
                          <div className="font-mono text-blue-700 dark:text-sky-400">
                            {rotatedApiKey.maskedCredential}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {rotatedApiKey.notice}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-5 border-t border-slate-300/80 dark:border-slate-800">
                      <h3 className="text-xs font-semibold text-red-600 dark:text-red-400">
                        Account Deletion
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Permanently removes your MCloud profile and all tenant resources.
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOpen(true)}
                        className="mt-3 px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg"
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>

                  <div className="p-5 bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Active Device Sessions ({sessions.length})
                    </h2>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sessions.map((s) => (
                        <div
                          key={s.id}
                          className="py-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">
                              {s.deviceLabel}
                            </div>
                            <div className="text-slate-500 font-mono">
                              {s.ipAddress} · {s.revoked ? 'Revoked' : 'Active'}
                            </div>
                          </div>
                          {!s.revoked && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/users/sessions/${s.id}/revoke`, {
                                  method: 'POST',
                                });
                                await refreshProfile();
                              }}
                              className="text-red-600 hover:underline"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Sandbox Checkout Modal */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Activate {checkoutPlan.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sandbox checkout with no live charges or raw card storage.
            </p>
            <form onSubmit={handleCheckoutSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Environment Name</label>
                <input
                  required
                  value={checkoutLabel}
                  onChange={(e) => setCheckoutLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Billing Cycle</label>
                  <select
                    value={checkoutCycle}
                    onChange={(e) => setCheckoutCycle(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="monthly">
                      Monthly (${(checkoutPlan.monthlyPriceCents / 100).toFixed(0)}/mo)
                    </option>
                    <option value="annual">
                      Annual (${(checkoutPlan.annualPriceCents / 100).toFixed(0)}/yr)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Region (Worldwide)
                  </label>
                  <select
                    value={checkoutRegion}
                    onChange={(e) => setCheckoutRegion(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    {GLOBAL_REGION_GROUPS.map((group) => (
                      <optgroup key={group.continent} label={group.continent}>
                        {group.regions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Custom Global Location">
                      <option value="__custom__">
                        Other / Enter any city or country worldwide...
                      </option>
                    </optgroup>
                  </select>
                </div>
              </div>
              {checkoutRegion === '__custom__' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Custom Global City, Country, or Region
                  </label>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={customCheckoutRegion}
                    onChange={(e) => setCustomCheckoutRegion(e.target.value)}
                    placeholder="e.g., Buenos Aires, Argentina or Seoul, South Korea"
                    className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Sandbox Gateway</label>
                  <select
                    value={checkoutProvider}
                    onChange={(e) => setCheckoutProvider(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="sandbox_stripe">Stripe Sandbox</option>
                    <option value="sandbox_paypal">PayPal Sandbox</option>
                    <option value="sandbox_mpesa">M-Pesa Sandbox</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Discount Code (MCLOUD20)
                  </label>
                  <input
                    value={checkoutDiscount}
                    onChange={(e) => setCheckoutDiscount(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCheckoutPlan(null)}
                  className="px-4 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg"
                >
                  {busyAction ? 'Provisioning...' : 'Confirm & Provision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Website Edit Modal */}
      {editingWebsite && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Configure {editingWebsite.name}
            </h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Runtime</label>
                <select
                  value={editingWebsite.runtime}
                  onChange={(e) =>
                    setEditingWebsite({
                      ...editingWebsite,
                      runtime: e.target.value as Website['runtime'],
                    })
                  }
                  className="w-full px-3 py-2 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="nodejs">Node.js</option>
                  <option value="static">Static</option>
                  <option value="php">PHP</option>
                  <option value="python">Python</option>
                  <option value="docker">Docker</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Document Root</label>
                <input
                  value={editingWebsite.documentRoot}
                  onChange={(e) =>
                    setEditingWebsite({ ...editingWebsite, documentRoot: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingWebsite.sslEnabled}
                  onChange={(e) =>
                    setEditingWebsite({ ...editingWebsite, sslEnabled: e.target.checked })
                  }
                />
                <span>Enable SSL/TLS Certificate</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingWebsite(null)}
                className="px-4 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUpdateWebsite(editingWebsite)}
                className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New File / Folder Modal */}
      {newFileModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFileEntry}
            className="w-full max-w-sm bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Create {newFileModal === 'folder' ? 'Folder' : 'File'} in {filePath}
            </h3>
            <input
              required
              autoFocus
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={newFileModal === 'folder' ? 'assets' : 'config.json'}
              className="w-full px-3 py-2 text-xs bg-[#EAEFF5] dark:bg-[#0E1626] border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileModal(null)}
                className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Account Delete Modal */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#F8FAFC] dark:bg-[#111A2C] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Confirm Account Deletion
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This will delete your MCloud account, hosting accounts, websites, domains, databases, and files. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-4 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
