const userModel = require("../src/models/user.model")
const accountModel = require("../src/models/account.model")
const transactionService = require("../src/services/transaction.service")
const reconciliationService = require("../src/services/reconciliation.service")

describe("Reconciliation Service", () => {
    let sourceUser
    let destinationUser
    let sourceAccount
    let destinationAccount

    beforeEach(async () => {
        sourceUser = await userModel.create({
            email: "reconcile-source@example.com",
            name: "Reconcile Source",
            password: "password123"
        })

        destinationUser = await userModel.create({
            email: "reconcile-destination@example.com",
            name: "Reconcile Destination",
            password: "password123"
        })

        sourceAccount = await accountModel.create({
            user: sourceUser._id,
            balanceMinor: 100000,
            currency: "INR"
        })

        destinationAccount = await accountModel.create({
            user: destinationUser._id,
            balanceMinor: 50000,
            currency: "INR"
        })
    })

    test("should report a balanced account after a successful transfer", async () => {
        await transactionService.createTransfer({
            user: sourceUser,
            fromAccountId: sourceAccount._id,
            toAccountId: destinationAccount._id,
            amount: 300,
            idempotencyKey: "reconcile-test-001"
        })

        const result =
            await reconciliationService.reconcileAccount(
                sourceAccount._id
            )

        expect(result.materializedBalance).toBe(70000)
        expect(result.ledgerBalance).toBe(70000)
        expect(result.difference).toBe(0)
        expect(result.isBalanced).toBe(true)
    })

    test("should report an imbalance when the materialized balance differs from the ledger", async () => {
        await transactionService.createTransfer({
            user: sourceUser,
            fromAccountId: sourceAccount._id,
            toAccountId: destinationAccount._id,
            amount: 300,
            idempotencyKey: "reconcile-test-002"
        })

        await accountModel.updateOne(
            { _id: sourceAccount._id },
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

        expect(result.materializedBalance).toBe(71000)
        expect(result.ledgerBalance).toBe(70000)
        expect(result.difference).toBe(1000)
        expect(result.isBalanced).toBe(false)
    })

    test("should return zero ledger balance for an account with no ledger entries", async () => {
        const result =
            await reconciliationService.reconcileAccount(
                sourceAccount._id
            )

        expect(result.materializedBalance).toBe(100000)
        expect(result.ledgerBalance).toBe(0)
        expect(result.difference).toBe(100000)
        expect(result.isBalanced).toBe(false)
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
        const mongoose = require("mongoose")

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