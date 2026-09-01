const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required for creating a user"],
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Invalid Email address",
      ],
      unique: [true, "Email already exists"],
    },
    name: {
      type: String,
      required: [true, "Name is required to create account"],
    },
    password: {
      type: String,
      required: [true, "Password is required to create an account"],
      minlength: [8, "Password should contain more than 8 characters"],
      select: false,
    },
    systemUser: {
      type: Boolean,
      default: false,
      immutable: true,
      select: false,
    }
  },
  {
    timestamps: true,
  },
);

// Checks if new password created, then hashes it for 11 rounds and saves as new password
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const hash = await bcrypt.hash(this.password, 11);
  this.password = hash;

  return;
});

// Bcrypt compares the entered password and the saved password in the schema
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Create const user moder with name user and schema of userschema
const userModel = mongoose.model("user", userSchema);

module.exports = userModel;
