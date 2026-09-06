const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

/**
 * Convert a user-facing amount into the smallest currency unit.
 *
 * Example:
 * 100      -> 10000
 * 100.50   -> 10050
 * "100.50" -> 10050
 *
 * Current project assumes INR, where 1 rupee = 100 paise.
 */
function parseAmountToMinorUnits(amount) {
    if (amount === undefined || amount === null || amount === "") {
        return null
    }

    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount)) {
        return null
    }

    if (numericAmount <= 0) {
        return null
    }

    const amountMinor = Math.round(
        (numericAmount + Number.EPSILON) * 100
    )

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        return null
    }

    /*
     * Reject values containing more than two decimal places.
     *
     * Examples:
     * 100.50 -> valid
     * 100.99 -> valid
     * 100.999 -> invalid
     */
    const roundedBack = amountMinor / 100

    if (Math.abs(numericAmount - roundedBack) > Number.EPSILON) {
        return null
    }

    return amountMinor
}

async function createTransaction(req, res, next) {
    const {
        fromAccount,
        toAccount,
        amount,
        idempotencyKey
    } = req.body

    /*
     * Basic validation
     */
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

    /*
     * Validate ObjectIds before querying MongoDB.
     */
    if (
        !mongoose.isValidObjectId(fromAccount) ||
        !mongoose.isValidObjectId(toAccount)
    ) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    /*
     * A user must never transfer money to the same account.
     */
    if (String(fromAccount) === String(toAccount)) {
        return res.status(400).json({
            message: "Source and destination accounts must be different"
        })
    }

    /*
     * Convert rupees -> paise.
     */
    const amountMinor = parseAmountToMinorUnits(amount)

    if (amountMinor === null) {
        return res.status(400).json({
            message:
                "Amount must be a positive number with at most two decimal places"
        })
    }

    const normalizedIdempotencyKey = String(idempotencyKey).trim()

    if (
        normalizedIdempotencyKey.length < 8 ||
        normalizedIdempotencyKey.length > 128
    ) {
        return res.status(400).json({
            message:
                "Idempotency key must contain between 8 and 128 characters"
        })
    }

    /*
     * Fast path.
     *
     * This is NOT the correctness mechanism by itself.
     * The unique database constraint also protects us against
     * concurrent requests using the same idempotency key.
     */
    const existingTransaction = await transactionModel.findOne({
        idempotencyKey: normalizedIdempotencyKey
    })

    if (existingTransaction) {
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: existingTransaction
        })
    }

    /*
     * Load accounts outside the transaction for inexpensive
     * validation and ownership checks.
     */
    const [fromUserAccount, toUserAccount] = await Promise.all([
        accountModel.findById(fromAccount),
        accountModel.findById(toAccount)
    ])

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    /*
     * CRITICAL SECURITY CHECK:
     *
     * The authenticated user must own the source account.
     *
     * req.user is expected to be populated by authMiddleware.
     */
    if (
        !req.user ||
        !req.user._id ||
        String(fromUserAccount.user) !== String(req.user._id)
    ) {
        return res.status(403).json({
            message: "You are not authorized to transfer from this account"
        })
    }

    /*
     * Both accounts must be active.
     */
    if (
        fromUserAccount.status !== "ACTIVE" ||
        toUserAccount.status !== "ACTIVE"
    ) {
        return res.status(400).json({
            message: "Both accounts must be ACTIVE"
        })
    }

    /*
     * Financial transactions should not silently move money
     * between different currencies.
     */
    if (fromUserAccount.currency !== toUserAccount.currency) {
        return res.status(400).json({
            message: "Source and destination accounts must use the same currency"
        })
    }

    const currency = fromUserAccount.currency

    let session

    try {
        session = await mongoose.startSession()
        session.startTransaction()

        /*
         * Create the transaction FIRST.
         *
         * The idempotency unique index provides the final concurrency
         * guarantee if two requests arrive with the same key.
         */
        let transaction

        try {
            transaction = (
                await transactionModel.create(
                    [
                        {
                            fromAccount,
                            toAccount,
                            amountMinor,
                            currency,
                            idempotencyKey: normalizedIdempotencyKey,
                            status: "PENDING"
                        }
                    ],
                    { session }
                )
            )[0]
        } catch (createError) {
            /*
             * Concurrent request with the same idempotency key.
             */
            if (createError?.code === 11000) {
                await session.abortTransaction()

                const duplicateTransaction =
                    await transactionModel.findOne({
                        idempotencyKey: normalizedIdempotencyKey
                    })

                if (duplicateTransaction) {
                    return res.status(200).json({
                        message: "Transaction already processed",
                        transaction: duplicateTransaction
                    })
                }
            }

            throw createError
        }

        /*
         * IMPORTANT CONCURRENCY CONTROL
         *
         * We do NOT perform:
         *
         *   balance = account.getBalance()
         *   if balance >= amount
         *
         * because two transactions can both pass that check.
         *
         * Instead, the database atomically performs:
         *
         *   balance >= amount
         *   AND
         *   balance = balance - amount
         *
         * as one update.
         */
        const debitedAccount = await accountModel.findOneAndUpdate(
            {
                _id: fromAccount,
                status: "ACTIVE",
                currency,
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
                new: true
            }
        )

        if (!debitedAccount) {
            transaction.status = "FAILED"
            await transaction.save({ session })

            throw new Error(
                "Insufficient balance or source account is no longer active"
            )
        }

        /*
         * Credit the destination account.
         *
         * We verify that the account is still active inside the same
         * transaction.
         */
        const creditedAccount = await accountModel.findOneAndUpdate(
            {
                _id: toAccount,
                status: "ACTIVE",
                currency
            },
            {
                $inc: {
                    balanceMinor: amountMinor
                }
            },
            {
                session,
                new: true
            }
        )

        if (!creditedAccount) {
            transaction.status = "FAILED"
            await transaction.save({ session })

            throw new Error(
                "Destination account is no longer active or has an invalid currency"
            )
        }

        /*
         * Create immutable ledger entries.
         */
        await ledgerModel.create(
            [
                {
                    account: fromAccount,
                    amountMinor,
                    transaction: transaction._id,
                    type: "DEBIT"
                },
                {
                    account: toAccount,
                    amountMinor,
                    transaction: transaction._id,
                    type: "CREDIT"
                }
            ],
            {
                session
            }
        )

        /*
         * Transaction is complete only after:
         *
         * - debit succeeds
         * - credit succeeds
         * - ledger entries exist
         */
        transaction.status = "COMPLETED"

        await transaction.save({ session })

        await session.commitTransaction()

        /*
         * Email is intentionally outside the financial transaction.
         *
         * Failure to send an email must never rollback a successful
         * financial transfer.
         */
        if (req.user?.email) {
            try {
                await emailService.sendTransactionEmail(
                    req.user.email,
                    req.user.name,
                    amountMinor / 100,
                    toUserAccount._id
                )
            } catch (emailError) {
                console.error(
                    "Transaction email failed:",
                    emailError
                )
            }
        }

        return res.status(201).json({
            message: "Transaction processed successfully",
            transaction
        })
    } catch (error) {
        if (session?.inTransaction()) {
            await session.abortTransaction()
        }


        //  * Handle duplicate idempotency key at the database level.
         
        if (error?.code === 11000) {
            const duplicateTransaction =
                await transactionModel.findOne({
                    idempotencyKey: normalizedIdempotencyKey
                })

            if (duplicateTransaction) {
                return res.status(200).json({
                    message: "Transaction already processed",
                    transaction: duplicateTransaction
                })
            }
        }

        /*
         * Business error: insufficient balance.
         */
        if (
            error?.message ===
            "Insufficient balance or source account is no longer active"
        ) {
            return res.status(400).json({
                message: "Insufficient balance"
            })
        }

        console.error("Transaction creation failed:", error)

        /*
         * Let the centralized error middleware handle unexpected
         * infrastructure/application errors.
         */
        return next(error)
    } finally {
        await session?.endSession()
    }
}

async function createInitialFundsTransaction(req, res, next) {
    /*
     * We are intentionally not implementing the initial-funds
     * workflow in this first patch.
     *
     * It needs the complete system-user/account model and should
     * go through the exact same ledger + balance invariants.
     */
    return res.status(501).json({
        message: "Initial funds workflow will be implemented in the next milestone"
    })
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction
}