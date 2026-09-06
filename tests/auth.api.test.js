const request = require("supertest")

const app = require("../src/app")

const userModel =
    require("../src/models/user.model")

const tokenBlackListModel =
    require("../src/models/blackList.model")

describe("Auth API", () => {
    test("should register a new user", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Test User",
                email: "test@example.com",
                password: "password123"
            })

        expect(response.status).toBe(201)

        expect(response.body.message)
            .toBe("User registered successfully")

        expect(response.body.user).toBeDefined()

        expect(response.body.user.email)
            .toBe("test@example.com")

        expect(response.body.user.name)
            .toBe("Test User")

        expect(response.body.token)
            .toBeDefined()

        expect(response.headers["set-cookie"])
            .toBeDefined()

       const user = await userModel
    .findOne({
        email: "test@example.com"
    })
    .select("+systemUser")
        expect(user).toBeDefined()
        expect(user.systemUser).toBe(false)
    })

    test("should reject duplicate registration", async () => {
        await userModel.create({
            name: "Existing User",
            email: "existing@example.com",
            password: "password123"
        })

        const response = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Another User",
                email: "existing@example.com",
                password: "password123"
            })

        expect(response.status).toBe(409)

        expect(response.body.message)
            .toBe("User already exists with this email")
    })

    test("should login with valid credentials", async () => {
        await userModel.create({
            name: "Login User",
            email: "login@example.com",
            password: "password123"
        })

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: "login@example.com",
                password: "password123"
            })

        expect(response.status).toBe(200)

        expect(response.body.message)
            .toBe("Login successful")

        expect(response.body.user.email)
            .toBe("login@example.com")

        expect(response.body.token)
            .toBeDefined()

        expect(response.headers["set-cookie"])
            .toBeDefined()
    })

    test("should reject login with an invalid password", async () => {
        await userModel.create({
            name: "Invalid Login",
            email: "invalid-login@example.com",
            password: "password123"
        })

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: "invalid-login@example.com",
                password: "wrong-password"
            })

        expect(response.status).toBe(401)

        expect(response.body.message)
            .toBe("Email or password is invalid")
    })

    test("should reject login for a nonexistent user", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: "missing@example.com",
                password: "password123"
            })

        expect(response.status).toBe(401)

        expect(response.body.message)
            .toBe("Email or password is invalid")
    })

    test("should reject registration with missing fields", async () => {
        const response = await request(app)
            .post("/api/auth/register")
            .send({
                email: "missing@example.com"
            })

        expect(response.status).toBe(400)

        expect(response.body.message)
            .toBe("Name, email and password are required")
    })

    test("should logout successfully with a bearer token", async () => {
        await userModel.create({
            name: "Logout User",
            email: "logout@example.com",
            password: "password123"
        })

        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({
                email: "logout@example.com",
                password: "password123"
            })

        const token = loginResponse.body.token

        const logoutResponse = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", `Bearer ${token}`)

        expect(logoutResponse.status).toBe(200)

        expect(logoutResponse.body.message)
            .toBe("User logged out successfully")

        const blacklistedToken =
            await tokenBlackListModel.findOne({
                token
            })

        expect(blacklistedToken).toBeDefined()
    })

    test("should allow logout without a token", async () => {
        const response = await request(app)
            .post("/api/auth/logout")

        expect(response.status).toBe(200)

        expect(response.body.message)
            .toBe("User logged out successfully")
    })
})