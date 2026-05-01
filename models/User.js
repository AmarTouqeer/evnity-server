const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      match: [/^03[0-9]{9}$/, "Please provide a valid Pakistani phone number"],
    },
    role: {
      type: String,
      enum: ["customer", "provider", "admin"],
      default: "customer",
    },
    city: {
      type: String,
      required: [true, "City is required"],
    },
    address: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },

    // Provider-specific fields
    providerInfo: {
      businessName: {
        type: String,
        default: "",
      },
      description: {
        type: String,
        default: "",
      },
      experience: {
        type: Number,
        default: 0,
      },
      cnic: {
        type: String,
        default: "",
        match: [
          /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/,
          "Please provide a valid CNIC number (e.g. 35202-1234567-1)",
        ],
        validate: {
          validator: function () {
            if (this.role === "provider") {
              return this.providerInfo?.cnic && this.providerInfo.cnic.trim() !== "";
            }
            return true;
          },
          message: "CNIC is required for provider registration",
        },
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
      verificationStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      rejectionReason: {
        type: String,
        default: "",
      },
    },

    // ==============================
    // 💳 STRIPE CONNECT FIELDS
    // ==============================
    stripeAccountId: {
      type: String,
      default: null,
      sparse: true, // Allow null values, but enforce uniqueness on non-null
    },
    stripeConnected: {
      type: Boolean,
      default: false,
    },
    stripeConnectStatus: {
      type: String,
      enum: ["not_connected", "pending", "active", "restricted"],
      default: "not_connected",
    },
    stripeConnectedAt: {
      type: Date,
      default: null,
    },
    // Store Stripe charges enabled flag
    stripeChargesEnabled: {
      type: Boolean,
      default: false,
    },
    // Store Stripe payouts enabled flag
    stripePayoutsEnabled: {
      type: Boolean,
      default: false,
    },
    // Stripe Connect refresh token (encrypted - store carefully)
    stripeRefreshToken: {
      type: String,
      select: false,
      default: null,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isApprovedByAdmin: {
      type: Boolean,
      default: false,
    },
    adminApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminRejectionReason: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },

    // OTP fields
    otp: {
      type: String,
      select: false,
    },
    otpExpire: {
      type: Date,
      select: false,
    },

    // Password reset fields
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },

    // Last login
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate OTP
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;

  const otpExpireMinutes = parseInt(process.env.OTP_EXPIRE_MINUTES) || 10;
  this.otpExpire = Date.now() + otpExpireMinutes * 60 * 1000;

  return otp;
};

// Generate password reset token
userSchema.methods.generateResetToken = function () {
  const resetToken =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  const crypto = require("crypto");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);