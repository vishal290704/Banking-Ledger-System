const mongoose = require("mongoose")

const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")

const AppError = require("../errors/AppError")

const MAX_TRANSACTION_RETRIES = 3

/**
 * Parse an INR amount and convert it to paise.
 *
 * ₹100      -> 10000
 * ₹100.50   -> 10050
 */
function parseAmountToMinorUnits(amount) {
    if (amount === undefined || amount === null || amount === "") {
        throw new AppError(
            "Funding amount is required",
            400,
            "INVALID_AMOUNT"
        )
    }

    if (typeof amount !== "number" && typeof amount !== "string") {
        throw new AppError(
            "Funding amount must be a number",
            400,
            "INVALID_AMOUNT"
        )
    }

    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount)) {
        throw new AppError(
            "Funding amount must be a valid number",
            400,
            "INVALID_AMOUNT"
        )
    }

    if (numericAmount <= 0) {
        throw new AppError(
            "Funding amount must be greater than zero",
            400,
            "INVALID_AMOUNT"
        )
    }

    const amountMinor = Math.round(
        (numericAmount + Number.EPSILON) * 100
    )

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new AppError(
            "Funding amount is outside the supported range",
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
            "Funding amount can have at most two decimal places",
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
 * Execute one complete initial-funding transaction.
 *
 * System account -> Customer account
 *
 * Both balance changes and both ledger entries are committed
 * atomically.
 */
async function executeInitialFundingTransaction({
    systemAccountId,
    customerAccountId,
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
                            fromAccount: systemAccountId,
                            toAccount: customerAccountId,
                            amountMinor,
                            currency: "INR",
                            idempotencyKey: normalizedIdempotencyKey,
                            type: "INITIAL_FUNDING",
                            status: "PENDING"
                        }
                    ],
                    { session }
                )
            )[0]
        } catch (error) {
            /*
             * Another request may have already created the
             * same idempotency key.
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
         * Debit the system account atomically.
         *
         * This prevents the system from funding more money
         * than it currently holds.
         */
        const debitedSystemAccount =
            await accountModel.findOneAndUpdate(
                {
                    _id: systemAccountId,
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

        if (!debitedSystemAccount) {
            throw new AppError(
                "System account has insufficient funds",
                400,
                "SYSTEM_INSUFFICIENT_FUNDS"
            )
        }

        /*
         * Credit the customer account atomically.
         */
        const creditedCustomerAccount =
            await accountModel.findOneAndUpdate(
                {
                    _id: customerAccountId,
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

        if (!creditedCustomerAccount) {
            throw new AppError(
                "Customer account is not active",
                400,
                "DESTINATION_ACCOUNT_UNAVAILABLE"
            )
        }

        /*
         * Double-entry ledger:
         *
         * System account  -> DEBIT
         * Customer account -> CREDIT
         */
        await ledgerModel.create(
            [
                {
                    account: systemAccountId,
                    transaction: transaction._id,
                    amountMinor,
                    type: "DEBIT"
                },
                {
                    account: customerAccountId,
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
 * Fund a customer account from the system account.
 *
 * Only a caller that has already passed the system-user
 * authorization middleware should invoke this service.
 */
async function createInitialFunding({
    user,
    customerAccountId,
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
            "Only a system user can create initial funds",
            403,
            "SYSTEM_USER_REQUIRED"
        )
    }

    if (!mongoose.isValidObjectId(customerAccountId)) {
        throw new AppError(
            "Invalid customer account ID",
            400,
            "INVALID_ACCOUNT_ID"
        )
    }

    const amountMinor =
        parseAmountToMinorUnits(amount)

    const normalizedIdempotencyKey =
        normalizeIdempotencyKey(idempotencyKey)

    /*
     * Fast idempotency path.
     */
    const existingTransaction =
        await transactionModel.findOne({
            idempotencyKey: normalizedIdempotencyKey
        })

    if (existingTransaction) {
        if (existingTransaction.type !== "INITIAL_FUNDING") {
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

    /*
     * Load the customer account for early validation.
     */
    const customerAccount =
        await accountModel.findById(
            customerAccountId
        )

    if (!customerAccount) {
        throw new AppError(
            "Customer account not found",
            404,
            "ACCOUNT_NOT_FOUND"
        )
    }

    if (customerAccount.status !== "ACTIVE") {
        throw new AppError(
            "Customer account is not active",
            400,
            "ACCOUNT_NOT_ACTIVE"
        )
    }

    if (customerAccount.currency !== "INR") {
        throw new AppError(
            "Only INR accounts are supported",
            400,
            "UNSUPPORTED_CURRENCY"
        )
    }

    /*
     * Find the system account belonging to the
     * authenticated system user.
     */
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
            return await executeInitialFundingTransaction({
                systemAccountId: systemAccount._id,
                customerAccountId,
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
        "Initial funding could not be completed",
        500,
        "FUNDING_RETRY_EXHAUSTED"
    )
}

module.exports = {
    createInitialFunding,
    parseAmountToMinorUnits,
    normalizeIdempotencyKey
}