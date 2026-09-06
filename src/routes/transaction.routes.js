const { Router } = require("express")

const authMiddleware = require("../middleware/auth.middleware")
const transactionController = require("../controller/transaction.controller")

const transactionRoutes = Router()

/**
 * POST /api/transactions
 *
 * Create a new account-to-account transaction.
 */
transactionRoutes.post(
    "/",
    authMiddleware.authMiddleware,
    transactionController.createTransaction
)

/**
 * POST /api/transactions/system/initial-funds
 *
 * Create initial funds from the system account.
 *
 * Implementation will be added after validating the
 * system-user/account flow.
 */
transactionRoutes.post(
    "/system/initial-funds",
    authMiddleware.authSystemUserMiddleware,
    transactionController.createInitialFundsTransaction
)

module.exports = transactionRoutes