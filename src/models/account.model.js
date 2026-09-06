const mongoose = require("mongoose")
const ledgerModel = require("./ledger.model")

const accountSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: [true, "Account must be associated with a user"],
            index: true
        },

        status: {
            type: String,
            enum: {
                values: ["ACTIVE", "FROZEN", "CLOSED"],
                message: "Status can be either ACTIVE, FROZEN or CLOSED"
            },
            default: "ACTIVE",
            index: true
        },

        currency: {
            type: String,
            required: [true, "Currency is required for creating an account"],
            default: "INR",
            uppercase: true,
            trim: true
        },

        /*
         * Monetary values are stored in the smallest currency unit.
         *
         * Example:
         * ₹100.50 -> 10050 paise
         *
         * This avoids floating-point precision problems.
         *
         * This value is a materialized/cached balance.
         * The immutable ledger remains the audit trail.
         */
        balanceMinor: {
            type: Number,
            required: true,
            default: 0,
            min: [0, "Account balance cannot be negative"],
            validate: {
                validator: Number.isSafeInteger,
                message: "Account balance must be a safe integer"
            }
        }
    },
    {
        timestamps: true
    }
)

accountSchema.index({ user: 1, status: 1 })
accountSchema.index({ user: 1, currency: 1 })

/*
 * Returns the current materialized balance in minor units.
 *
 * Example:
 * 10050 => ₹100.50
 */
accountSchema.methods.getBalance = async function () {
    return this.balanceMinor
}

/*
 * This method is useful for verification/reconciliation.
 *
 * It calculates the balance from the immutable ledger and can be
 * compared against balanceMinor to detect inconsistencies.
 */
accountSchema.methods.getLedgerBalance = async function (session = null) {
    const pipeline = [
        {
            $match: {
                account: this._id
            }
        },
        {
            $group: {
                _id: null,

                totalDebit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "DEBIT"] },
                            "$amountMinor",
                            0
                        ]
                    }
                },

                totalCredit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "CREDIT"] },
                            "$amountMinor",
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                balanceMinor: {
                    $subtract: ["$totalCredit", "$totalDebit"]
                }
            }
        }
    ]

    const query = ledgerModel.aggregate(pipeline)

    if (session) {
        query.session(session)
    }

    const balanceData = await query

    if (balanceData.length === 0) {
        return 0
    }

    return balanceData[0].balanceMinor
}

const accountModel = mongoose.model("account", accountSchema)

module.exports = accountModel