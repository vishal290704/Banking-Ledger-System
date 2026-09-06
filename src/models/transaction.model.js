const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema(
    {
        fromAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [true, "Transaction must be associated with a from account"],
            index: true
        },

        toAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [true, "Transaction must be associated with a to account"],
            index: true
        },

        status: {
            type: String,
            enum: {
                values: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
                message:
                    "Status can be either PENDING, COMPLETED, FAILED or REVERSED"
            },
            default: "PENDING",
            index: true
        },

        /*
         * Amount is stored in the smallest currency unit.
         *
         * Example:
         * ₹500.25 -> 50025
         */
        amountMinor: {
            type: Number,
            required: [true, "Amount is required for creating a transaction"],
            min: [1, "Transaction amount must be greater than zero"],
            validate: {
                validator: Number.isSafeInteger,
                message: "Transaction amount must be a safe integer"
            }
        },

        currency: {
            type: String,
            required: [true, "Transaction currency is required"],
            uppercase: true,
            trim: true,
            default: "INR"
        },

        idempotencyKey: {
            type: String,
            required: [
                true,
                "Idempotency key is required for creating a transaction"
            ],
            unique: true,
            index: true,
            trim: true,
            minlength: 8,
            maxlength: 128
        }
    },
    {
        timestamps: true
    }
)

transactionSchema.index({
    fromAccount: 1,
    createdAt: -1
})

transactionSchema.index({
    toAccount: 1,
    createdAt: -1
})

const transactionModel = mongoose.model(
    "transaction",
    transactionSchema
)

module.exports = transactionModel