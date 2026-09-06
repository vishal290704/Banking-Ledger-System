const mongoose = require("mongoose")

const tokenBlackListSchema = new mongoose.Schema(
    {
        token: {
            type: String,
            required: [true, "Token is required for blacklisting"],
            unique: true,
            index: true
        },

        /*
         * The exact time at which the JWT expires.
         *
         * MongoDB's TTL index will automatically remove the blacklist
         * document after this time.
         */
        expiresAt: {
            type: Date,
            required: [true, "Token expiration time is required"]
        }
    },
    {
        timestamps: true
    }
)

/*
 * Automatically delete expired blacklist entries.
 *
 * MongoDB removes the document once expiresAt is reached.
 */
tokenBlackListSchema.index(
    { expiresAt: 1 },
    {
        expireAfterSeconds: 0
    }
)

const tokenBlackListModel = mongoose.model(
    "tokenBlacklist",
    tokenBlackListSchema
)

module.exports = tokenBlackListModel