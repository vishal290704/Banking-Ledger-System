const { model } = require("mongoose")
const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")

// -User register controller
// -POST /api/auth/register
async function userRegisterController(req, res){
    const {email, password, name} = req.body
    const isExists = await userModel.findOne({
        email:email
    })

    if(isExists){
        return res.status(422).json({
            message:"User already exists with email",
            status:"failed"
        })
    }
    const user = await userModel.create({
        email, password, name 
    })

    const token = jwt.sign({userId:user_id}, process.env.JWT_SECRET,{expiresIn:"3d"})
}

module.exports = {
    userRegisterController
}