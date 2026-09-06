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

describe("Bootstrap Service", () => {
    let systemUser
    let systemAccount

    beforeEach(async () => {
        process.env.SYSTEM_USER_EMAIL =
            "system@bank.local"

        process.env.SYSTEM_USER_NAME =
            "Bank System"

        process.env.SYSTEM_USER_PASSWORD =
            "system-password-123"

        const result =
            await systemAccountService.initializeSystemAccount()

        systemUser = result.systemUser
        systemAccount = result.systemAccount
    })

    test("should bootstrap funds into the system account", async () => {
        const result =
            await bootstrapService.bootstrapSystemFunds({
                user: systemUser,
                amount: 1000,
                idempotencyKey: "bootstrap-test-001"
            })

        expect(result.alreadyProcessed)
            .toBe(false)

        expect(result.transaction.type)
            .toBe("BOOTSTRAP_FUNDING")

        expect(result.transaction.status)
            .toBe("COMPLETED")

        expect(result.transaction.fromAccount)
            .toBeUndefined()

        expect(
            result.transaction.toAccount.toString()
        ).toBe(
            systemAccount._id.toString()
        )

        expect(result.transaction.amountMinor)
            .toBe(100000)

        const updatedSystemAccount =
            await accountModel.findById(
                systemAccount._id
            )

        expect(
            updatedSystemAccount.balanceMinor
        ).toBe(100000)

        const ledgerEntries =
            await ledgerModel.find({
                transaction:
                    result.transaction._id
            })

        expect(ledgerEntries)
            .toHaveLength(1)

        expect(ledgerEntries[0].type)
            .toBe("CREDIT")

        expect(
            ledgerEntries[0].account.toString()
        ).toBe(
            systemAccount._id.toString()
        )

        expect(ledgerEntries[0].amountMinor)
            .toBe(100000)
    })

    test("should return the same transaction for a repeated bootstrap idempotency key", async () => {
        const first =
            await bootstrapService.bootstrapSystemFunds({
                user: systemUser,
                amount: 1000,
                idempotencyKey: "bootstrap-test-002"
            })

        const second =
            await bootstrapService.bootstrapSystemFunds({
                user: systemUser,
                amount: 1000,
                idempotencyKey: "bootstrap-test-002"
            })

        expect(first.alreadyProcessed)
            .toBe(false)

        expect(second.alreadyProcessed)
            .toBe(true)

        expect(
            second.transaction._id.toString()
        ).toBe(
            first.transaction._id.toString()
        )

        expect(
            await transactionModel.countDocuments()
        ).toBe(1)

        const updatedSystemAccount =
            await accountModel.findById(
                systemAccount._id
            )

        expect(
            updatedSystemAccount.balanceMinor
        ).toBe(100000)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(1)
    })

    test("should reject a normal user from bootstrapping system funds", async () => {
        const normalUser =
            await userModel.create({
                email: "normal-bootstrap@example.com",
                name: "Normal User",
                password: "password123"
            })

        await expect(
            bootstrapService.bootstrapSystemFunds({
                user: normalUser,
                amount: 1000,
                idempotencyKey: "bootstrap-test-003"
            })
        ).rejects.toMatchObject({
            code: "SYSTEM_USER_REQUIRED",
            statusCode: 403
        })

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(0)
    })

    test("should reject an invalid bootstrap amount", async () => {
        await expect(
            bootstrapService.bootstrapSystemFunds({
                user: systemUser,
                amount: 0,
                idempotencyKey: "bootstrap-test-004"
            })
        ).rejects.toMatchObject({
            code: "INVALID_AMOUNT",
            statusCode: 400
        })
    })

    test("should reject an idempotency key already used by another transaction type", async () => {
        const existing =
            await transactionModel.create({
                fromAccount: systemAccount._id,
                toAccount: systemAccount._id,
                amountMinor: 100,
                currency: "INR",
                idempotencyKey: "bootstrap-test-005",
                type: "TRANSFER",
                status: "COMPLETED"
            })

        await expect(
            bootstrapService.bootstrapSystemFunds({
                user: systemUser,
                amount: 1000,
                idempotencyKey: existing.idempotencyKey
            })
        ).rejects.toMatchObject({
            code: "IDEMPOTENCY_KEY_CONFLICT",
            statusCode: 409
        })
    })
})