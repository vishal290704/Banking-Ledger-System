require("dotenv").config()

const mongoose = require("mongoose")
const connectToDB = require("../src/config/db")
const systemAccountService =
    require("../src/services/system-account.service")

async function bootstrap() {
    try {
        await connectToDB()

        const {
            systemUser,
            systemAccount
        } =
            await systemAccountService.initializeSystemAccount()

        console.log("System account initialized successfully")
        console.log(`System user: ${systemUser.email}`)
        console.log(
            `System account: ${systemAccount._id}`
        )
        console.log(
            `Currency: ${systemAccount.currency}`
        )
        console.log(
            `Balance: ${systemAccount.balanceMinor}`
        )
    } catch (error) {
        console.error(
            "Failed to initialize system account:",
            error
        )

        process.exitCode = 1
    } finally {
        await mongoose.connection.close()
    }
}

bootstrap()