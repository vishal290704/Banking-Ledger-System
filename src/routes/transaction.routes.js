const { Router } = require("express")

const authMiddleware = require("../middleware/auth.middleware")
const transactionController = require("../controller/transaction.controller")

const transactionRoutes = Router()

/**
 * GET /api/transactions
 *
 * Get transaction history for the authenticated user.
 */
transactionRoutes.get(
    "/",
    authMiddleware.authMiddleware,
    transactionController.getTransactions
)

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
 */
transactionRoutes.post(
    "/system/initial-funds",
    authMiddleware.authSystemUserMiddleware,
    transactionController.createInitialFundsTransaction
)

module.exports = transactionRoutes