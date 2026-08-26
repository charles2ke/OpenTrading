# Privacy Policy

_Last updated: 2026-08-26_

OpenTrading is a paper-trading simulator. It does not execute real trades, does not provide investment advice, and market data is illustrative only. This policy explains what data the application processes, where it is stored, how long it is kept, and who it may be shared with.

## 1. Data we process

### Account and sign-in data
- When you sign in with **Google** or **Microsoft**, OpenTrading uses OpenID Connect (Authorization Code Flow with PKCE) to receive an `openid email profile` claim set from the identity provider (`src/server/auth.js`).
- We do **not** store your raw email address or provider profile. The stored user identifier is `provider:subject` and is pseudonymized with HMAC-SHA256 before it is written to MongoDB (`src/server/portfolio-repository.js`). Your display name is truncated to 100 characters.
- A random session identifier is issued and stored in an `__Host-opentrading` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), valid for 8 hours.

### Portfolio data
- By default, your simulated cash balance and stock positions are stored **only on your device** in `localStorage` (`src/core/storage.js`).
- If server-side persistence is configured (`MONGODB_URI`), your portfolio may also sync to MongoDB, keyed to your pseudonymous identifier, so it can follow you across devices when signed in.

### Banking data
- OpenTrading can connect to your bank through an Open Banking (PSD2/FDX-style) provider (`src/server/bank-service.js`). Consent is granted directly with your bank; OpenTrading never receives or stores your banking credentials.
- Only masked account details (for example, a partially hidden IBAN) are displayed and stored (`src/core/banking.js`).
- Transfers you initiate (deposit/withdrawal amount, currency, direction, IBAN, BIC, reference) are used to build ISO 20022 `pain.001` payment instructions and are not retained in unmasked form.

### Audit log
- Actions you take (sign-in, portfolio changes, bank connections, transfers) are recorded in a personal audit log you can view and export as CSV/JSON (`audit.html`, `src/audit.js`).
- Audit entries are pseudonymized and scrubbed of personal data (emails, tokens, passwords, session identifiers, and banking details are redacted) before storage (`src/server/portfolio-repository.js`).
- Audit entries are automatically deleted after a retention period (365 days by default, configurable via `AUDIT_RETENTION_DAYS`).

### News data
- If configured with a NewsAPI or Twitter/X API key, OpenTrading sends the ticker symbols you are viewing to that third-party service to fetch related headlines (`src/server/news-service.js`). No other personal data is sent with these requests.

## 2. What we do not do
- We do not use analytics, tracking pixels, or third-party scripts. The application's Content Security Policy blocks any script or connection that is not same-origin (`index.html`, `banking.html`, `audit.html`, `learn.html`).
- We do not sell or share your data with advertisers.
- We do not store unmasked banking credentials or full account numbers.

## 3. Where your data is stored
- **Locally:** your portfolio and a client identifier are stored in your browser's `localStorage` and, for the desktop app, within the Electron application sandbox.
- **Server-side (optional):** if the operator configures `MONGODB_URI`, portfolios, sessions, OAuth state, audit events, and masked bank connection records are stored in MongoDB, keyed by pseudonymous identifiers (`src/server/portfolio-repository.js`).

## 4. Data retention
- Local data persists until you clear your browser storage or uninstall the app.
- Server-side sessions expire after 8 hours.
- OAuth `state` values expire after 10 minutes.
- Audit events are retained for `AUDIT_RETENTION_DAYS` (default 365 days) and then deleted automatically.

## 5. Your choices
- You can use OpenTrading entirely offline/locally without signing in; no account data leaves your device.
- You can disconnect a linked bank at any time from the Banking page, which removes the stored (masked) connection.
- You can export or review your full audit history at any time from the Audit page.

## 6. Security
OpenTrading applies a restrictive Content Security Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cross-Origin-Opener-Policy: same-origin` on all pages (`scripts/server.js`). The desktop app runs with Electron context isolation, no Node integration, and sandboxing enabled (`desktop/main.cjs`).

## 7. Contact
This project is open source. Questions or concerns about data handling can be raised by opening an issue in the repository: <https://github.com/charles2ke/OpenTrading>.

## 8. Changes to this policy
We may update this policy as the application evolves. Material changes will be reflected in this file with an updated "Last updated" date.
