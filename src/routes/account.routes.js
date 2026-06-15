const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controller/account.controller")
const router = express.Router()

/**
 * -POST /api/accounts/create 
 * -Create a new bank account for the authenticated user
 */
    router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)

module.exports = router