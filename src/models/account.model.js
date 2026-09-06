const mongoose = require("mongoose")
const ledgerModel = require("./ledger.model")

const accountSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: [true, "Account must be associated with a user"],
            index: true,
            immutable: true
        },

        status: {
            type: String,
            enum: {
                values: ["ACTIVE", "FROZEN", "CLOSED"],
                message:
                    "Status can be ACTIVE, FROZEN or CLOSED"
            },
            default: "ACTIVE",
            index: true
        },

        /*
         * V1 supports INR only.
         */
        currency: {
            type: String,
            enum: {
                values: ["INR"],
                message: "Only INR accounts are supported"
            },
            default: "INR",
            required: true,
            uppercase: true,
            trim: true,
            immutable: true
        },

        /*
         * All monetary values are stored in paise.
         *
         * ₹1      -> 100
         * ₹100.50 -> 10050
         *
         * balanceMinor is the current materialized balance.
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

/*
 * Useful for listing and querying user accounts.
 */
accountSchema.index({
    user: 1,
    status: 1
})

accountSchema.index({
    user: 1,
    currency: 1
})

/*
 * Return the current materialized balance.
 */
accountSchema.methods.getBalance = function () {
    return this.balanceMinor
}

/*
 * Check whether this account belongs to the system user.
 *
 * The user document is populated only when this helper is used.
 */
accountSchema.methods.isSystemAccount = async function () {
    await this.populate({
        path: "user",
        select: "+systemUser"
    })

    return this.user?.systemUser === true
}

/*
 * Calculate the balance from the immutable ledger.
 *
 * This is intended for reconciliation/audit purposes,
 * not for every transaction.
 */
accountSchema.methods.getLedgerBalance = async function (
    session = null
) {
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
                    $subtract: [
                        "$totalCredit",
                        "$totalDebit"
                    ]
                }
            }
        }
    ]

    const aggregate = ledgerModel.aggregate(pipeline)

    if (session) {
        aggregate.session(session)
    }

    const result = await aggregate

    if (result.length === 0) {
        return 0
    }

    return result[0].balanceMinor
}

const accountModel = mongoose.model(
    "account",
    accountSchema
)

module.exports = accountModel