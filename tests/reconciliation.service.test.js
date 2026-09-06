const systemAccountService =
    require("../src/services/system-account.service")

const bootstrapService =
    require("../src/services/bootstrap.service")

const fundingService =
    require("../src/services/funding.service")

const transactionService =
    require("../src/services/transaction.service")

const reconciliationService =
    require("../src/services/reconciliation.service")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

describe("Reconciliation Service", () => {
    let systemUser
    let systemAccount
    let sourceUser
    let destinationUser
    let sourceAccount
    let destinationAccount

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

        sourceUser =
            await userModel.create({
                email: "reconcile-source@example.com",
                name: "Reconcile Source",
                password: "password123"
            })

        destinationUser =
            await userModel.create({
                email: "reconcile-destination@example.com",
                name: "Reconcile Destination",
                password: "password123"
            })

        sourceAccount =
            await accountModel.create({
                user: sourceUser._id,
                balanceMinor: 0,
                currency: "INR",
                status: "ACTIVE"
            })

        destinationAccount =
            await accountModel.create({
                user: destinationUser._id,
                balanceMinor: 0,
                currency: "INR",
                status: "ACTIVE"
            })

        /*
         * Put ₹1,500 into the system account through the
         * real bootstrap workflow.
         */
        await bootstrapService.bootstrapSystemFunds({
            user: systemUser,
            amount: 1500,
            idempotencyKey: "reconcile-boot-001"
        })

        /*
         * Fund the source customer account with ₹1,000
         * through the real initial-funding workflow.
         */
        await fundingService.createInitialFunding({
            user: systemUser,
            customerAccountId: sourceAccount._id,
            amount: 1000,
            idempotencyKey: "reconcile-fund-001"
        })
    })

    test("should report a balanced account after a successful transfer", async () => {
        await transactionService.createTransfer({
            user: sourceUser,
            fromAccountId: sourceAccount._id,
            toAccountId: destinationAccount._id,
            amount: 300,
            idempotencyKey: "reconcile-transfer-001"
        })

        const result =
            await reconciliationService.reconcileAccount(
                sourceAccount._id
            )

        expect(result.materializedBalance)
            .toBe(70000)

        expect(result.ledgerBalance)
            .toBe(70000)

        expect(result.difference)
            .toBe(0)

        expect(result.isBalanced)
            .toBe(true)
    })

    test("should report an imbalance when the materialized balance differs from the ledger", async () => {
        await transactionService.createTransfer({
            user: sourceUser,
            fromAccountId: sourceAccount._id,
            toAccountId: destinationAccount._id,
            amount: 300,
            idempotencyKey: "reconcile-transfer-002"
        })

        await accountModel.updateOne(
            {
                _id: sourceAccount._id
            },
            {
                $inc: {
                    balanceMinor: 1000
                }
            }
        )

        const result =
            await reconciliationService.reconcileAccount(
                sourceAccount._id
            )

        expect(result.materializedBalance)
            .toBe(71000)

        expect(result.ledgerBalance)
            .toBe(70000)

        expect(result.difference)
            .toBe(1000)

        expect(result.isBalanced)
            .toBe(false)
    })

    test("should report a balanced account with no transfer after initial funding", async () => {
        const result =
            await reconciliationService.reconcileAccount(
                sourceAccount._id
            )

        expect(result.materializedBalance)
            .toBe(100000)

        expect(result.ledgerBalance)
            .toBe(100000)

        expect(result.difference)
            .toBe(0)

        expect(result.isBalanced)
            .toBe(true)
    })

    test("should reject an invalid account ID", async () => {
        await expect(
            reconciliationService.reconcileAccount(
                "invalid-account-id"
            )
        ).rejects.toMatchObject({
            code: "INVALID_ACCOUNT_ID",
            statusCode: 400
        })
    })

    test("should reject a missing account", async () => {
        const mongoose =
            require("mongoose")

        const missingAccountId =
            new mongoose.Types.ObjectId()

        await expect(
            reconciliationService.reconcileAccount(
                missingAccountId
            )
        ).rejects.toMatchObject({
            code: "ACCOUNT_NOT_FOUND",
            statusCode: 404
        })
    })
})