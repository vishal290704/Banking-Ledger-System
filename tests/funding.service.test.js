const systemAccountService =
    require("../src/services/system-account.service")

const fundingService =
    require("../src/services/funding.service")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

const transactionModel =
    require("../src/models/transaction.model")

const ledgerModel =
    require("../src/models/ledger.model")

describe("Funding Service", () => {
    let systemUser
    let systemAccount
    let customerUser
    let customerAccount

    beforeEach(async () => {
        process.env.SYSTEM_USER_EMAIL =
            "system@bank.local"

        process.env.SYSTEM_USER_NAME =
            "Bank System"

        process.env.SYSTEM_USER_PASSWORD =
            "system-password-123"

        const system =
            await systemAccountService.initializeSystemAccount()

        systemUser = system.systemUser
        systemAccount = system.systemAccount

        customerUser =
            await userModel.create({
                email: "funding-customer@example.com",
                name: "Funding Customer",
                password: "password123"
            })

        customerAccount =
            await accountModel.create({
                user: customerUser._id,
                balanceMinor: 0,
                currency: "INR",
                status: "ACTIVE"
            })
    })

    test("should reject funding when the system account has insufficient funds", async () => {
        await expect(
            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: customerAccount._id,
                amount: 100,
                idempotencyKey: "funding-test-001"
            })
        ).rejects.toMatchObject({
            code: "SYSTEM_INSUFFICIENT_FUNDS",
            statusCode: 400
        })

        const customer =
            await accountModel.findById(
                customerAccount._id
            )

        const system =
            await accountModel.findById(
                systemAccount._id
            )

        expect(customer.balanceMinor).toBe(0)
        expect(system.balanceMinor).toBe(0)

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(0)
    })

    test("should reject a normal user from creating initial funding", async () => {
        await expect(
            fundingService.createInitialFunding({
                user: customerUser,
                customerAccountId: customerAccount._id,
                amount: 100,
                idempotencyKey: "funding-test-002"
            })
        ).rejects.toMatchObject({
            code: "SYSTEM_USER_REQUIRED",
            statusCode: 403
        })
    })

    test("should reject an invalid funding amount", async () => {
        await expect(
            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: customerAccount._id,
                amount: 0,
                idempotencyKey: "funding-test-003"
            })
        ).rejects.toMatchObject({
            code: "INVALID_AMOUNT",
            statusCode: 400
        })
    })

    test("should reject an invalid customer account ID", async () => {
        await expect(
            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: "invalid-account-id",
                amount: 100,
                idempotencyKey: "funding-test-004"
            })
        ).rejects.toMatchObject({
            code: "INVALID_ACCOUNT_ID",
            statusCode: 400
        })
    })

    test("should reject a missing customer account", async () => {
        const mongoose =
            require("mongoose")

        const missingAccountId =
            new mongoose.Types.ObjectId()

        await expect(
            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: missingAccountId,
                amount: 100,
                idempotencyKey: "funding-test-005"
            })
        ).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND",
            statusCode: 404
        })
    })
        test("should process concurrent funding requests with the same idempotency key only once", async () => {
        const bootstrapService =
            require("../src/services/bootstrap.service")

        await bootstrapService.bootstrapSystemFunds({
            user: systemUser,
            amount: 1000,
            idempotencyKey: "concurrent-fund-001"
        })

        const results = await Promise.allSettled([
            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: customerAccount._id,
                amount: 200,
                idempotencyKey: "same-fund-key-001"
            }),

            fundingService.createInitialFunding({
                user: systemUser,
                customerAccountId: customerAccount._id,
                amount: 200,
                idempotencyKey: "same-fund-key-001"
            })
        ])

        const successfulResults = results.filter(
            result => result.status === "fulfilled"
        )

        const failedResults = results.filter(
            result => result.status === "rejected"
        )

        expect(successfulResults).toHaveLength(2)
        expect(failedResults).toHaveLength(0)

        const firstTransaction =
            successfulResults[0].value.transaction

        const secondTransaction =
            successfulResults[1].value.transaction

        expect(
            firstTransaction._id.toString()
        ).toBe(
            secondTransaction._id.toString()
        )

        const processedFlags =
            successfulResults.map(
                result => result.value.alreadyProcessed
            )

        expect(
            processedFlags.filter(
                value => value === false
            )
        ).toHaveLength(1)

        expect(
            processedFlags.filter(
                value => value === true
            )
        ).toHaveLength(1)

        const system =
            await accountModel.findById(
                systemAccount._id
            )

        const customer =
            await accountModel.findById(
                customerAccount._id
            )

        expect(system.balanceMinor)
            .toBe(80000)

        expect(customer.balanceMinor)
            .toBe(20000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(2)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(3)
    })
})