require("dotenv").config();
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");
const { stripeWebhook } = require("./controllers/paymentController");

// Load environment variables (already loaded above, keep for clarity if needed)
dotenv.config();

// Warn if email credentials are missing
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.warn(
    "EMAIL_USER or EMAIL_PASSWORD is not set. Nodemailer may fail with 'Missing credentials for PLAIN'."
  );
}

// Connect to database
connectDB();

// Initialize express app
const app = express();

// ==============================
//  Stripe Webhook (must be BEFORE express.json)
// ==============================
// Stripe requires the raw request body to verify signatures.
app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security middleware
app.use(helmet()); // Set security headers
app.use(mongoSanitize()); // Sanitize data to prevent MongoDB injection
app.use(xss()); // Prevent XSS attacks

// CORS middleware
// Support multiple frontend origins via comma-separated FRONTEND_URL(s)
const rawFrontend = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = rawFrontend.split(",").map((s) => s.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like Postman or server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Rate limiting
app.use("/api/", apiLimiter);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/resources", require("./routes/resourceRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/providers", require("./routes/providerRoutes"));

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Evnity API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      admin: "/api/admin",
      events: "/api/events",
      resources: "/api/resources",
      services: "/api/services",
      bookings: "/api/bookings",
      reviews: "/api/reviews",
      notifications: "/api/notifications",
      users: "/api/users",
      upload: "/api/upload",
    },
  });
});

// Handle 404 - Route not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log(" Evnity Backend Server Started!");
  console.log("=".repeat(50));
  console.log(
    ` Server running in ${process.env.NODE_ENV || "development"} mode`
  );
  console.log(` Port: ${PORT}`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Health: http://localhost:${PORT}/health`);
  console.log(` Auth API: http://localhost:${PORT}/api/auth`);
  console.log("=".repeat(50) + "\n");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error(` Uncaught Exception: ${err.message}`);
  process.exit(1);
});

module.exports = app;
