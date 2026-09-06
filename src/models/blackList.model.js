const mongoose = require("mongoose")

const tokenBlackListSchema = new mongoose.Schema(
    {
        token: {
            type: String,
            required: [
                true,
                "Token is required for blacklisting"
            ],
            unique: true,
            index: true
        },

        /*
         * Exact JWT expiration time.
         *
         * MongoDB TTL index automatically removes the
         * blacklist document after this time.
         */
        expiresAt: {
            type: Date,
            required: [
                true,
                "Token expiration time is required"
            ]
        }
    },
    {
        timestamps: true
    }
)

/*
 * Automatically remove expired blacklist entries.
 *
 * expireAfterSeconds: 0 means MongoDB removes the
 * document when expiresAt <= current time.
 */
tokenBlackListSchema.index(
    {
        expiresAt: 1
    },
    {
        expireAfterSeconds: 0
    }
)

const tokenBlackListModel = mongoose.model(
    "tokenBlacklist",
    tokenBlackListSchema
)

module.exports = tokenBlackListModel