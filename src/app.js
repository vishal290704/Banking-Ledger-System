const express = require("express")
const cookieParser = require("cookie-parser")

const app = express()

app.use(express.json())
app.use(cookieParser())

//Routes required
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")

//Use Routes
app.use("/api/auth", authRouter )
app.use("/api/account", accountRouter)

module.exports = app