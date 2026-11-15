import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import helmet from 'helmet';
import { WebSocketServer, WebSocket } from 'ws';
import { publicRouter } from './src/routes/public.ts';
import { authRouter } from './src/routes/auth.ts';
import { accountRouter } from './src/routes/account.ts';
import { hostingRouter } from './src/routes/hosting.ts';
import { resourcesRouter } from './src/routes/resources.ts';
import { deploymentsRouter } from './src/routes/deployments.ts';
import { registerWsBroadcaster } from './src/services/infrastructure.ts';
import { parseCookieToken, verifySessionToken } from './src/services/session-token.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { getOrCreateUser } from './src/db/seed.ts';
import { db } from './src/db/index.ts';
import { hostingNodes, userSessions, users } from './src/db/schema.ts';
import { and, eq } from 'drizzle-orm';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '2mb' }));

  // Lightweight per-IP rate limiting for API routes
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.use('/api', (req, res, next) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > 240) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/public', publicRouter);
  app.use('/api', authRouter);
  app.use('/api', accountRouter);
  app.use('/api', hostingRouter);
  app.use('/api', resourcesRouter);
  app.use('/api', deploymentsRouter);

  const server = http.createServer(app);

  // Authenticated WebSocket server on port 3000 (/ws/telemetry)
  const wss = new WebSocketServer({ server, path: '/ws/telemetry' });
  const wsClients = new Map<WebSocket, { userId: number; role: string }>();

  async function authenticateWsToken(token: string) {
    const sessionPayload = verifySessionToken(token);
    if (sessionPayload) {
      const [found] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, sessionPayload.userId), eq(users.uid, sessionPayload.sub)))
        .limit(1);
      const [sessionRow] = found
        ? await db
            .select()
            .from(userSessions)
            .where(
              and(
                eq(userSessions.id, sessionPayload.sessionId),
                eq(userSessions.userId, found.id)
              )
            )
            .limit(1)
        : [null];
      if (!found || !sessionRow || sessionRow.revoked) {
        return null;
      }
      return found;
    }

    const decoded = await adminAuth.verifyIdToken(token);
    return getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@mcloud.local`,
      decoded.name,
      Boolean(decoded.email_verified)
    );
  }

  wss.on('connection', async (ws, req) => {
    let authenticated = false;
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]
        : null;
    const cookieToken = parseCookieToken(req.headers.cookie);
    const initialToken = headerToken || cookieToken;

    const finalizeAuth = async (token: string) => {
      try {
        const dbUser = await authenticateWsToken(token);
        if (!dbUser) {
          ws.close(4003, 'Session revoked or invalid');
          return;
        }
        authenticated = true;
        wsClients.set(ws, { userId: dbUser.id, role: dbUser.role });
        ws.send(
          JSON.stringify({
            type: 'ws:connected',
            payload: { userId: dbUser.id, timestamp: new Date().toISOString() },
          })
        );
      } catch {
        ws.close(4003, 'Invalid auth token');
      }
    };

    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 5000);

    ws.on('close', () => {
      clearTimeout(authTimeout);
      wsClients.delete(ws);
    });

    if (initialToken) {
      clearTimeout(authTimeout);
      await finalizeAuth(initialToken);
      return;
    }

    ws.once('message', async (raw) => {
      if (authenticated) return;
      try {
        const parsed = JSON.parse(raw.toString('utf8'));
        if (parsed?.type === 'auth' && typeof parsed.token === 'string' && parsed.token) {
          clearTimeout(authTimeout);
          await finalizeAuth(parsed.token);
          return;
        }
      } catch {
        // Fall through to close
      }
      clearTimeout(authTimeout);
      ws.close(4001, 'Missing auth handshake');
    });
  });

  registerWsBroadcaster((event) => {
    const msg = JSON.stringify(event);
    for (const [client, meta] of wsClients.entries()) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (!event.userId || event.userId === meta.userId) {
        client.send(msg);
      }
    }
  });

  // Periodic telemetry stream only when clients are connected
  setInterval(async () => {
    if (wsClients.size === 0) return;
    try {
      const nodes = await db.select().from(hostingNodes);
      const telemetryPayload = nodes.map((n) => ({
        id: n.id,
        hostname: n.hostname,
        region: n.region,
        status: n.status,
        cpuUsagePct: Math.min(92, Math.max(8, n.cpuUsagePct + Math.round((Math.random() - 0.5) * 6))),
        ramUsagePct: Math.min(94, Math.max(15, n.ramUsagePct + Math.round((Math.random() - 0.5) * 4))),
        networkMbps: Math.max(40, n.networkMbps + Math.round((Math.random() - 0.5) * 50)),
        timestamp: new Date().toISOString(),
      }));

      const msg = JSON.stringify({ type: 'node:telemetry', payload: telemetryPayload });
      for (const [client] of wsClients.entries()) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    } catch {
      // Skip cycle if transient query issue occurs
    }
  }, 5000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MCloud server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
