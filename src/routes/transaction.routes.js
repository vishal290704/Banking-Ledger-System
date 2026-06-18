const {Router} = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const transactionController = require("../controller/transaction.controller")

const transactionRoutes = Router()

/**
 * -POST /api/transactions/
 * -Create a new transaction
 */

transactionRoutes.post("/", authMiddleware.authSystemUserMiddleware,transactionController.createTransaction)

/**
 * -POST /api/transactions/system/initial-funds
 * Create initial funds transaction from system user.
 */
transactionRoutes.post("/system/initial-funds",authMiddleware, transactionController.createInitialFundsTransaction)

module.exports = transactionRoutes

   

