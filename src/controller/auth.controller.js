const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlackListModel = require("../models/blackList.model")

/**
 * Create JWT for an authenticated user.
 */
function generateAccessToken(userId) {
    return jwt.sign(
        {
            userId
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "3d"
        }
    )
}

/**
 * Common cookie configuration.
 */
function setAuthCookie(res, token) {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3 * 24 * 60 * 60 * 1000
    })
}

/**
 * POST /api/auth/register
 */
async function userRegisterController(req, res, next) {
    try {
        const { email, password, name } = req.body

        if (!email || !password || !name) {
            return res.status(400).json({
                message: "Name, email and password are required"
            })
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase()

        const normalizedName = String(name).trim()

        if (normalizedName.length < 2) {
            return res.status(400).json({
                message: "Name must contain at least 2 characters"
            })
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters"
            })
        }

        /*
         * Do not allow systemUser to come from req.body.
         *
         * We explicitly select only allowed registration fields.
         */
        const isExists = await userModel.findOne({
            email: normalizedEmail
        })

        if (isExists) {
            return res.status(409).json({
                message: "User already exists with this email",
                status: "failed"
            })
        }

        const user = await userModel.create({
            email: normalizedEmail,
            password,
            name: normalizedName
        })

        const token = generateAccessToken(user._id)

        setAuthCookie(res, token)

        /*
         * Return the response first.
         *
         * Email delivery should never make user registration fail.
         */
        const response = res.status(201).json({
            message: "User registered successfully",
            user: {
                _id: user._id,
                email: user.email,
                name: user.name
            },
            token
        })

        /*
         * Non-critical side effect.
         */
        try {
            await emailService.sendRegistrationEmail(
                user.email,
                user.name
            )
        } catch (emailError) {
            console.error(
                "Registration email failed:",
                emailError
            )
        }

        return response
    } catch (error) {
        /*
         * Handle MongoDB duplicate-key race condition.
         */
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "User already exists with this email"
            })
        }

        return next(error)
    }
}

/**
 * POST /api/auth/login
 */
async function userLoginController(req, res, next) {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            })
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase()

        /*
         * password has select:false in the schema,
         * so it must be explicitly selected.
         */
        const user = await userModel
            .findOne({
                email: normalizedEmail
            })
            .select("+password")

        if (!user) {
            return res.status(401).json({
                message: "Email or password is invalid"
            })
        }

        const isValidPassword =
            await user.comparePassword(password)

        if (!isValidPassword) {
            return res.status(401).json({
                message: "Email or password is invalid"
            })
        }

        const token = generateAccessToken(user._id)

        setAuthCookie(res, token)

        return res.status(200).json({
            message: "Login successful",
            user: {
                _id: user._id,
                email: user.email,
                name: user.name
            },
            token
        })
    } catch (error) {
        return next(error)
    }
}

/**
 * POST /api/auth/logout
 */
async function userLogoutController(req, res, next) {
    try {
        const cookieToken = req.cookies?.token
        const authorizationHeader = req.headers.authorization

        let headerToken = null

        if (authorizationHeader?.startsWith("Bearer ")) {
            headerToken = authorizationHeader.substring(7)
        }

        const token = cookieToken || headerToken

        if (!token) {
            res.clearCookie("token")

            return res.status(200).json({
                message: "User logged out successfully"
            })
        }

        let decoded

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            )
        } catch (error) {
            res.clearCookie("token")

            return res.status(200).json({
                message: "User logged out successfully"
            })
        }

        const expiresAt = decoded.exp
            ? new Date(decoded.exp * 1000)
            : new Date(
                  Date.now() +
                  3 * 24 * 60 * 60 * 1000
              )

        try {
            await tokenBlackListModel.create({
                token,
                expiresAt
            })
        } catch (error) {
            if (error?.code !== 11000) {
                throw error
            }
        }

        res.clearCookie("token")

        return res.status(200).json({
            message: "User logged out successfully"
        })
    } catch (error) {
        return next(error)
    }
}
module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
}