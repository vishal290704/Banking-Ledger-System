const mongoose = require("mongoose")

const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")

const AppError = require("../errors/AppError")

const MAX_TRANSACTION_RETRIES = 3

/**
 * Convert INR into paise.
 *
 * Examples:
 * 100      -> 10000
 * 100.50   -> 10050
 * 999.99   -> 99999
 */
function parseAmountToMinorUnits(amount) {
    if (amount === undefined || amount === null || amount === "") {
        throw new AppError(
            "Transaction amount is required",
            400,
            "INVALID_AMOUNT"
        )
    }

    if (typeof amount !== "number" && typeof amount !== "string") {
        throw new AppError(
            "Transaction amount must be a number",
            400,
            "INVALID_AMOUNT"
        )
    }

    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount)) {
        throw new AppError(
            "Transaction amount must be a valid number",
            400,
            "INVALID_AMOUNT"
        )
    }

    if (numericAmount <= 0) {
        throw new AppError(
            "Transaction amount must be greater than zero",
            400,
            "INVALID_AMOUNT"
        )
    }

    const amountMinor = Math.round(
        (numericAmount + Number.EPSILON) * 100
    )

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new AppError(
            "Transaction amount is outside the supported range",
            400,
            "INVALID_AMOUNT"
        )
    }

    const roundedAmount = amountMinor / 100

    if (
        Math.abs(numericAmount - roundedAmount) >
        Number.EPSILON
    ) {
        throw new AppError(
            "Transaction amount can have at most two decimal places",
            400,
            "INVALID_AMOUNT"
        )
    }

    return amountMinor
}

/**
 * Validate and normalize the idempotency key.
 */
function normalizeIdempotencyKey(idempotencyKey) {
    if (typeof idempotencyKey !== "string") {
        throw new AppError(
            "Idempotency key must be a string",
            400,
            "INVALID_IDEMPOTENCY_KEY"
        )
    }

    const key = idempotencyKey.trim()

    if (key.length < 8 || key.length > 128) {
        throw new AppError(
            "Idempotency key must contain between 8 and 128 characters",
            400,
            "INVALID_IDEMPOTENCY_KEY"
        )
    }

    return key
}

/**
 * Check whether MongoDB marked an error as a transient
 * transaction error.
 */
function isTransientTransactionError(error) {
    return (
        typeof error?.hasErrorLabel === "function" &&
        error.hasErrorLabel("TransientTransactionError")
    )
}

/**
 * Execute one complete transfer inside a MongoDB transaction.
 *
 * Every mutation belonging to the transfer must happen inside
 * the same transaction.
 */
async function executeTransferTransaction({
    fromAccountId,
    toAccountId,
    amountMinor,
    normalizedIdempotencyKey,
}) {
    const session = await mongoose.startSession()

    try {
        session.startTransaction()

        let transaction

        try {
            transaction = (
                await transactionModel.create(
                    [
                        {
                            fromAccount: fromAccountId,
                            toAccount: toAccountId,
                            amountMinor,
                            currency: "INR",
                            idempotencyKey: normalizedIdempotencyKey,
                            status: "PENDING"
                        }
                    ],
                    { session }
                )
            )[0]
        } catch (error) {
            /*
             * Another concurrent request may have created the same
             * idempotency key.
             */
            if (error?.code === 11000) {
                await session.abortTransaction()

                const duplicate =
                    await transactionModel.findOne({
                        idempotencyKey:
                            normalizedIdempotencyKey
                    })

                if (duplicate) {
                    return {
                        transaction: duplicate,
                        alreadyProcessed: true
                    }
                }
            }

            throw error
        }

        /*
         * Debit source account atomically.
         *
         * The balance check and deduction happen in the same
         * database operation.
         */
        const debitedAccount =
            await accountModel.findOneAndUpdate(
                {
                    _id: fromAccountId,
                    status: "ACTIVE",
                    currency: "INR",
                    balanceMinor: {
                        $gte: amountMinor
                    }
                },
                {
                    $inc: {
                        balanceMinor: -amountMinor
                    }
                },
                {
                    session,
                    returnDocument: "after"
                }
            )

        if (!debitedAccount) {
            throw new AppError(
                "Insufficient balance",
                400,
                "INSUFFICIENT_FUNDS"
            )
        }

        /*
         * Credit destination account.
         */
        const creditedAccount =
            await accountModel.findOneAndUpdate(
                {
                    _id: toAccountId,
                    status: "ACTIVE",
                    currency: "INR"
                },
                {
                    $inc: {
                        balanceMinor: amountMinor
                    }
                },
                {
                    session,
                    returnDocument: "after"
                }
            )

        if (!creditedAccount) {
            throw new AppError(
                "Destination account is not active",
                400,
                "DESTINATION_ACCOUNT_UNAVAILABLE"
            )
        }

        /*
         * Double-entry bookkeeping:
         *
         * Source      -> DEBIT
         * Destination -> CREDIT
         */
        await ledgerModel.create(
            [
                {
                    account: fromAccountId,
                    transaction: transaction._id,
                    amountMinor,
                    type: "DEBIT"
                },
                {
                    account: toAccountId,
                    transaction: transaction._id,
                    amountMinor,
                    type: "CREDIT"
                }
            ],
            {
                session,
                ordered: true
            }
        )

        transaction.status = "COMPLETED"

        await transaction.save({ session })

        await session.commitTransaction()

        return {
            transaction,
            alreadyProcessed: false
        }
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction()
        }

        throw error
    } finally {
        await session.endSession()
    }
}

/**
 * Create an account-to-account transfer.
 *
 * All financial mutations happen inside one MongoDB transaction.
 *
 * Transient MongoDB transaction errors are retried because they
 * can occur when concurrent transactions modify the same account.
 */
async function createTransfer({
    user,
    fromAccountId,
    toAccountId,
    amount,
    idempotencyKey
}) {
    if (!user?._id) {
        throw new AppError(
            "Authentication is required",
            401,
            "UNAUTHORIZED"
        )
    }

    if (
        !mongoose.isValidObjectId(fromAccountId) ||
        !mongoose.isValidObjectId(toAccountId)
    ) {
        throw new AppError(
            "Invalid source or destination account ID",
            400,
            "INVALID_ACCOUNT_ID"
        )
    }

    if (String(fromAccountId) === String(toAccountId)) {
        throw new AppError(
            "Source and destination accounts must be different",
            400,
            "SELF_TRANSFER_NOT_ALLOWED"
        )
    }

    const amountMinor = parseAmountToMinorUnits(amount)

    const normalizedIdempotencyKey =
        normalizeIdempotencyKey(idempotencyKey)

    /*
     * Fast path for an already-processed request.
     */
    const existingTransaction =
        await transactionModel.findOne({
            idempotencyKey: normalizedIdempotencyKey
        })

    if (existingTransaction) {
        return {
            transaction: existingTransaction,
            alreadyProcessed: true
        }
    }

    /*
     * Load accounts for early validation.
     */
    const [fromAccount, toAccount] =
        await Promise.all([
            accountModel.findById(fromAccountId),
            accountModel.findById(toAccountId)
        ])

    if (!fromAccount || !toAccount) {
        throw new AppError(
            "Invalid source or destination account",
            404,
            "ACCOUNT_NOT_FOUND"
        )
    }

    /*
     * Only the owner of the source account can transfer from it.
     */
    if (
        String(fromAccount.user) !==
        String(user._id)
    ) {
        throw new AppError(
            "You are not authorized to transfer from this account",
            403,
            "ACCOUNT_ACCESS_DENIED"
        )
    }

    if (
        fromAccount.status !== "ACTIVE" ||
        toAccount.status !== "ACTIVE"
    ) {
        throw new AppError(
            "Both accounts must be ACTIVE",
            400,
            "ACCOUNT_NOT_ACTIVE"
        )
    }

    /*
     * V1 supports INR only.
     */
    if (
        fromAccount.currency !== "INR" ||
        toAccount.currency !== "INR"
    ) {
        throw new AppError(
            "Only INR accounts are supported",
            400,
            "UNSUPPORTED_CURRENCY"
        )
    }

    if (
        fromAccount.currency !==
        toAccount.currency
    ) {
        throw new AppError(
            "Source and destination accounts must use the same currency",
            400,
            "CURRENCY_MISMATCH"
        )
    }

    /*
     * Retry the entire transaction when MongoDB reports
     * a transient transaction conflict.
     */
    for (
        let attempt = 1;
        attempt <= MAX_TRANSACTION_RETRIES;
        attempt++
    ) {
        try {
            return await executeTransferTransaction({
                fromAccountId,
                toAccountId,
                amountMinor,
                normalizedIdempotencyKey
            })
        } catch (error) {
            const shouldRetry =
                isTransientTransactionError(error) &&
                attempt < MAX_TRANSACTION_RETRIES

            if (!shouldRetry) {
                throw error
            }

            /*
             * Small backoff reduces the chance of immediately
             * colliding with the transaction that caused the
             * conflict.
             */
            await new Promise(resolve =>
                setTimeout(resolve, 50 * attempt)
            )
        }
    }

    /*
     * This point should never be reached because every attempt
     * either returns successfully or throws.
     */
    throw new AppError(
        "Transaction could not be completed",
        500,
        "TRANSACTION_RETRY_EXHAUSTED"
    )
}

module.exports = {
    createTransfer,
    parseAmountToMinorUnits,
    normalizeIdempotencyKey
}