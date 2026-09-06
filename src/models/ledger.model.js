const mongoose = require("mongoose")

const ledgerSchema = new mongoose.Schema(
    {
        account: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "account",
            required: [true, "Ledger must be associated with an account"],
            index: true,
            immutable: true
        },

        amountMinor: {
            type: Number,
            required: [true, "Amount is required for creating a ledger entry"],
            min: [1, "Ledger amount must be greater than zero"],
            immutable: true,
            validate: {
                validator: Number.isSafeInteger,
                message: "Ledger amount must be a safe integer"
            }
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
                message: "Type can be either CREDIT or DEBIT"
            },
            required: [true, "Ledger type is required"],
            immutable: true
        }
    },
    {
        timestamps: true
    }
)

/*
 * A transaction should normally produce exactly one debit
 * and one credit ledger entry.
 *
 * This prevents accidentally creating duplicate entries of
 * the same type for the same transaction/account combination.
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
 * No update/delete operation should be permitted after creation.
 */
function preventLedgerModification() {
    throw new Error(
        "Ledger entries are immutable and cannot be modified or deleted"
    )
}

ledgerSchema.pre("findOneAndUpdate", preventLedgerModification)
ledgerSchema.pre("updateOne", preventLedgerModification)
ledgerSchema.pre("updateMany", preventLedgerModification)

ledgerSchema.pre("deleteOne", preventLedgerModification)
ledgerSchema.pre("deleteMany", preventLedgerModification)

ledgerSchema.pre("findOneAndDelete", preventLedgerModification)
ledgerSchema.pre("findOneAndReplace", preventLedgerModification)

const ledgerModel = mongoose.model("ledger", ledgerSchema)

module.exports = ledgerModel