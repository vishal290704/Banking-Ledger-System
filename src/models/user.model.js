const mongoose = require("mongoose")

const userSchema = mongoose.Schema({
    email:{
        type:String,
        required:[true, "Email is required for creating a user"],
        trim:true,
        lowercase:true,
        match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/  , "Invalid e-mail address"],
        unique:[true, "Email already exists"]
    },
    name:{
        type:String,
        required:[true, "Name is required for creating an account"],
    },
    password:{
        type:String,
        required:[true, "Password is required for creating an account"],
        minlength: [6, "Password should contain more than 6 characters"]
    }
})