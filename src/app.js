const express = require("express")
const cookieParser = require("cookie-parser")

const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")

const app = express()

/*
 * Body parsing
 */
app.use(express.json({
    limit: "1mb"
}))

/*
 * Cookie parsing
 */
app.use(cookieParser())

/*
 * Health check
 */
app.get("/health", (req, res) => {
    return res.status(200).json({
        status: "ok",
        service: "banking-ledger-system"
    })
})

/*
 * Routes
 */
app.use("/api/auth", authRouter)

app.use("/api/account", accountRouter)

app.use("/api/transactions", transactionRoutes)

/*
 * 404 handler
 */
app.use((req, res) => {
    return res.status(404).json({
        message: `Route ${req.method} ${req.originalUrl} not found`
    })
})

/*
 * Centralized error handler
 *
 * Express 5 supports async route handlers, but keeping one
 * explicit error handler gives us consistent API responses.
 */
app.use((err, req, res, next) => {
    console.error("Unhandled application error:", err)

    /*
     * Mongoose validation errors
     */
    if (err?.name === "ValidationError") {
        return res.status(400).json({
            message: "Validation failed",
            errors: Object.values(err.errors).map(error => ({
                field: error.path,
                message: error.message
            }))
        })
    }

    /*
     * Invalid MongoDB ObjectId / casting errors
     */
    if (err?.name === "CastError") {
        return res.status(400).json({
            message: "Invalid resource identifier"
        })
    }

    /*
     * MongoDB duplicate-key error
     */
    if (err?.code === 11000) {
        return res.status(409).json({
            message: "A resource with the same unique value already exists"
        })
    }

    /*
     * Explicit application errors can optionally provide
     * their own statusCode.
     */
    const statusCode = Number.isInteger(err?.statusCode)
        ? err.statusCode
        : 500

    return res.status(statusCode).json({
        message:
            statusCode === 500
                ? "Internal server error"
                : err.message || "Request failed"
    })
})

module.exports = app