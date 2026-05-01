const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} = require("../utils/emailService");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, city, address, role, providerInfo } =
      req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create user object
    const userData = {
      name,
      email,
      password,
      phone,
      city,
      address: address || "",
      role: role || "customer",
    };

    // Set admin approval status based on role
    if (role === "admin") {
      // Admin accounts are auto-approved
      userData.isApprovedByAdmin = true;
      userData.adminApprovalStatus = "approved";
    } else {
      // Customer and provider accounts need admin approval
      userData.isApprovedByAdmin = false;
      userData.adminApprovalStatus = "pending";
    }

    // Add provider info if role is provider
    if (role === "provider" && providerInfo) {
      if (!providerInfo.cnic) {
        return res.status(400).json({
          success: false,
          message: "CNIC is required for provider registration",
        });
      }
      userData.providerInfo = {
        businessName: providerInfo.businessName || "",
        description: providerInfo.description || "",
        experience: providerInfo.experience || 0,
        cnic: providerInfo.cnic,
        isVerified: false,
        verificationStatus: "pending",
      };
    }
    if (role === "provider" && !providerInfo) {
      return res.status(400).json({
        success: false,
        message: "Provider information including CNIC is required for provider registration",
      });
    }

    // Create user
    const user = await User.create(userData);

    // Generate OTP
    const otp = user.generateOTP();
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(user.email, otp, user.name);
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Don't fail registration if email fails
    }

    // Generate token
    const token = generateToken(user._id);

    // Remove sensitive data
    user.password = undefined;
    user.otp = undefined;
    user.otpExpire = undefined;

    res.status(201).json({
      success: true,
      message:
        role === "admin"
          ? "Admin registration successful! Please verify your email with the OTP sent to your email address."
          : "Registration successful! Please verify your email with the OTP sent to your email address. After verification, your account will be pending admin approval.",
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          address: user.address,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          providerInfo: user.providerInfo,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    next(error);
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Private
exports.verifyOTP = async (req, res, next) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Please provide OTP",
      });
    }

    // Get user with OTP fields
    const user = await User.findById(req.user._id).select("+otp +otpExpire");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Check if OTP exists
    if (!user.otp || !user.otpExpire) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    // Check if OTP is expired
    if (Date.now() > user.otpExpire) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.otp = undefined;
    user.otpExpire = undefined;
    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(user.email, user.name, user.role);
    } catch (emailError) {
      console.error("Welcome email failed:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Email verified successfully!",
      data: {
        isEmailVerified: true,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    next(error);
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Private
exports.resendOTP = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate new OTP
    const otp = user.generateOTP();
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(user.email, otp, user.name);

      res.status(200).json({
        success: true,
        message: "OTP sent successfully to your email address",
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Check for user (include password for comparison)
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    // Check if email is verified (except for admin)
    if (user.role !== "admin" && !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in. Check your email for OTP.",
        needsEmailVerification: true,
      });
    }

    // Check if admin approved (except for admin)
    if (user.role !== "admin" && !user.isApprovedByAdmin) {
      return res.status(403).json({
        success: false,
        message:
          user.adminApprovalStatus === "rejected"
            ? `Your account has been rejected. Reason: ${user.adminRejectionReason || "Not specified"
            }`
            : "Your account is pending admin approval. You will be notified once approved.",
        needsAdminApproval: true,
        approvalStatus: user.adminApprovalStatus,
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove sensitive data
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          address: user.address,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          adminRejectionReason: user.adminRejectionReason,
          providerInfo: user.providerInfo,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};

// @desc    Admin login
// @route   POST /api/auth/admin-login
// @access  Public
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user and include password
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    // Check if user role is admin
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin access only.",
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Remove sensitive data
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          address: user.address,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // In a stateless JWT system, logout is handled on the client side
    // by removing the token from localStorage
    // But we can still send a response to confirm logout

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide email address",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with this email address",
      });
    }

    // Generate reset token
    const resetToken = user.generateResetToken();
    await user.save();

    // Send password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name);

      res.status(200).json({
        success: true,
        message: "Password reset link sent to your email address",
      });
    } catch (emailError) {
      // Reset token fields if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      console.error("Password reset email failed:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send password reset email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    const { resetToken } = req.params;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please provide new password",
      });
    }

    // Hash token
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Find user by reset token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select("+resetPasswordToken +resetPasswordExpire");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password reset successful. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    // Always fetch fresh user data from database
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          address: user.address,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          adminRejectionReason: user.adminRejectionReason,
          providerInfo: user.providerInfo,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    next(error);
  }
};

// @desc    Update password
// @route   PUT /api/auth/update-password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide current password and new password",
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update password error:", error);
    next(error);
  }
};
