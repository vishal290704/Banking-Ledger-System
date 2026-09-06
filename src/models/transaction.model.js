const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema(
    {
        /*
         * Source account.
         *
         * Required for:
         * - TRANSFER
         * - INITIAL_FUNDING
         *
         * Not required for:
         * - BOOTSTRAP_FUNDING
         *
         * A bootstrap funding operation represents money entering
         * the system from an external source.
         */
        fromAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            index: true,
            immutable: true
        },

        /*
         * Destination account.
         *
         * Every transaction must have a destination account.
         */
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
         *
         * BOOTSTRAP_FUNDING:
         * External funding entering the system account.
         */
        type: {
            type: String,
            enum: {
                values: [
                    "TRANSFER",
                    "INITIAL_FUNDING",
                    "BOOTSTRAP_FUNDING"
                ],
                message:
                    "Type can be TRANSFER, INITIAL_FUNDING or BOOTSTRAP_FUNDING"
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
 * Validate account relationships based on transaction type.
 *
 * TRANSFER:
 *     fromAccount -> required
 *     toAccount   -> required
 *
 * INITIAL_FUNDING:
 *     fromAccount -> required
 *     toAccount   -> required
 *
 * BOOTSTRAP_FUNDING:
 *     fromAccount -> must be absent
 *     toAccount   -> required
 */
transactionSchema.pre("validate", function () {
    if (
        this.type === "TRANSFER" ||
        this.type === "INITIAL_FUNDING"
    ) {
        if (!this.fromAccount) {
            this.invalidate(
                "fromAccount",
                `${this.type} transaction requires a source account`
            )
        }

        if (!this.toAccount) {
            this.invalidate(
                "toAccount",
                `${this.type} transaction requires a destination account`
            )
        }

        return
    }

    if (this.type === "BOOTSTRAP_FUNDING") {
        if (this.fromAccount) {
            this.invalidate(
                "fromAccount",
                "BOOTSTRAP_FUNDING transaction cannot have a source account"
            )
        }

        if (!this.toAccount) {
            this.invalidate(
                "toAccount",
                "BOOTSTRAP_FUNDING transaction requires a destination account"
            )
        }
    }
})

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