const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route. Please login.",
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token (always fetch fresh data from database)
    // Important: Always fetch from DB to get latest approval status
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please login again.",
      });
    }

    // Check if user is blocked
    if (req.user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Check if user is active
    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please login again.",
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

// Check if provider is verified
exports.checkProviderVerification = async (req, res, next) => {
  if (req.user.role === "provider" && !req.user.providerInfo.isVerified) {
    return res.status(403).json({
      success: false,
      message:
        "Your provider account is not yet verified. Please wait for admin approval.",
    });
  }
  next();
};

// Check if user is approved by admin (except for admins)
exports.checkAdminApproval = async (req, res, next) => {
  // Skip check for admins
  if (req.user.role === "admin") {
    return next();
  }

  // Re-fetch user from database to ensure we have the latest approval status
  // This is important because admin might have approved the user after they logged in
  const freshUser = await User.findById(req.user._id);

  if (!freshUser) {
    return res.status(401).json({
      success: false,
      message: "User not found. Please login again.",
    });
  }

  // Update req.user with fresh data
  req.user = freshUser;

  // Check if email is verified
  if (!freshUser.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: "Please verify your email before accessing this feature.",
      needsEmailVerification: true,
    });
  }

  // Check if admin approved
  if (!freshUser.isApprovedByAdmin) {
    return res.status(403).json({
      success: false,
      message:
        freshUser.adminApprovalStatus === "rejected"
          ? `Your account has been rejected. Reason: ${
              freshUser.adminRejectionReason || "Not specified"
            }`
          : "Your account is pending admin approval. You will be notified once approved.",
      needsAdminApproval: true,
      approvalStatus: freshUser.adminApprovalStatus,
      rejectionReason: freshUser.adminRejectionReason,
    });
  }

  next();
};
