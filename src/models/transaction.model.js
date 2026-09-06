const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema(
    {
        fromAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [
                true,
                "Transaction must be associated with a source account"
            ],
            index: true,
            immutable: true
        },

        toAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [
                true,
                "Transaction must be associated with a destination account"
            ],
            index: true,
            immutable: true
        },

        /*
         * Defines the business purpose of the transaction.
         *
         * TRANSFER:
         * Normal account-to-account customer transfer.
         *
         * INITIAL_FUNDING:
         * System-originated funding of a customer account.
         */
        type: {
            type: String,
            enum: {
                values: [
                    "TRANSFER",
                    "INITIAL_FUNDING"
                ],
                message:
                    "Type can be TRANSFER or INITIAL_FUNDING"
            },
            default: "TRANSFER",
            required: true,
            immutable: true,
            index: true
        },

        status: {
            type: String,
            enum: {
                values: [
                    "PENDING",
                    "COMPLETED",
                    "FAILED",
                    "REVERSED"
                ],
                message:
                    "Status can be PENDING, COMPLETED, FAILED or REVERSED"
            },
            default: "PENDING",
            index: true
        },

        /*
         * V1 supports INR only.
         *
         * Amount is stored in paise.
         *
         * ₹500.25 -> 50025
         */
        amountMinor: {
            type: Number,
            required: [
                true,
                "Transaction amount is required"
            ],
            min: [
                1,
                "Transaction amount must be greater than zero"
            ],
            validate: {
                validator: Number.isSafeInteger,
                message:
                    "Transaction amount must be a safe integer"
            },
            immutable: true
        },

        currency: {
            type: String,
            enum: {
                values: ["INR"],
                message: "Only INR transactions are supported"
            },
            default: "INR",
            required: true,
            uppercase: true,
            trim: true,
            immutable: true
        },

        /*
         * Prevent duplicate processing when a client retries
         * the same request.
         */
        idempotencyKey: {
            type: String,
            required: [
                true,
                "Idempotency key is required"
            ],
            unique: true,
            index: true,
            trim: true,
            minlength: [
                8,
                "Idempotency key is too short"
            ],
            maxlength: [
                128,
                "Idempotency key is too long"
            ],
            immutable: true
        }
    },
    {
        timestamps: true
    }
)

/*
 * Transaction history lookup indexes.
 */
transactionSchema.index({
    fromAccount: 1,
    createdAt: -1
})

transactionSchema.index({
    toAccount: 1,
    createdAt: -1
})

/*
 * Useful for auditing and filtering transactions
 * by their business purpose.
 */
transactionSchema.index({
    type: 1,
    createdAt: -1
})

const transactionModel = mongoose.model(
    "transaction",
    transactionSchema
)

module.exports = transactionModel