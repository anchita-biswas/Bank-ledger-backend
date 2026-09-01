# Backend Ledger

A double-entry ledger and money-transfer API built with Node.js, Express 5 and MongoDB.

## Description

Balances are never stored. Every transfer writes two immutable ledger lines — a DEBIT and a matching CREDIT — and an account balance is derived by aggregating them, so the ledger is the single source of truth. Transfers commit inside a MongoDB session transaction and carry an idempotency key, so a retry cannot double-spend.

## Tech Stack

| Purpose | Choice |
| --- | --- |
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database | MongoDB with Mongoose 9 |
| Auth | jsonwebtoken, bcryptjs, cookie-parser |
| Email | Nodemailer (Gmail OAuth2) |
| Config | dotenv |

## Project Structure

```
server.js                       # entry point: loads env, connects DB, listens on :3000
src/
  app.js                        # express app, middleware and route mounting
  config/db.js                  # mongoose connection
  middleware/auth.middleware.js # JWT auth + system-user guard
  models/
    user.models.js              # user, password hashing, comparePassword
    account.model.js            # account + getBalance() ledger aggregation
    ledger.model.js             # immutable double-entry lines
    transaction.model.js        # transfer record + idempotency key
  controllers/                  # auth, account, transaction handlers
  routes/                       # auth, account, transaction routers
  services/email.service.js     # nodemailer templates
```

## API

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Create a user, return a JWT |
| POST | `/api/auth/login` | — | Log in, return a JWT |
| POST | `/api/accounts` | JWT | Create an account for the logged-in user |
| GET | `/api/accounts` | JWT | List the logged-in user's accounts |
| GET | `/api/accounts/balance/:accountId` | JWT | Derived balance for one account |
| POST | `/api/transactions` | JWT | Transfer funds between two accounts |
| POST | `/api/transactions/system/initial-funds` | JWT (system user) | Seed initial funds into an account |

A transfer request body:

```json
{
  "fromAccount": "<accountId>",
  "toAccount": "<accountId>",
  "amount": 100,
  "idempotencyKey": "<unique-string>"
}
```

## Getting Started

Requires Node.js 18+ and a MongoDB replica set or Atlas cluster (multi-document transactions do not work on a standalone `mongod`).

```bash
npm install
```

Create a `.env` file in the project root:

```
MONGO_URI=<mongodb connection string>
JWT_SECRET=<random secret>
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

The server listens on port 3000.

## License

ISC
