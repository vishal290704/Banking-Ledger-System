const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, "Email is required for creating a user"],
            trim: true,
            lowercase: true,
            unique: true,
            index: true,
            match: [
                /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                "Invalid email address"
            ]
        },

        name: {
            type: String,
            required: [true, "Name is required for creating a user"],
            trim: true,
            minlength: [2, "Name must contain at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"]
        },

        password: {
            type: String,
            required: [true, "Password is required for creating a user"],
            minlength: [
                8,
                "Password should contain at least 8 characters"
            ],
            select: false
        },

        /*
         * Identifies the internal system user.
         *
         * This is immutable so a normal user cannot later
         * be converted into a system user.
         */
        systemUser: {
            type: Boolean,
            default: false,
            immutable: true,
            select: false
        }
    },
    {
        timestamps: true
    }
)

/*
 * Hash the password before saving.
 *
 * Async middleware returns normally on success and throws
 * automatically if hashing fails.
 */
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return
    }

    this.password = await bcrypt.hash(this.password, 12)
})

/*
 * Compare a plain-text password with the stored hash.
 */
userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password)
}

const userModel = mongoose.model("user", userSchema)

module.exports = userModel