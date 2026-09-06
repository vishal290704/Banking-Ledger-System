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
})