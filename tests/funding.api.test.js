const request = require("supertest")

const app = require("../src/app")

const systemAccountService =
    require("../src/services/system-account.service")

const bootstrapService =
    require("../src/services/bootstrap.service")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

const transactionModel =
    require("../src/models/transaction.model")

const ledgerModel =
    require("../src/models/ledger.model")

describe("Funding API", () => {
    let systemUser
    let systemToken
    let systemAccount

    let customerUser
    let customerToken
    let customerAccount

    beforeEach(async () => {
        process.env.SYSTEM_USER_EMAIL =
            "system@bank.local"

        process.env.SYSTEM_USER_NAME =
            "Bank System"

        process.env.SYSTEM_USER_PASSWORD =
            "system-password-123"

        /*
         * Create the system user and system account.
         */
        const system =
            await systemAccountService.initializeSystemAccount()

        systemUser = system.systemUser
        systemAccount = system.systemAccount

        /*
         * Login as the system user so the real
         * authSystemUserMiddleware is exercised.
         */
        const systemLogin =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email: "system@bank.local",
                    password: "system-password-123"
                })

        systemToken =
            systemLogin.body.token

        /*
         * Create a normal customer.
         */
        customerUser =
            await userModel.create({
                name: "Funding Customer",
                email: "funding-api@example.com",
                password: "password123"
            })

        const customerLogin =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email: "funding-api@example.com",
                    password: "password123"
                })

        customerToken =
            customerLogin.body.token

        customerAccount =
            await accountModel.create({
                user: customerUser._id,
                balanceMinor: 0,
                currency: "INR",
                status: "ACTIVE"
            })
    })

    test("should reject funding without authentication", async () => {
        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "funding-api-001"
                })

        expect(response.status).toBe(401)
    })

    test("should reject a normal authenticated user", async () => {
        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${customerToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "funding-api-002"
                })

        expect(response.status).toBe(403)

        expect(response.body.message)
            .toBe(
                "Forbidden access, user is not a system user"
            )
    })

    test("should reject funding when the system account has insufficient funds", async () => {
        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "funding-api-003"
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe(
                "System account has insufficient funds"
            )

        const customer =
            await accountModel.findById(
                customerAccount._id
            )

        const system =
            await accountModel.findById(
                systemAccount._id
            )

        expect(customer.balanceMinor)
            .toBe(0)

        expect(system.balanceMinor)
            .toBe(0)

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(0)
    })

    test("should successfully fund a customer account", async () => {
        /*
         * Add real money to the system account through
         * the bootstrap workflow.
         */
        await bootstrapService.bootstrapSystemFunds({
            user: systemUser,
            amount: 1000,
            idempotencyKey:
                "funding-api-bootstrap-001"
        })

        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 300,
                    idempotencyKey:
                        "funding-api-004"
                })

        expect(response.status).toBe(201)

        expect(response.body.message)
            .toBe(
                "Initial funding processed successfully"
            )

        expect(response.body.transaction)
            .toBeDefined()

        expect(response.body.transaction.type)
            .toBe("INITIAL_FUNDING")

        expect(response.body.transaction.status)
            .toBe("COMPLETED")

        expect(response.body.transaction.amountMinor)
            .toBe(30000)

        const customer =
            await accountModel.findById(
                customerAccount._id
            )

        const system =
            await accountModel.findById(
                systemAccount._id
            )

        expect(customer.balanceMinor)
            .toBe(30000)

        expect(system.balanceMinor)
            .toBe(70000)

        const ledgerEntries =
            await ledgerModel.find({
                transaction:
                    response.body.transaction._id
            })

        expect(ledgerEntries)
            .toHaveLength(2)

        expect(
            ledgerEntries.find(
                entry => entry.type === "DEBIT"
            )
        ).toBeDefined()

        expect(
            ledgerEntries.find(
                entry => entry.type === "CREDIT"
            )
        ).toBeDefined()
    })

    test("should return the same transaction for a repeated idempotency key", async () => {
        await bootstrapService.bootstrapSystemFunds({
            user: systemUser,
            amount: 1000,
            idempotencyKey:
                "funding-api-bootstrap-002"
        })

        const first =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 300,
                    idempotencyKey:
                        "funding-api-005"
                })

        const second =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id,
                    amount: 300,
                    idempotencyKey:
                        "funding-api-005"
                })

        expect(first.status).toBe(201)
        expect(second.status).toBe(200)

        expect(second.body.message)
            .toBe(
                "Initial funding already processed"
            )

        expect(
            second.body.transaction._id
        ).toBe(
            first.body.transaction._id
        )

        const customer =
            await accountModel.findById(
                customerAccount._id
            )

        const system =
            await accountModel.findById(
                systemAccount._id
            )

        expect(customer.balanceMinor)
            .toBe(30000)

        expect(system.balanceMinor)
            .toBe(70000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(2)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(3)
    })

    test("should reject a request with missing required fields", async () => {
        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        customerAccount._id
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe(
                "customerAccountId, amount and idempotencyKey are required"
            )
    })

    test("should reject an invalid customer account ID", async () => {
        const response =
            await request(app)
                .post(
                    "/api/transactions/system/initial-funds"
                )
                .set(
                    "Authorization",
                    `Bearer ${systemToken}`
                )
                .send({
                    customerAccountId:
                        "invalid-account-id",
                    amount: 100,
                    idempotencyKey:
                        "funding-api-007"
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe("Invalid customer account ID")
    })
})