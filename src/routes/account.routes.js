const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controller/account.controller")
const router = express.Router()

/**
 * -POST /api/accounts/create 
 * -Create a new bank account for the authenticated user
 */
    router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)

/**
 * -GET /api/accounts/
 * -Get all bank accounts for the authenticated user
 * -Protected route, requires authentication
 */

router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)

/**
 * -GET /api/accounts/balance/:accountId
 */
router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController)

module.exports = router