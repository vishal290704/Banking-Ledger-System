const mongoose = require("mongoose")

const ledgerSchema = new mongoose.Schema(
    {
        account: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [
                true,
                "Ledger must be associated with an account"
            ],
            index: true,
            immutable: true
        },

        /*
         * Monetary values are stored in paise.
         *
         * ₹500.25 -> 50025
         */
        amountMinor: {
            type: Number,
            required: [
                true,
                "Ledger amount is required"
            ],
            min: [
                1,
                "Ledger amount must be greater than zero"
            ],
            validate: {
                validator: Number.isSafeInteger,
                message:
                    "Ledger amount must be a safe integer"
            },
            immutable: true
        },

        transaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "transaction",
            required: [
                true,
                "Ledger must be associated with a transaction"
            ],
            index: true,
            immutable: true
        },

        type: {
            type: String,
            enum: {
                values: ["CREDIT", "DEBIT"],
                message:
                    "Type can only be CREDIT or DEBIT"
            },
            required: [
                true,
                "Ledger type is required"
            ],
            immutable: true,
            index: true
        }
    },
    {
        timestamps: true
    }
)

/*
 * Prevent duplicate financial postings for the same
 * transaction/account/type combination.
 *
 * A normal transfer should produce:
 *
 *   Source Account → DEBIT
 *   Destination    → CREDIT
 */
ledgerSchema.index(
    {
        transaction: 1,
        account: 1,
        type: 1
    },
    {
        unique: true
    }
)

/*
 * Ledger entries are append-only.
 *
 * Financial history must not be modified or deleted
 * through normal application operations.
 */
function preventLedgerModification() {
    throw new Error(
        "Ledger entries are immutable and cannot be modified or deleted"
    )
}

ledgerSchema.pre(
    "findOneAndUpdate",
    preventLedgerModification
)

ledgerSchema.pre(
    "updateOne",
    preventLedgerModification
)

ledgerSchema.pre(
    "updateMany",
    preventLedgerModification
)

ledgerSchema.pre(
    "findOneAndDelete",
    preventLedgerModification
)

ledgerSchema.pre(
    "deleteOne",
    preventLedgerModification
)

ledgerSchema.pre(
    "deleteMany",
    preventLedgerModification
)

ledgerSchema.pre(
    "findOneAndReplace",
    preventLedgerModification
)

const ledgerModel = mongoose.model(
    "ledger",
    ledgerSchema
)

module.exports = ledgerModel