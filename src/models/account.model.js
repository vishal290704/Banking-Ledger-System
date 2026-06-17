const mongoose = require("mongoose")

// Schema for account details
const accountSchema = new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:[true, "Account must be associated with a user"],
        index:true
    },
    status:{
        type:String,
        enum:{
            values:["ACTIVE", "FROZEN", "CLOSED"],
            message:"Status can be either ACTIVE, FORZEN or CLOSED"  
        },
        default:"ACTIVE"
    },
    currency:{
        type:String,
        require:[true, "Currency is required for creating an account"],
        default:"INR"
    },
},{
    timestamps:true
})

//compound index
accountSchema.index({user:1, status:1})

const accountModel = mongoose.model("account", accountSchema)
module.exports = accountModel