const mongoose = require("mongoose")

const systemAccountService =
    require("../src/services/system-account.service")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

describe("System Account Service", () => {
    beforeEach(async () => {
        process.env.SYSTEM_USER_EMAIL =
            "system@bank.local"

        process.env.SYSTEM_USER_NAME =
            "Bank System"

        process.env.SYSTEM_USER_PASSWORD =
            "system-password-123"
    })

    test("should create the system user and system account", async () => {
        const result =
            await systemAccountService.initializeSystemAccount()

        expect(result.systemUser).toBeDefined()
        expect(result.systemAccount).toBeDefined()

        expect(result.systemUser.email)
            .toBe("system@bank.local")

        expect(result.systemUser.systemUser)
            .toBe(true)

        expect(result.systemAccount.balanceMinor)
            .toBe(0)

        expect(result.systemAccount.currency)
            .toBe("INR")

        expect(
            await userModel.countDocuments({
                email: "system@bank.local"
            })
        ).toBe(1)

        expect(
            await accountModel.countDocuments({
                user: result.systemUser._id,
                currency: "INR"
            })
        ).toBe(1)
    })

    test("should reuse the existing system user and account", async () => {
        const first =
            await systemAccountService.initializeSystemAccount()

        const second =
            await systemAccountService.initializeSystemAccount()

        expect(
            second.systemUser._id.toString()
        ).toBe(
            first.systemUser._id.toString()
        )

        expect(
            second.systemAccount._id.toString()
        ).toBe(
            first.systemAccount._id.toString()
        )

        expect(
            await userModel.countDocuments({
                email: "system@bank.local"
            })
        ).toBe(1)

        expect(
            await accountModel.countDocuments({
                user: first.systemUser._id,
                currency: "INR"
            })
        ).toBe(1)
    })

    test("should reject a normal user using the system user email", async () => {
        await userModel.create({
            email: "system@bank.local",
            name: "Normal User",
            password: "password123",
            systemUser: false
        })

        await expect(
            systemAccountService.initializeSystemAccount()
        ).rejects.toMatchObject({
            code: "SYSTEM_USER_INVALID",
            statusCode: 500
        })
    })
})