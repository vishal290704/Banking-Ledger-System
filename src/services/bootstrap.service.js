const mongoose = require("mongoose")

const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")

const AppError = require("../errors/AppError")

const MAX_TRANSACTION_RETRIES = 3

function parseAmountToMinorUnits(amount) {
    if (amount === undefined || amount === null || amount === "") {
        throw new AppError(
            "Bootstrap amount is required",
            400,
            "INVALID_AMOUNT"
        )
    }

    if (typeof amount !== "number" && typeof amount !== "string") {
        throw new AppError(
            "Bootstrap amount must be a number",
            400,
            "INVALID_AMOUNT"
        )
    }

    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new AppError(
            "Bootstrap amount must be greater than zero",
            400,
            "INVALID_AMOUNT"
        )
    }

    const amountMinor = Math.round(
        (numericAmount + Number.EPSILON) * 100
    )

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new AppError(
            "Bootstrap amount is outside the supported range",
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
            "Bootstrap amount can have at most two decimal places",
            400,
            "INVALID_AMOUNT"
        )
    }

    return amountMinor
}

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

function isTransientTransactionError(error) {
    return (
        typeof error?.hasErrorLabel === "function" &&
        error.hasErrorLabel("TransientTransactionError")
    )
}

/**
 * Add externally sourced funds to the system account.
 *
 * This operation creates:
 *
 * BOOTSTRAP_FUNDING transaction
 * + system account CREDIT ledger entry
 *
 * There is intentionally no fromAccount because the source
 * of the money is external to this ledger system.
 */
async function executeBootstrapTransaction({
    systemAccountId,
    amountMinor,
    normalizedIdempotencyKey
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
                            fromAccount: undefined,
                            toAccount: systemAccountId,
                            amountMinor,
                            currency: "INR",
                            idempotencyKey:
                                normalizedIdempotencyKey,
                            type: "BOOTSTRAP_FUNDING",
                            status: "PENDING"
                        }
                    ],
                    { session }
                )
            )[0]
        } catch (error) {
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

        const creditedSystemAccount =
            await accountModel.findOneAndUpdate(
                {
                    _id: systemAccountId,
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

        if (!creditedSystemAccount) {
            throw new AppError(
                "System account is not available",
                500,
                "SYSTEM_ACCOUNT_UNAVAILABLE"
            )
        }

        /*
         * A bootstrap transaction represents money entering
         * the system, so the system account receives a CREDIT.
         */
        await ledgerModel.create(
            [
                {
                    account: systemAccountId,
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

async function bootstrapSystemFunds({
    user,
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

    if (user.systemUser !== true) {
        throw new AppError(
            "Only a system user can bootstrap system funds",
            403,
            "SYSTEM_USER_REQUIRED"
        )
    }

    const amountMinor =
        parseAmountToMinorUnits(amount)

    const normalizedIdempotencyKey =
        normalizeIdempotencyKey(idempotencyKey)

    const existingTransaction =
        await transactionModel.findOne({
            idempotencyKey:
                normalizedIdempotencyKey
        })

    if (existingTransaction) {
        if (
            existingTransaction.type !==
            "BOOTSTRAP_FUNDING"
        ) {
            throw new AppError(
                "Idempotency key is already associated with another transaction",
                409,
                "IDEMPOTENCY_KEY_CONFLICT"
            )
        }

        return {
            transaction: existingTransaction,
            alreadyProcessed: true
        }
    }

    const systemAccount =
        await accountModel.findOne({
            user: user._id,
            currency: "INR"
        })

    if (!systemAccount) {
        throw new AppError(
            "System account not found",
            500,
            "SYSTEM_ACCOUNT_NOT_FOUND"
        )
    }

    if (systemAccount.status !== "ACTIVE") {
        throw new AppError(
            "System account is not active",
            500,
            "SYSTEM_ACCOUNT_UNAVAILABLE"
        )
    }

    for (
        let attempt = 1;
        attempt <= MAX_TRANSACTION_RETRIES;
        attempt++
    ) {
        try {
            return await executeBootstrapTransaction({
                systemAccountId: systemAccount._id,
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

            await new Promise(resolve =>
                setTimeout(resolve, 50 * attempt)
            )
        }
    }

    throw new AppError(
        "System funding could not be completed",
        500,
        "BOOTSTRAP_RETRY_EXHAUSTED"
    )
}

module.exports = {
    bootstrapSystemFunds,
    parseAmountToMinorUnits,
    normalizeIdempotencyKey
}