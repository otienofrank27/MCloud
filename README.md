<div align="center">

# MCloud

**Your Infrastructure. Your Control. Your Cloud.**

Full-Stack Cloud Hosting, Infrastructure Control Plane & Worldwide Deployment Platform

`React 19` | `TypeScript` | `Express` | `Cloud SQL PostgreSQL` | `Drizzle ORM` | `WebSockets` | `Bcrypt Auth`

</div>

---

## Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Security & Password Hashing](#security--password-hashing)
- [Worldwide Region Coverage](#worldwide-region-coverage)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Development Adapters](#development-adapters)

---

## Overview

MCloud is a full-stack cloud hosting and infrastructure management platform built on Node.js, Express, React, TypeScript, and Cloud SQL for PostgreSQL. It pairs a multi-page public storefront with a tenant-isolated Customer Control Plane for provisioning hosting plans, managing websites and runtimes, configuring DNS zones, administering databases, editing scoped files, deploying applications, streaming live resource telemetry, and maintaining checksum-verified backups.

---

## Core Capabilities

| Domain | Capabilities |
| :--- | :--- |
| **Public Website** | Product pages (Cloud, Web, VPS, Dedicated, Application Hosting), billing-cycle pricing tiers, platform architecture overview, live OpenAPI explorer, FAQ, Privacy Policy, and PostgreSQL-persisted contact form. |
| **Authentication & Sessions** | Email + password registration and login with `bcryptjs` encryption (cost factor `12`), Google Sign-In via Firebase Auth, HMAC-SHA256 signed session tokens, active device session inventory, and instant session revocation. |
| **Hosting & Provisioning** | Sandbox checkout (`Stripe`, `PayPal`, `M-Pesa` test gateways + `MCLOUD20` / `SANDBOX100` codes), plan upgrades and cancellations, VPS power controls (`start`, `stop`, `restart`), and one-time SFTP credential rotation. |
| **Websites & Runtimes** | Multi-runtime site provisioning (`Static`, `Node.js`, `PHP`, `Python`, `Docker`), custom document roots, SSL status management, environment variable storage, and HTTP redirect rules. |
| **Domains & DNS** | Domain connection, transfer requests, sandbox registration, authoritative nameservers, and full DNS zone editing (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SRV`, `CAA`). |
| **Managed Databases** | Logical `PostgreSQL`, `MySQL`, and `MariaDB` database allocation, masked connection strings, and scoped database users (`read_write`, `read_only`, `admin`) with bcrypt-encrypted passwords. |
| **File Manager** | Directory browsing, search, file/folder creation, inline code editing, `chmod` permission updates, and strict path-segment traversal protection scoped to each hosting root. |
| **Deployments & Telemetry** | Git (`GitHub`, `GitLab`) and archive deployment records with build logs and one-click rollbacks, paired with live WebSocket CPU, RAM, and network Mbps telemetry charts. |
| **Backups, Billing & Support** | Manual and scheduled (`daily`, `weekly`, `monthly`) snapshots with SHA-256 digest verification, invoice tracking, account password updates, API credential rotation, and support ticketing. |

---

## Architecture

```text
+-------------------------------------------------------------------+
|                        Browser Client (SPA)                       |
|  React 19 + Tailwind CSS v4 + Recharts + Custom SVG Icons        |
|  AuthContext (HttpOnly Cookie Session / Firebase ID Token + WS) |
+---------------------------------+---------------------------------+
                                  | HTTPS REST (/api/*) & WS (/ws/telemetry)
                                  v
+-------------------------------------------------------------------+
|                Express Server & Control Plane (Port 3000)         |
|  Helmet Headers | Per-IP Rate Limiter | requireAuth Middleware    |
|  Routes: public | auth | account | hosting | resources | deploys  |
+---------------------------------+---------------------------------+
                                  |
          +-----------------------+-----------------------+
          v                                               v
+-------------------------------+       +---------------------------+
|   Security & Adapter Layer    |       |  Cloud SQL PostgreSQL     |
|  - bcryptjs (Cost 12 Hashing) |       |  - 23 Drizzle ORM Tables  |
|  - HMAC-SHA256 Session Tokens |       |  - europe-west1 Pool (pg) |
|  - Infrastructure Adapters    |       |  - Immutable Audit Logs   |
+-------------------------------+       +---------------------------+
```

---

## Security & Password Hashing

MCloud enforces tenant isolation and cryptographic credential protection across every authentication and infrastructure boundary:

- **Account Password Encryption (`src/services/password.ts`)**: Passwords submitted during registration (`POST /api/auth/register`), login (`POST /api/auth/login`), and password updates (`POST /api/users/me/password`) are validated for strength (8 to 128 characters, requiring a letter plus a number or symbol) and encrypted using `bcryptjs` with `BCRYPT_SALT_ROUNDS = 12`. Login verification executes a timing-equalized dummy check for unknown accounts and transparently upgrades older cost factors via `needsRehash`.
- **No Exposed API or Secret Keys**: Database user passwords, SFTP credentials, and workspace API keys are hashed with salted `bcryptjs` prior to storage, and rotation endpoints return masked confirmations only. Server HMAC signing keys come from `SESSION_SECRET` or a server-only `0600` secret file (`.mcloud-session.secret`), never from client-side configuration.
- **HttpOnly Cookie & Revocable Signed Sessions (`src/services/session-token.ts`)**: Password logins issue HMAC-SHA256 signed tokens stored in `HttpOnly; SameSite=Lax` cookies (`mcloud_session`) rather than `localStorage` or JSON bodies, tied to `user_sessions.id` and verified with `crypto.timingSafeEqual`. Revoking a session or calling `POST /api/auth/logout` clears the cookie and immediately invalidates the session across both REST and WebSocket endpoints.
- **Sanitized API Payloads (`src/services/sanitize.ts`)**: Internal identifiers (`uid`), credential hashes (`passwordHash`, `apiCredentialHash`, `sftpCredentialHash`), raw `userAgent` strings, audit actor/metadata details, and full IP addresses are stripped or masked before reaching the frontend, and internal server error messages are replaced with generic client responses.
- **Transport & Filesystem Guards**: Helmet security headers, API rate limiting (`240 req/min/IP`), Zod request validation, ownership verification by authenticated `user_id`, and strict directory-traversal checks inside the File Manager.

---

## Gemini API Key Handling

- Keep `GEMINI_API_KEY` only in the server runtime environment (for example, a deployment platform's server-side secret manager or a local untracked `.env` file).
- Never place Gemini credentials in `VITE_*` variables, browser bundles, HTML, committed source files, or client-side Firebase configuration.
- Access Gemini from server-side code only. Do not return the key in API responses or logs.
- The committed `firebase-applet-config.json` contains the Firebase Web App configuration. Its `apiKey` is a Firebase client configuration value, not evidence of a Gemini integration; keep it restricted to the Firebase APIs and authorized application domains in Google Cloud Console.
- If a Gemini key has ever been committed or exposed, revoke it in Google AI Studio / Google Cloud and create a replacement. Removing a value from the current branch does not invalidate an exposed key or erase it from Git history.

The repository review did not find a Gemini SDK call or a Gemini API key in the application source files inspected. The `.env.example` now leaves `GEMINI_API_KEY` blank; configure the real value only in the server's secret store.
 
---

## Worldwide Region Coverage

MCloud supports provisioning across **40 predefined zones spanning 7 regional groups** plus **custom worldwide locations** (`POST /api/hosting/subscribe` accepts any city, country, or region up to 100 characters and resolves the nearest continental node):

| Group | Available Zones |
| :--- | :--- |
| **Global Edge** | `global-anycast (Global Multi-Region Edge)` |
| **North America** | `us-east-1 (Virginia, USA)`, `us-east-2 (New York, USA)`, `us-central-1 (Chicago, USA)`, `us-west-1 (Oregon, USA)`, `us-west-2 (California, USA)`, `ca-central-1 (Toronto, Canada)`, `mx-central-1 (Mexico City, Mexico)` |
| **South America** | `sa-east-1 (Sao Paulo, Brazil)`, `sa-south-1 (Santiago, Chile)`, `sa-north-1 (Bogota, Colombia)` |
| **Europe** | `eu-west-2 (London, UK)`, `eu-west-1 (Frankfurt, Germany)`, `eu-west-3 (Paris, France)`, `eu-west-4 (Amsterdam, Netherlands)`, `eu-west-5 (Dublin, Ireland)`, `eu-south-1 (Madrid, Spain)`, `eu-south-2 (Milan, Italy)`, `eu-north-1 (Stockholm, Sweden)`, `eu-central-2 (Zurich, Switzerland)`, `eu-east-1 (Warsaw, Poland)` |
| **Middle East & Africa** | `me-central-1 (Dubai, UAE)`, `me-south-1 (Riyadh, Saudi Arabia)`, `me-west-1 (Tel Aviv, Israel)`, `af-north-1 (Cairo, Egypt)`, `af-west-1 (Lagos, Nigeria)`, `af-east-1 (Nairobi, Kenya)`, `af-south-1 (Johannesburg, South Africa)` |
| **Asia-Pacific** | `ap-south-1 (Mumbai, India)`, `ap-south-2 (Bangalore, India)`, `ap-southeast-1 (Singapore)`, `ap-southeast-2 (Jakarta, Indonesia)`, `ap-southeast-3 (Bangkok, Thailand)`, `ap-east-1 (Hong Kong)`, `ap-northeast-1 (Tokyo, Japan)`, `ap-northeast-2 (Seoul, South Korea)`, `ap-northeast-3 (Osaka, Japan)` |
| **Oceania** | `oc-east-1 (Sydney, Australia)`, `oc-south-1 (Melbourne, Australia)`, `oc-nz-1 (Auckland, New Zealand)` |

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4 (Light & Dark themes), Recharts, Custom SVG Icon System (`src/components/Icons.tsx`) |
| **Backend** | Node.js, Express 4, TypeScript (`tsx`), WebSockets (`ws`), Helmet 8, Zod 4 |
| **Database** | Cloud SQL for PostgreSQL (`europe-west1`), Drizzle ORM (`drizzle-orm` + `pg`) |
| **Authentication** | `bcryptjs` (Cost 12), HMAC-SHA256 Session Tokens, Firebase Auth & Firebase Admin SDK |

---

## Project Structure

```text
.
├── server.ts                      # Express API, WebSocket telemetry server, Vite middleware
├── index.html                     # HTML entry point & Google Fonts (Plus Jakarta Sans, Public Sans, JetBrains Mono)
├── package.json                   # Scripts and dependencies
├── firebase-applet-config.json    # Firebase web client configuration
└── src/
    ├── App.tsx                    # Top-level surface router (Public Site / Customer Dashboard)
    ├── index.css                  # Tailwind CSS v4 base styles and custom tokens
    ├── components/
    │   ├── PublicSite.tsx         # Landing page, product pages, pricing, docs, contact, Sign Up & Sign In
    │   ├── CustomerDashboard.tsx  # 12-tab authenticated tenant control plane
    │   ├── Icons.tsx              # Custom crisp inline SVG icons
    │   └── MCloudLogo.tsx         # Brand mark SVG component
    ├── context/
    │   └── AuthContext.tsx        # Dual auth state, session hydration, theme toggle, WebSocket client
    ├── db/
    │   ├── index.ts               # PostgreSQL pool & Drizzle instance
    │   ├── schema.ts              # 23 normalized PostgreSQL tables
    │   ├── seed.ts                # Idempotent plans, global nodes, and settings seeding
    │   └── drizzle.config.ts      # Drizzle Kit configuration
    ├── lib/
    │   ├── api.ts                 # Fetch wrapper with credentials: include & Firebase token injection
    │   ├── regions.ts             # Shared worldwide region groups & defaults
    │   ├── firebase.ts            # Firebase client initialization
    │   └── firebase-admin.ts      # Firebase Admin token verification
    ├── middleware/
    │   └── auth.ts                # Dual session token + Firebase ID token auth guard
    ├── routes/
    │   ├── public.ts              # Plans, global regions, node summary, contact form, OpenAPI spec
    │   ├── auth.ts                # Register, login, and logout session revocation
    │   ├── account.ts             # Profile, password update, API key rotation, sessions, notifications
    │   ├── hosting.ts             # Overview, sandbox checkout, upgrades, VPS power, SFTP rotation, billing
    │   ├── resources.ts           # Websites, domains, DNS records, managed databases, file manager
    │   └── deployments.ts         # Applications, builds/rollbacks, SHA-256 backups, support tickets
    ├── services/
    │   ├── password.ts            # Bcrypt password & credential hashing service
    │   ├── sanitize.ts            # Response payload & IP masking serializers
    │   ├── session-token.ts       # HMAC-SHA256 signed session token signer & cookie parser
    │   └── infrastructure.ts      # Infrastructure, DNS, backup, and audit log adapters
    └── types/
        └── mcloud.ts              # Shared TypeScript domain interfaces
```

---

## API Endpoints

Live OpenAPI metadata is served at `GET /api/docs/openapi`.

| Group | Endpoints |
| :--- | :--- |
| **Health & Public** | `GET /api/health`, `GET /api/public/plans`, `GET /api/public/regions`, `GET /api/public/nodes-summary`, `POST /api/public/contact`, `GET /api/docs/openapi` |
| **Authentication** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| **Account & Security** | `PATCH /api/users/me`, `DELETE /api/users/me`, `POST /api/users/me/password`, `POST /api/users/me/rotate-api-credential`, `GET /api/users/sessions`, `POST /api/users/sessions/:id/revoke` |
| **Hosting & Billing** | `GET /api/hosting/overview`, `POST /api/hosting/subscribe`, `PATCH /api/hosting/subscriptions/:id`, `POST /api/hosting/accounts/:id/power`, `POST /api/hosting/accounts/:id/rotate-sftp`, `GET /api/billing/invoices` |
| **Websites, DNS & DBs** | `GET/POST/PATCH/DELETE /api/websites`, `GET/POST/DELETE /api/domains`, `GET/POST/DELETE /api/dns/:domainId`, `GET/POST/DELETE /api/databases`, `POST/DELETE /api/databases/:id/users` |
| **Files & Deployments** | `GET/POST/PATCH/DELETE /api/files`, `GET/POST /api/applications`, `POST /api/applications/:id/deploy`, `POST /api/deployments/:id/rollback` |
| **Backups & Support** | `GET/POST /api/backups`, `POST /api/backups/:id/restore`, `POST/DELETE /api/backups/schedules`, `GET/POST /api/support/tickets`, `POST /api/support/tickets/:id/messages`, `WS /ws/telemetry` |

---

## Database Schema

All application state is persisted across 23 relational PostgreSQL tables in `src/db/schema.ts`:

- **Identity & Access**: `users`, `user_sessions`, `notifications`, `audit_logs`
- **Plans & Compute**: `hosting_plans`, `hosting_subscriptions`, `hosting_nodes`, `hosting_accounts`
- **Web, DNS & Files**: `websites`, `domains`, `dns_records`, `hosting_files`
- **Databases**: `managed_databases`, `database_users`
- **CI/CD & Snapshots**: `applications`, `deployments`, `backups`, `backup_schedules`
- **Commerce & Support**: `invoices`, `support_tickets`, `ticket_messages`, `contact_inquiries`, `system_settings`

---

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL database (configured via environment variables; see `.env.example`)

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express REST API, WebSocket telemetry server, and Vite middleware on port `3000` |
| `npm run build` | Builds the production React bundle into `dist/` |
| `npm run start` | Runs the Express production server on port `3000` (`NODE_ENV=production`) |
| `npm run lint` | Runs `tsc --noEmit` TypeScript verification across the codebase |
| `npm run clean` | Removes generated `dist/` build artifacts |

---

## Development Adapters

Infrastructure provisioning, hypervisor power actions, DNS zone delegation, backup archives, and checkout gateways run through isolated local/sandbox adapters in `src/services/infrastructure.ts` (`LocalDevInfrastructureAdapter`, `SandboxDnsAdapter`, `LocalVaultBackupAdapter`, `SandboxPaymentAdapter`) so all database workflows, RBAC checks, and audit logs execute end to end without billing real external cloud or payment providers.
