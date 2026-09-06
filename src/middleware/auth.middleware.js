const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const tokenBlackListModel = require("../models/blackList.model")

/**
 * Extract JWT from either:
 *
 * 1. HTTP-only cookie
 * 2. Authorization: Bearer <token>
 */
function extractToken(req) {
    const cookieToken = req.cookies?.token

    if (cookieToken) {
        return cookieToken
    }

    const authorizationHeader = req.headers.authorization

    if (!authorizationHeader) {
        return null
    }

    const [scheme, token] = authorizationHeader.split(" ")

    if (scheme !== "Bearer" || !token) {
        return null
    }

    return token
}

/**
 * Authenticate the current request.
 *
 * Responsibilities:
 * - Extract token
 * - Check token blacklist
 * - Verify JWT signature/expiration
 * - Load the corresponding user
 * - Reject deleted users
 * - Attach user to req.user
 */
async function authenticateRequest(req, res, next) {
    try {
        const token = extractToken(req)

        if (!token) {
            return res.status(401).json({
                message: "Unauthorized access, token is missing"
            })
        }

        /*
         * Check whether the token has explicitly been revoked.
         */
        const isBlackListed = await tokenBlackListModel.findOne({
            token
        })

        if (isBlackListed) {
            return res.status(401).json({
                message: "Unauthorized access, token is blacklisted"
            })
        }

        /*
         * Verify:
         * - signature
         * - expiration
         * - token structure
         */
        let decoded

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            )
        } catch (jwtError) {
            return res.status(401).json({
                message: "Unauthorized access, token is invalid or expired"
            })
        }

        if (!decoded?.userId) {
            return res.status(401).json({
                message: "Unauthorized access, token payload is invalid"
            })
        }

        /*
         * Fetch the user from the database.
         *
         * Never trust user information embedded only inside the JWT
         * when authorization decisions depend on current account state.
         */
        const user = await userModel.findById(decoded.userId)

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user no longer exists"
            })
        }

        req.user = user
        req.authToken = token
        req.authPayload = decoded

        return next()
    } catch (err) {
        /*
         * Database or infrastructure error.
         * Let the centralized error middleware deal with it.
         */
        return next(err)
    }
}

/**
 * Normal authenticated-user middleware.
 */
async function authMiddleware(req, res, next) {
    return authenticateRequest(req, res, next)
}

/**
 * System-user authentication middleware.
 *
 * A system user is still authenticated using the same JWT mechanism,
 * but additionally requires systemUser=true.
 */
async function authSystemUserMiddleware(req, res, next) {
    try {
        const token = extractToken(req)

        if (!token) {
            return res.status(401).json({
                message: "Unauthorized access, token is missing"
            })
        }

        const isBlackListed = await tokenBlackListModel.findOne({
            token
        })

        if (isBlackListed) {
            return res.status(401).json({
                message: "Unauthorized access, token is blacklisted"
            })
        }

        let decoded

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            )
        } catch (jwtError) {
            return res.status(401).json({
                message: "Unauthorized access, token is invalid or expired"
            })
        }

        if (!decoded?.userId) {
            return res.status(401).json({
                message: "Unauthorized access, token payload is invalid"
            })
        }

        /*
         * systemUser is selected explicitly in case the schema
         * marks it as select:false.
         */
        const user = await userModel
            .findById(decoded.userId)
            .select("+systemUser")

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, user no longer exists"
            })
        }

        if (user.systemUser !== true) {
            return res.status(403).json({
                message: "Forbidden access, user is not a system user"
            })
        }

        req.user = user
        req.authToken = token
        req.authPayload = decoded

        return next()
    } catch (err) {
        return next(err)
    }
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware,
    extractToken
}