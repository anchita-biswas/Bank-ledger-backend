# Bank-ledger-backend
Balances are never stored. Every transfer writes two immutable ledger lines — a DEBIT and a matching CREDIT — and an account balance is derived by aggregating them, so the ledger is the single source of truth. Transfers commit inside a MongoDB session transaction and carry an idempotency key, so a retry cannot double-spend.
