require("dotenv").config()

const app = require("./src/app")
const connectToDB = require("./src/config/db")

async function startServer() {
    try {
        await connectToDB()

        const PORT = process.env.PORT || 3000

        app.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`)
        })
    } catch (error) {
        console.error("Failed to start server:", error)
        process.exit(1)
    }
}

startServer()