import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface SessionTokenPayload {
  sub: string;
  userId: number;
  sessionId: number;
  iat: number;
  exp: number;
}

export const SESSION_COOKIE_NAME = 'mcloud_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SECRET_FILE_PATH = path.resolve(process.cwd(), '.mcloud-session.secret');

export function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === SESSION_COOKIE_NAME) {
      const val = pair.slice(idx + 1).trim();
      return val ? decodeURIComponent(val) : null;
    }
  }
  return null;
}

let cachedSigningKey: Buffer | null = null;

function getSigningKey(): Buffer {
  if (cachedSigningKey) return cachedSigningKey;

  const envSecret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.MCLOUD_SESSION_SECRET?.trim();

  if (envSecret && envSecret.length >= 32) {
    cachedSigningKey = crypto.createHash('sha256').update(envSecret).digest();
    return cachedSigningKey;
  }

  let fileSecret = '';
  try {
    if (fs.existsSync(SECRET_FILE_PATH)) {
      fileSecret = fs.readFileSync(SECRET_FILE_PATH, 'utf8').trim();
    }
  } catch {
    fileSecret = '';
  }

  if (!fileSecret || fileSecret.length < 32) {
    fileSecret = crypto.randomBytes(48).toString('hex');
    try {
      fs.writeFileSync(SECRET_FILE_PATH, `${fileSecret}\n`, { mode: 0o600 });
    } catch {
      // Ephemeral in-memory secret if filesystem is read-only
    }
  }

  cachedSigningKey = crypto.createHash('sha256').update(fileSecret).digest();
  return cachedSigningKey;
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function signSessionToken(params: {
  uid: string;
  userId: number;
  sessionId: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'MCLOUD' }));
  const payload: SessionTokenPayload = {
    sub: params.uid,
    userId: params.userId,
    sessionId: params.sessionId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${toBase64Url(signature)}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sigB64] = parts;
    const headerObj = JSON.parse(fromBase64Url(header).toString('utf8'));
    if (headerObj?.typ !== 'MCLOUD' || headerObj?.alg !== 'HS256') {
      return null;
    }

    const expectedSig = crypto
      .createHmac('sha256', getSigningKey())
      .update(`${header}.${body}`)
      .digest();
    const providedSig = fromBase64Url(sigB64);

    if (expectedSig.length !== providedSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;

    const payload = JSON.parse(fromBase64Url(body).toString('utf8')) as SessionTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.userId || !payload.exp || payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
