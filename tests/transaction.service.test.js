const mongoose = require("mongoose")

const transactionService = require("../src/services/transaction.service")

const userModel = require("../src/models/user.model")
const accountModel = require("../src/models/account.model")
const transactionModel = require("../src/models/transaction.model")
const ledgerModel = require("../src/models/ledger.model")

describe("Transaction Service", () => {
    let sourceUser
    let destinationUser
    let sourceAccount
    let destinationAccount

    beforeEach(async () => {
        sourceUser = await userModel.create({
            email: "source@example.com",
            name: "Source User",
            password: "password123"
        })

        destinationUser = await userModel.create({
            email: "destination@example.com",
            name: "Destination User",
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

    test("should successfully transfer money", async () => {
        const result =
            await transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 300,
                idempotencyKey: "transfer-test-001"
            })

        expect(result.alreadyProcessed).toBe(false)

        expect(
            result.transaction.status
        ).toBe("COMPLETED")

        expect(
            result.transaction.amountMinor
        ).toBe(30000)

        const updatedSource =
            await accountModel.findById(
                sourceAccount._id
            )

        const updatedDestination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(
            updatedSource.balanceMinor
        ).toBe(70000)

        expect(
            updatedDestination.balanceMinor
        ).toBe(80000)

        const ledgerEntries =
            await ledgerModel.find({
                transaction:
                    result.transaction._id
            })

        expect(ledgerEntries).toHaveLength(2)

        const debitEntry =
            ledgerEntries.find(
                entry => entry.type === "DEBIT"
            )

        const creditEntry =
            ledgerEntries.find(
                entry => entry.type === "CREDIT"
            )

        expect(debitEntry.amountMinor).toBe(30000)
        expect(creditEntry.amountMinor).toBe(30000)

        expect(
            debitEntry.account.toString()
        ).toBe(
            sourceAccount._id.toString()
        )

        expect(
            creditEntry.account.toString()
        ).toBe(
            destinationAccount._id.toString()
        )
    })

    test("should reject a transfer when balance is insufficient", async () => {
        await expect(
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 1500,
                idempotencyKey: "transfer-test-002"
            })
        ).rejects.toMatchObject({
            code: "INSUFFICIENT_FUNDS",
            statusCode: 400
        })

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(source.balanceMinor).toBe(100000)
        expect(destination.balanceMinor).toBe(50000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(0)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(0)
    })

    test("should reject unauthorized source account", async () => {
        await expect(
            transactionService.createTransfer({
                user: destinationUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100,
                idempotencyKey: "transfer-test-003"
            })
        ).rejects.toMatchObject({
            code: "ACCOUNT_ACCESS_DENIED",
            statusCode: 403
        })

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        expect(source.balanceMinor).toBe(100000)
    })

    test("should reject self transfer", async () => {
        await expect(
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: sourceAccount._id,
                amount: 100,
                idempotencyKey: "transfer-test-004"
            })
        ).rejects.toMatchObject({
            code: "SELF_TRANSFER_NOT_ALLOWED",
            statusCode: 400
        })
    })

    test("should reject zero or negative amounts", async () => {
        await expect(
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 0,
                idempotencyKey: "transfer-test-005"
            })
        ).rejects.toMatchObject({
            code: "INVALID_AMOUNT",
            statusCode: 400
        })

        await expect(
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: -100,
                idempotencyKey: "transfer-test-006"
            })
        ).rejects.toMatchObject({
            code: "INVALID_AMOUNT",
            statusCode: 400
        })
    })

    test("should reject amounts with more than two decimal places", async () => {
        await expect(
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100.999,
                idempotencyKey: "transfer-test-007"
            })
        ).rejects.toMatchObject({
            code: "INVALID_AMOUNT",
            statusCode: 400
        })
    })

    test("should return the same transaction for a repeated idempotency key", async () => {
        const first =
            await transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100,
                idempotencyKey: "transfer-test-008"
            })

        const second =
            await transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100,
                idempotencyKey: "transfer-test-008"
            })

        expect(first.alreadyProcessed).toBe(false)
        expect(second.alreadyProcessed).toBe(true)

        expect(
            second.transaction._id.toString()
        ).toBe(
            first.transaction._id.toString()
        )

        expect(
            await transactionModel.countDocuments()
        ).toBe(1)

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(source.balanceMinor).toBe(90000)
        expect(destination.balanceMinor).toBe(60000)
    })

    test("should correctly handle decimal INR amounts", async () => {
        const result =
            await transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100.50,
                idempotencyKey: "transfer-test-009"
            })

        expect(
            result.transaction.amountMinor
        ).toBe(10050)

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(source.balanceMinor).toBe(89950)
        expect(destination.balanceMinor).toBe(60050)
    })

    test("should prevent concurrent transfers from overspending the source account", async () => {
        const transferAmount = 800

        const results = await Promise.allSettled([
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: transferAmount,
                idempotencyKey: "concurrent-test-001"
            }),

            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: transferAmount,
                idempotencyKey: "concurrent-test-002"
            })
        ])

        const successfulTransfers = results.filter(
            result => result.status === "fulfilled"
        )

        const failedTransfers = results.filter(
            result => result.status === "rejected"
        )

        expect(successfulTransfers).toHaveLength(1)
        expect(failedTransfers).toHaveLength(1)

        expect(failedTransfers[0].reason).toMatchObject({
            code: "INSUFFICIENT_FUNDS",
            statusCode: 400
        })

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        expect(source.balanceMinor).toBe(20000)
        expect(destination.balanceMinor).toBe(130000)

        expect(
            await transactionModel.countDocuments()
        ).toBe(1)

        expect(
            await ledgerModel.countDocuments()
        ).toBe(2)
    })
        test("should process a concurrent request with the same idempotency key only once", async () => {
        const results = await Promise.allSettled([
            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100,
                idempotencyKey: "same-key-001"
            }),

            transactionService.createTransfer({
                user: sourceUser,
                fromAccountId: sourceAccount._id,
                toAccountId: destinationAccount._id,
                amount: 100,
                idempotencyKey: "same-key-001"
            })
        ])

        const successfulResults = results.filter(
            result => result.status === "fulfilled"
        )

        const failedResults = results.filter(
            result => result.status === "rejected"
        )

        /*
         * Both callers should ultimately succeed from the API's
         * point of view: one performs the transfer and the other
         * receives the already-processed transaction.
         */
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

        const source =
            await accountModel.findById(
                sourceAccount._id
            )

        const destination =
            await accountModel.findById(
                destinationAccount._id
            )

        /*
         * ₹100 should be transferred exactly once.
         */
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
})