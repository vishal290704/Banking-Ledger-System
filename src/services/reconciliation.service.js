const mongoose = require("mongoose")

const accountModel = require("../models/account.model")
const AppError = require("../errors/AppError")

/**
 * Reconcile one account's materialized balance against
 * the balance derived from its immutable ledger entries.
 */
async function reconcileAccount(accountId) {
    if (!mongoose.isValidObjectId(accountId)) {
        throw new AppError(
            "Invalid account ID",
            400,
            "INVALID_ACCOUNT_ID"
        )
    }

    const account = await accountModel.findById(accountId)

    if (!account) {
        throw new AppError(
            "Account not found",
            404,
            "ACCOUNT_NOT_FOUND"
        )
    }

    const materializedBalance = account.getBalance()
    const ledgerBalance = await account.getLedgerBalance()

    const isBalanced =
        materializedBalance === ledgerBalance

    return {
        accountId: account._id,
        currency: account.currency,
        materializedBalance,
        ledgerBalance,
        difference: materializedBalance - ledgerBalance,
        isBalanced
    }
}

module.exports = {
    reconcileAccount
}