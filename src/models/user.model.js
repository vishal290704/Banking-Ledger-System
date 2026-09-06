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
         * This field MUST NOT be supplied through normal registration.
         *
         * It is immutable so an existing system user cannot be changed
         * into a normal user and vice versa through an ordinary update.
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
 * Hash password before saving it.
 *
 * Password is only hashed when it has been modified.
 */
userSchema.pre("save", async function (next) {
    try {
        if (!this.isModified("password")) {
            return next()
        }

        this.password = await bcrypt.hash(this.password, 12)

        return next()
    } catch (error) {
        return next(error)
    }
})

/**
 * Compare plain-text password with stored bcrypt hash.
 */
userSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password)
}

const userModel = mongoose.model("user", userSchema)

module.exports = userModel