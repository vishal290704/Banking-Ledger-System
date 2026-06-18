const mongoose = require("mongoose");

const tokenBlackListSchema = new mongoose.Schema({
    token:{
        type:String,
        required:[true, "Token is required for blacklisting"],
        unique:[true, "Token already exists in blacklist"]
    }
},{
    timestamps:true
})

tokenBlackListSchema.index({createdAt:1},{
    expireAfterSeconds: 60 * 60 * 24 * 3, // 3 days
})

const tokenBlackListModel = mongoose.model("tokenBlacklist", tokenBlackListSchema)

module.exports = tokenBlackListModel