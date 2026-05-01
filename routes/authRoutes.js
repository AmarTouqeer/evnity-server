const express = require("express");
const { body } = require("express-validator");
const {
  register,
  verifyOTP,
  resendOTP,
  login,
  adminLogin,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updatePassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Validation rules
const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Name can only contain letters and spaces"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .matches(/^03[0-9]{9}$/)
    .withMessage("Please provide a valid Pakistani phone number (03XXXXXXXXX)"),

  body("city").trim().notEmpty().withMessage("City is required"),

  body("role")
    .optional()
    .isIn(["customer", "provider"])
    .withMessage("Role must be either customer or provider"),

  body("providerInfo.businessName")
    .if(body("role").equals("provider"))
    .trim()
    .notEmpty()
    .withMessage("Business name is required for providers")
    .isLength({ min: 2 })
    .withMessage("Business name must be at least 2 characters"),
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required"),
];

const otpValidation = [
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers"),
];

const forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
];

const resetPasswordValidation = [
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
];

const updatePasswordValidation = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "New password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
];

// Routes
router.post("/register", authLimiter, registerValidation, validate, register);
router.post("/verify-otp", protect, otpValidation, validate, verifyOTP);
router.post("/resend-otp", protect, otpLimiter, resendOTP);
router.post("/login", authLimiter, loginValidation, validate, login);
router.post("/admin-login", authLimiter, loginValidation, validate, adminLogin);
router.post("/logout", protect, logout);
router.post(
  "/forgot-password",
  authLimiter,
  forgotPasswordValidation,
  validate,
  forgotPassword
);
router.put(
  "/reset-password/:resetToken",
  resetPasswordValidation,
  validate,
  resetPassword
);
router.get("/me", protect, getMe);
router.put(
  "/update-password",
  protect,
  updatePasswordValidation,
  validate,
  updatePassword
);

module.exports = router;
