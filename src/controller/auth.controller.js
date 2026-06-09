const { model } = require("mongoose")
const userModel = require("../models/user.model")


// -User register controller
// -POST /api/auth/register
function userRegisterController(req, res){
    const {email, password, name} = req.body
}

module.exports = {
    userRegisterController
}