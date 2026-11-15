export function maskIpAddress(ip: string | null | undefined): string {
  if (!ip) return 'Masked';
  const trimmed = ip.trim();
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.***.***.${parts[3]}`;
    }
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}:****:${parts[parts.length - 1]}`;
    }
  }
  return 'Masked';
}

export function sanitizeUser<
  T extends {
    id: number;
    uid?: string;
    email: string;
    displayName: string;
    role: string;
    organizationName: string;
    twoFactorEnabled: boolean;
    emailVerified: boolean;
    passwordHash?: string;
    apiCredentialHash?: string;
    createdAt: Date | string;
    updatedAt?: Date | string;
  },
>(u: T) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    organizationName: u.organizationName,
    twoFactorEnabled: u.twoFactorEnabled,
    emailVerified: u.emailVerified,
    hasPassword: Boolean(u.passwordHash),
    hasApiCredential: Boolean(u.apiCredentialHash),
    createdAt: u.createdAt,
  };
}

export function sanitizeSession<
  T extends {
    id: number;
    deviceLabel: string;
    ipAddress: string;
    userAgent?: string;
    revoked: boolean;
    lastActiveAt: Date | string;
    createdAt: Date | string;
  },
>(s: T) {
  return {
    id: s.id,
    deviceLabel: s.deviceLabel,
    ipAddress: maskIpAddress(s.ipAddress),
    revoked: s.revoked,
    lastActiveAt: s.lastActiveAt,
    createdAt: s.createdAt,
  };
}

export function sanitizeAccount<
  T extends {
    sftpCredentialHash?: string;
    ipAddress?: string;
  },
>(acc: T) {
  const { sftpCredentialHash: _hash, ipAddress, ...rest } = acc;
  return {
    ...rest,
    ipAddress: maskIpAddress(ipAddress),
  };
}

export function sanitizeAuditLog<
  T extends {
    id: number;
    action: string;
    resourceType: string;
    resourceId: string;
    createdAt: Date | string;
  },
>(log: T) {
  return {
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    createdAt: log.createdAt,
  };
}

export function sanitizeDomain<
  T extends {
    registrarAdapter?: string;
    userId?: number;
  },
>(domain: T) {
  const { registrarAdapter: _adapter, userId: _userId, ...rest } = domain;
  return rest;
}

export function sanitizeDatabase<
  T extends {
    adapterNotice?: string;
    userId?: number;
  },
>(database: T) {
  const { adapterNotice: _notice, userId: _userId, ...rest } = database;
  return rest;
}

export function sanitizeBackup<
  T extends {
    storageAdapter?: string;
    userId?: number;
  },
>(backup: T) {
  const { storageAdapter: _adapter, userId: _userId, ...rest } = backup;
  return rest;
}

