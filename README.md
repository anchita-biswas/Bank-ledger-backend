# Backend Ledger

A double-entry ledger and money-transfer API built with Node.js, Express 5 and MongoDB.

## Description

Balances are never stored. Every transfer writes two immutable ledger lines — a DEBIT and a matching CREDIT — and an account balance is derived by aggregating them, so the ledger is the single source of truth, not a cached number that can drift.

Transfers run inside a MongoDB session transaction: the transaction record, the debit line and the credit line commit together or not at all. Each request carries a client-supplied idempotency key, so a retried request (double-click, client timeout, network retry) returns the original result instead of moving money twice. The sender account is always resolved scoped to the authenticated user, so a transfer can debit an account the caller owns and no other.

## Tech Stack

| Purpose | Choice |
| --- | --- |
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database | MongoDB with Mongoose 9 |
| Auth | jsonwebtoken, bcryptjs, cookie-parser |
| Email | Nodemailer (Gmail OAuth2) — optional, degrades to a no-op if unset |
| Config | dotenv |

## Project Structure

```
server.js                       # entry point: loads env, connects DB, listens on PORT
src/
  app.js                        # express app, middleware, routes, error handler
  config/db.js                  # mongoose connection
  middleware/auth.middleware.js # shared JWT auth core + system-user guard
  models/
    user.model.js               # user, password hashing, comparePassword
    account.model.js            # account + getBalance() ledger aggregation
    ledger.model.js              # immutable double-entry lines
    transaction.model.js        # transfer record + idempotency key
    blackList.model.js          # logged-out tokens, self-expiring
  controllers/                  # auth, account, transaction handlers
  routes/                       # auth, account, transaction routers
  services/email.service.js     # nodemailer templates
```

## API

All authenticated routes read the JWT from either the `token` cookie set at login, or an `Authorization: Bearer <token>` header.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Liveness probe |
| POST | `/api/auth/register` | — | Create a user, return a JWT |
| POST | `/api/auth/login` | — | Log in, return a JWT |
| POST | `/api/auth/logout` | — | Blacklist the current token, clear the cookie |
| GET | `/api/auth/me` | JWT | Current user, for restoring a session on load |
| POST | `/api/accounts` | JWT | Create an account for the logged-in user |
| GET | `/api/accounts` | JWT | List the logged-in user's accounts, each with its derived balance |
| GET | `/api/accounts/balance/:accountId` | JWT | Derived balance for one account |
| POST | `/api/transactions` | JWT | Transfer funds between two accounts |
| GET | `/api/transactions` | JWT | Transaction history for the logged-in user's accounts |
| POST | `/api/transactions/system/initial-funds` | JWT (system user) | Seed funds into an account from the system account |

A transfer request body:

```json
{
  "fromAccount": "<accountId>",
  "toAccount": "<accountId>",
  "amount": 100,
  "idempotencyKey": "<unique-string>"
}
```

`fromAccount` must belong to the caller — the API returns `403` otherwise. `amount` must be a positive finite number. Retrying the same `idempotencyKey` returns the original transaction instead of transferring again.

## Data Model

```
user 1---* account 1---* ledger *---1 transaction
```

- **user** — email, hashed password, name. `systemUser` marks the account allowed to mint funds via `/system/initial-funds`.
- **account** — belongs to a user, has a `status` (`ACTIVE` / `FROZEN` / `CLOSED`) and a `currency`. No balance field.
- **transaction** — one transfer attempt: `fromAccount`, `toAccount`, `amount`, `status` (`PENDING` / `COMPLETED` / `FAILED` / `REVERSED`), unique `idempotencyKey`.
- **ledger** — one immutable line per side of a transfer (`DEBIT` or `CREDIT`), linked to the transaction that created it. Update/delete hooks throw, so a ledger line cannot be altered after the fact — corrections must be new, reversing entries.

## Getting Started

Requires Node.js 18+ and a MongoDB replica set or Atlas cluster — multi-document transactions do not work against a standalone `mongod`.

```bash
npm install
```

Create a `.env` file in the project root:

```
MONGO_URI=<mongodb connection string>
JWT_SECRET=<random secret>

# Optional — omit to run with email notifications disabled
EMAIL_USER=<gmail address>
CLIENT_ID=<google oauth client id>
CLIENT_SECRET=<google oauth client secret>
REFRESH_TOKEN=<google oauth refresh token>
```

Run it:

```bash
npm run dev     # nodemon
npm start       # plain node
```

The server listens on `PORT` (default `3000`).

### Seeding a system user

`/api/transactions/system/initial-funds` needs a user with `systemUser: true`, which cannot be set through the register endpoint. Set it directly once, after registering the account normally:

```js
db.users.updateOne({ email: "system@example.com" }, { $set: { systemUser: true } })
```

## Deploying (Render)

- **Build command:** `npm install`
- **Start command:** `npm start`
- Set `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, and the email vars above (optional) in the Render dashboard — never commit `.env`.
- In Atlas Network Access, allow `0.0.0.0/0` (Render's egress IPs are not fixed) or use Atlas's Render-specific peering if you need tighter access.
- `NODE_ENV=production` also switches the `token` cookie to `secure`, so the API must be served over HTTPS — Render does this by default.

## License

ISC
