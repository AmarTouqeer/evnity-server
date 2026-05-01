const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  getStripeConnectUrl,
  stripeConnectCallback,
  disconnectStripe,
  getStripeStatus,
  verifyStripeReady,
} = require("../controllers/providerController");

const router = express.Router();

// ==============================
// PROVIDER STRIPE ROUTES
// ==============================

// Get Stripe Connect OAuth URL
// GET /api/providers/stripe/connect-url
router.get("/stripe/connect-url", protect, authorize("provider"), getStripeConnectUrl);

// Stripe OAuth callback (public, Stripe redirects here)
// GET /api/providers/stripe/callback?code=...&state=...
router.get("/stripe/callback", stripeConnectCallback);

// Disconnect Stripe account
// POST /api/providers/stripe/disconnect
router.post("/stripe/disconnect", protect, authorize("provider"), disconnectStripe);

// Get Stripe connection status
// GET /api/providers/stripe/status
router.get("/stripe/status", protect, authorize("provider"), getStripeStatus);

// Verify Stripe account is ready
// GET /api/providers/stripe/verify
router.get("/stripe/verify", protect, authorize("provider"), verifyStripeReady);

module.exports = router;

