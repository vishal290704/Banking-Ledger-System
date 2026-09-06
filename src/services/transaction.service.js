const transactionService = require("../services/transaction.service")

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
                fromAccountId:
                    fromAccount,
                toAccountId:
                    toAccount,
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
    /*
     * We will implement this after we establish
     * the System Account model and its invariants.
     */
    return res.status(501).json({
        message:
            "Initial funds workflow will be implemented in the next milestone"
    })
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}