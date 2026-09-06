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
         * System users are internal users.
         *
         * Normal registration never accepts this field.
         * It is immutable so it cannot be changed later.
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
 * Hash password before saving.
 */
userSchema.pre("save", async function (next) {
    try {
        if (!this.isModified("password")) {
            return next()
        }

        this.password = await bcrypt.hash(this.password, 12)

        next()
    } catch (error) {
        next(error)
    }
})

/*
 * Compare plain password with stored hash.
 */
userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password)
}

const userModel = mongoose.model("user", userSchema)

module.exports = userModel