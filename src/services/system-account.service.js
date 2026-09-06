const mongoose = require("mongoose")

const userModel = require("../models/user.model")
const accountModel = require("../models/account.model")
const AppError = require("../errors/AppError")

function getSystemUserConfig() {
    return {
        email:
            process.env.SYSTEM_USER_EMAIL ||
            "system@bank.local",

        name:
            process.env.SYSTEM_USER_NAME ||
            "Bank System",

        password:
            process.env.SYSTEM_USER_PASSWORD
    }
}

/**
 * Get or create the internal system user.
 */
async function getOrCreateSystemUser() {
    const {
        email,
        name,
        password
    } = getSystemUserConfig()

    if (!password) {
        throw new AppError(
            "SYSTEM_USER_PASSWORD is not configured",
            500,
            "SYSTEM_CONFIGURATION_ERROR"
        )
    }

    let systemUser = await userModel
        .findOne({ email })
        .select("+systemUser")

    if (systemUser) {
        if (systemUser.systemUser !== true) {
            throw new AppError(
                "Configured system user email belongs to a normal user",
                500,
                "SYSTEM_USER_INVALID"
            )
        }

        return systemUser
    }

    systemUser = await userModel.create({
        email,
        name,
        password,
        systemUser: true
    })

    return systemUser
}

/**
 * Get or create the single system-owned INR account.
 */
async function getOrCreateSystemAccount() {
    const systemUser =
        await getOrCreateSystemUser()

    let systemAccount = await accountModel.findOne({
        user: systemUser._id,
        currency: "INR"
    })

    if (systemAccount) {
        return systemAccount
    }

    systemAccount = await accountModel.create({
        user: systemUser._id,
        currency: "INR",
        balanceMinor: 0,
        status: "ACTIVE"
    })

    return systemAccount
}

/**
 * Initialize the system user and system account.
 *
 * Safe to call repeatedly.
 */
async function initializeSystemAccount() {
    const {
        email,
        name,
        password
    } = getSystemUserConfig()

    if (!password) {
        throw new AppError(
            "SYSTEM_USER_PASSWORD is not configured",
            500,
            "SYSTEM_CONFIGURATION_ERROR"
        )
    }

    const session = await mongoose.startSession()

    try {
        session.startTransaction()

        let systemUser = await userModel
            .findOne({
                email
            })
            .select("+systemUser")
            .session(session)

        if (systemUser) {
            if (systemUser.systemUser !== true) {
                throw new AppError(
                    "Configured system user email belongs to a normal user",
                    500,
                    "SYSTEM_USER_INVALID"
                )
            }
        } else {
            systemUser = (
                await userModel.create(
                    [
                        {
                            email,
                            name,
                            password,
                            systemUser: true
                        }
                    ],
                    { session }
                )
            )[0]
        }

        let systemAccount = await accountModel
            .findOne({
                user: systemUser._id,
                currency: "INR"
            })
            .session(session)

        if (!systemAccount) {
            systemAccount = (
                await accountModel.create(
                    [
                        {
                            user: systemUser._id,
                            currency: "INR",
                            balanceMinor: 0,
                            status: "ACTIVE"
                        }
                    ],
                    { session }
                )
            )[0]
        }

        await session.commitTransaction()

        return {
            systemUser,
            systemAccount
        }
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction()
        }

        throw error
    } finally {
        await session.endSession()
    }
}

module.exports = {
    getOrCreateSystemUser,
    getOrCreateSystemAccount,
    initializeSystemAccount
}