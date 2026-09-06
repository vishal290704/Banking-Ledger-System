const mongoose = require("mongoose")
const accountModel = require("../models/account.model")

/**
 * Create a new bank account for the authenticated user.
 */
async function createAccountController(req, res, next) {
    try {
        if (!req.user?._id) {
            return res.status(401).json({
                message: "Unauthorized"
            })
        }

        const account = await accountModel.create({
            user: req.user._id
        })

        return res.status(201).json({
            message: "Account created successfully",
            account
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * Get all accounts belonging to the authenticated user.
 */
async function getUserAccountsController(req, res, next) {
    try {
        if (!req.user?._id) {
            return res.status(401).json({
                message: "Unauthorized"
            })
        }

        const accounts = await accountModel
            .find({
                user: req.user._id
            })
            .sort({ createdAt: -1 })

        return res.status(200).json({
            accounts
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * Get balance for an account owned by the authenticated user.
 */
async function getAccountBalanceController(req, res, next) {
    try {
        const { accountId } = req.params

        if (!mongoose.isValidObjectId(accountId)) {
            return res.status(400).json({
                message: "Invalid accountId"
            })
        }

        if (!req.user?._id) {
            return res.status(401).json({
                message: "Unauthorized"
            })
        }

        /*
         * IMPORTANT:
         *
         * The user condition is part of the database query.
         *
         * This means a user cannot retrieve another user's account
         * balance even if they know the account ID.
         */
        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        })

        if (!account) {
            return res.status(404).json({
                message: "Account not found"
            })
        }

        const balance = await account.getBalance()

        return res.status(200).json({
            accountId: account._id,
            currency: account.currency,
            balance
        })
    } catch (err) {
        return next(err)
    }
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController
}