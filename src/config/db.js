const mongoose = require("mongoose")

async function connectToDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI)

        console.log("Server is connected to DB")
    } catch (error) {
        console.error("Error connecting to DB")
        console.error(error)

        throw error
    }
}

module.exports = connectToDB