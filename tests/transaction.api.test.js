const request = require("supertest")

const app = require("../src/app")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

const transactionModel =
    require("../src/models/transaction.model")

const ledgerModel =
    require("../src/models/ledger.model")

describe("Transaction API", () => {
    let sourceUser
    let sourceToken
    let sourceAccount

    let destinationUser
    let destinationToken
    let destinationAccount

    beforeEach(async () => {
        sourceUser =
            await userModel.create({
                name: "Source User",
                email: "transaction-source@example.com",
                password: "password123"
            })

        destinationUser =
            await userModel.create({
                name: "Destination User",
                email: "transaction-destination@example.com",
                password: "password123"
            })

        const sourceLogin =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email:
                        "transaction-source@example.com",
                    password:
                        "password123"
                })

        sourceToken =
            sourceLogin.body.token

        const destinationLogin =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email:
                        "transaction-destination@example.com",
                    password:
                        "password123"
                })

        destinationToken =
            destinationLogin.body.token

        sourceAccount =
            await accountModel.create({
                user: sourceUser._id,
                balanceMinor: 100000,
                currency: "INR",
                status: "ACTIVE"
            })

        destinationAccount =
            await accountModel.create({
                user: destinationUser._id,
                balanceMinor: 50000,
                currency: "INR",
                status: "ACTIVE"
            })
    })

    test("should reject a transaction without authentication", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "api-test-001"
                })

        expect(response.status).toBe(401)

        expect(response.body.message)
            .toMatch(/Unauthorized/i)
    })

    test("should successfully transfer money", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 300,
                    idempotencyKey:
                        "api-test-002"
                })

        expect(response.status).toBe(201)

        expect(response.body.message)
            .toBe("Transaction processed successfully")

        expect(response.body.transaction)
            .toBeDefined()

        expect(response.body.transaction.status)
            .toBe("COMPLETED")

        expect(response.body.transaction.amountMinor)
            .toBe(30000)

        const updatedSource =
            await accountModel.findById(
                sourceAccount._id
            )

        const updatedDestination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(updatedSource.balanceMinor)
            .toBe(70000)

        expect(updatedDestination.balanceMinor)
            .toBe(80000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(1)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(2)
    })

    test("should reject a transaction when the source has insufficient funds", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 1500,
                    idempotencyKey:
                        "api-test-003"
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe("Insufficient balance")

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(0)
    })

    test("should reject a user transferring from another user's account", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${destinationToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "api-test-004"
                })

        expect(response.status).toBe(403)

        expect(response.body.message)
            .toBe(
                "You are not authorized to transfer from this account"
            )

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)
    })

    test("should reject a self transfer", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        sourceAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "api-test-005"
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe(
                "Source and destination accounts must be different"
            )
    })

    test("should reject an invalid amount", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: -100,
                    idempotencyKey:
                        "api-test-006"
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe(
                "Transaction amount must be greater than zero"
            )
    })

    test("should reject a request with missing required fields", async () => {
        const response =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id
                })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe(
                "fromAccount, toAccount, amount and idempotencyKey are required"
            )
    })

    test("should return the same transaction for a repeated idempotency key", async () => {
        const first =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "api-test-007"
                })

        const second =
            await request(app)
                .post("/api/transactions")
                .set(
                    "Authorization",
                    `Bearer ${sourceToken}`
                )
                .send({
                    fromAccount:
                        sourceAccount._id,
                    toAccount:
                        destinationAccount._id,
                    amount: 100,
                    idempotencyKey:
                        "api-test-007"
                })

        expect(first.status).toBe(201)
        expect(second.status).toBe(200)

        expect(second.body.message)
            .toBe("Transaction already processed")

        expect(
            second.body.transaction._id
        ).toBe(
            first.body.transaction._id
        )

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(source.balanceMinor)
            .toBe(90000)

        expect(destination.balanceMinor)
            .toBe(60000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(1)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(2)
    })
    test("should return transaction history for the authenticated user", async () => {
    await request(app)
        .post("/api/transactions")
        .set(
            "Authorization",
            `Bearer ${sourceToken}`
        )
        .send({
            fromAccount: sourceAccount._id,
            toAccount: destinationAccount._id,
            amount: 100,
            idempotencyKey: "history-test-001"
        })
        .expect(201)

    const response =
        await request(app)
            .get("/api/transactions")
            .set(
                "Authorization",
                `Bearer ${sourceToken}`
            )

    expect(response.status).toBe(200)

    expect(response.body.transactions).toHaveLength(1)

    expect(
        response.body.transactions[0].idempotencyKey
    ).toBe("history-test-001")

    expect(
        response.body.transactions[0].amountMinor
    ).toBe(10000)
})

test("should return transactions received by the authenticated user", async () => {
    await request(app)
        .post("/api/transactions")
        .set(
            "Authorization",
            `Bearer ${sourceToken}`
        )
        .send({
            fromAccount: sourceAccount._id,
            toAccount: destinationAccount._id,
            amount: 100,
            idempotencyKey: "history-test-002"
        })
        .expect(201)

    const response =
        await request(app)
            .get("/api/transactions")
            .set(
                "Authorization",
                `Bearer ${destinationToken}`
            )

    expect(response.status).toBe(200)

    expect(response.body.transactions).toHaveLength(1)

    expect(
        response.body.transactions[0].toAccount
    ).toBe(
        destinationAccount._id.toString()
    )

    expect(
        response.body.transactions[0].amountMinor
    ).toBe(10000)
})

test("should not return transactions unrelated to the authenticated user", async () => {
    const unrelatedUser =
        await userModel.create({
            name: "Unrelated User",
            email: "unrelated@example.com",
            password: "password123"
        })

    const unrelatedAccount =
        await accountModel.create({
            user: unrelatedUser._id,
            balanceMinor: 100000,
            currency: "INR",
            status: "ACTIVE"
        })

    await transactionModel.create({
        fromAccount: unrelatedAccount._id,
        toAccount: sourceAccount._id,
        amountMinor: 10000,
        currency: "INR",
        idempotencyKey: "history-test-003",
        status: "COMPLETED"
    })

    const response =
        await request(app)
            .get("/api/transactions")
            .set(
                "Authorization",
                `Bearer ${destinationToken}`
            )

    expect(response.status).toBe(200)

    expect(response.body.transactions).toHaveLength(0)
})
})