const transactionService = require("../services/transaction.service")
const fundingService = require("../services/funding.service")

async function createTransaction(req, res, next) {
    try {
        const {
            fromAccount,
            toAccount,
            amount,
            idempotencyKey
        } = req.body

        if (
            !fromAccount ||
            !toAccount ||
            amount === undefined ||
            amount === null ||
            !idempotencyKey
        ) {
            return res.status(400).json({
                message:
                    "fromAccount, toAccount, amount and idempotencyKey are required"
            })
        }

        const result =
            await transactionService.createTransfer({
                user: req.user,
                fromAccountId: fromAccount,
                toAccountId: toAccount,
                amount,
                idempotencyKey
            })

        return res
            .status(
                result.alreadyProcessed
                    ? 200
                    : 201
            )
            .json({
                message:
                    result.alreadyProcessed
                        ? "Transaction already processed"
                        : "Transaction processed successfully",
                transaction:
                    result.transaction
            })
    } catch (error) {
        return next(error)
    }
}

async function createInitialFundsTransaction(
    req,
    res,
    next
) {
    try {
        const {
            customerAccountId,
            amount,
            idempotencyKey
        } = req.body

        if (
            !customerAccountId ||
            amount === undefined ||
            amount === null ||
            !idempotencyKey
        ) {
            return res.status(400).json({
                message:
                    "customerAccountId, amount and idempotencyKey are required"
            })
        }

        const result =
            await fundingService.createInitialFunding({
                user: req.user,
                customerAccountId,
                amount,
                idempotencyKey
            })

        return res
            .status(
                result.alreadyProcessed
                    ? 200
                    : 201
            )
            .json({
                message:
                    result.alreadyProcessed
                        ? "Initial funding already processed"
                        : "Initial funding processed successfully",
                transaction:
                    result.transaction
            })
    } catch (error) {
        return next(error)
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}