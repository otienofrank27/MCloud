# MCloud Development Status

## Completed Modules
- **Phase 1: Foundation & Database**:
  - Cloud SQL PostgreSQL provisioned in `europe-west1` (`agile-stock-06tvw / ai-studio-7ebcb952`).
  - Dual authentication: Email & Password (bcrypt cost 12 + HMAC-SHA256 session tokens) and Firebase Authentication (Google Sign-In).
  - Normalized Drizzle ORM schema pushed and verified via `information_schema.columns`, including bcrypt hashes for account passwords (`users.password_hash`), API credentials (`users.api_credential_hash`), SFTP secrets (`hosting_accounts.sftp_credential_hash`), and database user passwords (`database_users.password_hash`).
  - MCloud typography (`Plus Jakarta Sans`, `Public Sans`, `JetBrains Mono`), off-white (`#F1F4F8` / `#F8FAFC`) Light and deep navy (`#0B111E` / `#111A2C`) Dark theme tokens, custom SVG logo, favicon, and custom SVG UI icons.
- **Phase 2: Public Website & Auth Flows**:
  - Complete public site (Home, About, Cloud/Web/VPS/Dedicated/App Hosting, Pricing tiers, Features, Docs with live OpenAPI endpoint, Support, Contact form persisted to PostgreSQL, Login, dedicated split-screen Sign-Up with email & password, and Privacy Policy).
- **Phase 3: Authentication, Security & Password Hashing**:
  - Dedicated `bcryptjs` password service (`src/services/password.ts`) with salt cost factor 12, password strength validation, timing-safe dummy-hash verification on unknown emails, and automatic hash upgrade detection (`needsRehash`).
  - Signed HMAC-SHA256 session tokens (`src/services/session-token.ts`) tied to PostgreSQL `user_sessions` for immediate server-side revocation (`POST /api/auth/logout`).
  - Dual `requireAuth` middleware verifying both MCloud session tokens and Firebase ID tokens, plus password update endpoint (`POST /api/users/me/password`), Helmet security headers, and API rate limiting.
- **Phase 4 to 10: Customer Dashboard & Infrastructure Modules**:
  - Dashboard overview, Hosting & Sandbox Checkout (Stripe/PayPal/M-Pesa test modes + discount codes), plan upgrades/cancellations, VPS power controls (`LocalDevInfrastructureAdapter`), SFTP credential rotation, Websites CRUD & runtime configuration, Domains & DNS zone editor (`A/AAAA/CNAME/MX/TXT/NS/SRV/CAA`), Managed Databases & bcrypt-hashed DB users, Traversal-safe File Manager + code editor, Git/Archive Application Deployments with logs & rollbacks, Real-Time WebSocket Resource Monitoring (Recharts), SHA-256 verified Backups & Schedules, Billing Invoices, Support Ticketing, Account Password management, and Workspace API Credential rotation.
- **Phase 11: Verification**:
  - TypeScript typecheck (`tsc --noEmit`), production Vite build (`vite build`), ESLint check, and live Express + PostgreSQL + WebSocket runtime check.

## Known Limitations / Development Adapters
- Compute lifecycle, DNS records, backup snapshots, and payment checkouts execute through clearly labeled sandbox/local adapters (`LocalDevInfrastructureAdapter`, `SandboxDnsAdapter`, `LocalVaultBackupAdapter`, `SandboxPaymentAdapter`) rather than external paid infrastructure providers.
