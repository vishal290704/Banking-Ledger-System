const express = require("express")

const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controller/account.controller")

const router = express.Router()

/**
 * POST /api/accounts
 *
 * Create a new bank account for the authenticated user.
 */
router.post(
    "/",
    authMiddleware.authMiddleware,
    accountController.createAccountController
)

/**
 * GET /api/accounts
 *
 * Get all bank accounts belonging to the authenticated user.
 */
router.get(
    "/",
    authMiddleware.authMiddleware,
    accountController.getUserAccountsController
)

/**
 * GET /api/accounts/balance/:accountId
 *
 * Get the balance of an account owned by the authenticated user.
 */
router.get(
    "/balance/:accountId",
    authMiddleware.authMiddleware,
    accountController.getAccountBalanceController
)

module.exports = router