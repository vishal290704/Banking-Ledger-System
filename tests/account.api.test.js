const request = require("supertest")

const app = require("../src/app")

const userModel =
    require("../src/models/user.model")

const accountModel =
    require("../src/models/account.model")

describe("Account API", () => {
    let user
    let userToken

    let otherUser
    let otherUserToken

    beforeEach(async () => {
        user = await userModel.create({
            name: "Account User",
            email: "account@example.com",
            password: "password123"
        })

        const loginResponse =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email: "account@example.com",
                    password: "password123"
                })

        userToken = loginResponse.body.token

        otherUser = await userModel.create({
            name: "Other User",
            email: "other@example.com",
            password: "password123"
        })

        const otherLoginResponse =
            await request(app)
                .post("/api/auth/login")
                .send({
                    email: "other@example.com",
                    password: "password123"
                })

        otherUserToken =
            otherLoginResponse.body.token
    })

    test("should reject account creation without authentication", async () => {
        const response =
            await request(app)
                .post("/api/account")
                .send({})

        expect(response.status).toBe(401)

        expect(response.body.message)
            .toMatch(/Unauthorized/i)
    })

    test("should create an account for the authenticated user", async () => {
        const response =
            await request(app)
                .post("/api/account")
                .set(
                    "Authorization",
                    `Bearer ${userToken}`
                )
                .send({})

        expect(response.status).toBe(201)

        expect(response.body.message)
            .toBe("Account created successfully")

        expect(response.body.account)
            .toBeDefined()

        expect(response.body.account.currency)
            .toBe("INR")

        expect(response.body.account.balanceMinor)
            .toBe(0)

        expect(
            response.body.account.user.toString()
        ).toBe(
            user._id.toString()
        )
    })

    test("should list only the authenticated user's accounts", async () => {
        const userAccount =
            await accountModel.create({
                user: user._id,
                balanceMinor: 0,
                currency: "INR"
            })

        await accountModel.create({
            user: otherUser._id,
            balanceMinor: 0,
            currency: "INR"
        })

        const response =
            await request(app)
                .get("/api/account")
                .set(
                    "Authorization",
                    `Bearer ${userToken}`
                )

        expect(response.status).toBe(200)

        expect(response.body.accounts)
            .toHaveLength(1)

        expect(
            response.body.accounts[0]._id
        ).toBe(
            userAccount._id.toString()
        )

        expect(
            response.body.accounts[0].user
        ).toBe(
            user._id.toString()
        )
    })

    test("should return the balance of the authenticated user's account", async () => {
        const account =
            await accountModel.create({
                user: user._id,
                balanceMinor: 50000,
                currency: "INR"
            })

        const response =
            await request(app)
                .get(
                    `/api/account/balance/${account._id}`
                )
                .set(
                    "Authorization",
                    `Bearer ${userToken}`
                )

        expect(response.status).toBe(200)

        expect(response.body.accountId)
            .toBe(account._id.toString())

        expect(response.body.currency)
            .toBe("INR")

        expect(response.body.balance)
            .toBe(50000)
    })

    test("should not allow a user to read another user's account balance", async () => {
        const otherAccount =
            await accountModel.create({
                user: otherUser._id,
                balanceMinor: 75000,
                currency: "INR"
            })

        const response =
            await request(app)
                .get(
                    `/api/account/balance/${otherAccount._id}`
                )
                .set(
                    "Authorization",
                    `Bearer ${userToken}`
                )

        expect(response.status).toBe(404)

        expect(response.body.message)
            .toBe("Account not found")
    })

    test("should reject an invalid account ID", async () => {
        const response =
            await request(app)
                .get(
                    "/api/account/balance/not-a-valid-id"
                )
                .set(
                    "Authorization",
                    `Bearer ${userToken}`
                )

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe("Invalid accountId")
    })

    test("should reject access with an invalid token", async () => {
        const response =
            await request(app)
                .get("/api/account")
                .set(
                    "Authorization",
                    "Bearer invalid-token"
                )

        expect(response.status).toBe(401)
    })
})