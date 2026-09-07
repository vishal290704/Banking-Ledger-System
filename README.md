```markdown
# Banking Ledger System

A robust backend banking transaction system built with Node.js, Express, and MongoDB. This project focuses on financial data integrity by implementing safe money transfers, double-entry ledger accounting, idempotent transactions, and concurrent request handling.

## Key Features

* **Authentication:** User registration and login using JWT (HTTP-only cookies and Bearer token support).
* **Account Management:** Account creation, ownership validation, and balance tracking.
* **Robust Transactions:** Atomic balance updates using MongoDB transactions.
* **Double-Entry Ledger:** Every transfer creates synchronized DEBIT and CREDIT records.
* **Idempotency & Concurrency:** Protection against duplicate requests, idempotency-key reuse with altered details, and concurrent transfer overspending.
* **System Funding:** Dedicated system account initialization and customer initial funding capabilities.
* **Reconciliation:** Ledger-based account reconciliation to detect data inconsistencies.
* **Audit Trail:** Complete transaction history for authenticated users.
* **Testing:** Automated API and service-level tests using Jest and Supertest.

## Tech Stack

* **Core:** Node.js, Express.js
* **Database:** MongoDB, Mongoose
* **Security:** JWT, bcryptjs
* **Email:** Nodemailer
* **Testing:** Jest, Supertest, MongoDB Memory Server

## Project Structure

```text
.
├── scripts/
│   └── bootstrap-system-account.js
├── src/
│   ├── config/
│   ├── controller/
│   ├── errors/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── services/
├── tests/
├── .env.example
├── jest.config.js
├── package.json
└── server.js

```

## Installation & Setup

**Requirements:** Node.js, MongoDB, and npm.

**1. Clone and install dependencies:**

```bash
npm install

```

**2. Configure environment variables:**

Create a `.env` file in the project root (do not commit this file).

```env
PORT=3000
NODE_ENV=development

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3d

EMAIL_USER=your_email
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
REFRESH_TOKEN=your_refresh_token

SYSTEM_USER_EMAIL=system@bank.local
SYSTEM_USER_NAME=Bank System
SYSTEM_USER_PASSWORD=your_system_password

```

**3. Initialize the System Account:**

Run the bootstrap script to create or reuse the configured system user and system account.

```bash
npm run bootstrap:system

```

## Running the Application

**Development Mode:**

```bash
npm run dev

```

**Production Mode:**

```bash
npm start

```

The server will run on `http://localhost:3000`. You can verify the system is running via the health check endpoint:

```http
GET /health

```

## API Endpoints

| Category | Method | Endpoint | Description |
| --- | --- | --- | --- |
| **Auth** | POST | `/api/auth/register` | Register a new user |
|  | POST | `/api/auth/login` | Authenticate user and return JWT |
|  | POST | `/api/auth/logout` | Clear authentication session |
| **Accounts** | POST | `/api/account` | Create a new bank account |
|  | GET | `/api/account` | List user's accounts |
|  | GET | `/api/account/balance/:accountId` | Get specific account balance |
| **Transfers** | GET | `/api/transactions` | View transaction history |
|  | POST | `/api/transactions` | Initiate a money transfer |
|  | POST | `/api/transactions/system/initial-funds` | Fund an account from the system |

## Transfer Example & Transaction Safety

To initiate a transfer, send a POST request with an idempotency key to prevent duplicate processing.

```http
POST /api/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromAccount": "<source-account-id>",
  "toAccount": "<destination-account-id>",
  "amount": 100.50,
  "idempotencyKey": "transfer-example-001"
}

```

**Note on Currency:** Amounts are stored internally in the smallest currency unit (paise/cents) to prevent floating-point errors.
Example: ₹100.50 becomes 10050 paise.

**How it works under the hood:**
Transfers are executed within a MongoDB transaction. A successful transfer atomically performs:

1. Validates balances and idempotency keys.
2. Creates a DEBIT entry for the Source Account.
3. Creates a CREDIT entry for the Destination Account.
4. Updates the materialized balances on both account documents.

If any step fails, the entire transaction rolls back.

## Reconciliation

The system includes built-in reconciliation capabilities to compare an account's quick-read (materialized) balance against the total sum of its immutable ledger entries.

```text
  [ Materialized Balance ]  
            ↕ (compare)
  [ Sum of Ledger Entries ] 

```

This guarantees that the displayed account balance is always mathematically backed by the transaction history.

## Testing

The project includes comprehensive service-level and API-level tests covering authentication, concurrency, funding, and idempotency.

**Run the complete test suite:**

```bash
npm test

```

**Run a specific test file:**

```bash
npm test -- tests/transaction.api.test.js

```

```

```