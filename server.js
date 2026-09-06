require("dotenv").config()

const app = require("./src/app")
const connectToDB = require("./src/config/db")

async function startServer() {
    try {
        await connectToDB()

        const PORT = process.env.PORT || 3000

        const server = app.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`)
        })

        /*
         * Graceful shutdown
         */
        const shutdown = async (signal) => {
            console.log(`${signal} received. Shutting down...`)

            server.close(async () => {
                const mongoose = require("mongoose")

                try {
                    await mongoose.connection.close()
                    console.log("MongoDB connection closed")
                    process.exit(0)
                } catch (error) {
                    console.error(
                        "Error closing MongoDB connection:",
                        error
                    )

                    process.exit(1)
                }
            })
        }

        process.on("SIGINT", () => shutdown("SIGINT"))
        process.on("SIGTERM", () => shutdown("SIGTERM"))
    } catch (error) {
        console.error("Unable to start application:", error)
        process.exit(1)
    }
}

startServer()