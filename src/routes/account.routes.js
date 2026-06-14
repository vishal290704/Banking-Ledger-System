const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const router = express.Router()

/**
 * -POST /api/accounts/create 
 * -Create a new bank account for the authenticated user
 */
    router.post("/", authMiddleware.authMiddleware)

module.exports = router