const rateLimit = require("express-rate-limit");

const isDev = process.env.NODE_ENV !== "production";

exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 100,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 30,      // already 10000 in dev
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many failed login attempts, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 10000 : 3,       // already 10000 in dev
  message: {
    success: false,
    message: "Too many OTP requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});