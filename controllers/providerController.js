const stripeLib = require("stripe");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationHelper");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
    err.statusCode = 500;
    throw err;
  }
  return stripeLib(key);
}

// @desc    Get Stripe Connect OAuth URL
// @route   GET /api/providers/stripe/connect-url
// @access  Private/Provider
exports.getStripeConnectUrl = async (req, res, next) => {
  try {
    const provider = await User.findById(req.user._id);

    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    if (provider.role !== "provider") {
      return res.status(403).json({ success: false, message: "Only providers can connect Stripe account" });
    }

    const clientId = process.env.STRIPE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ success: false, message: "Stripe Connect is not configured" });
    }

    // FIX: Always generate a fresh URL even if already connected,
    // so "Manage in Stripe" still works. Let the callback handle idempotency.
    const redirectUri = `${process.env.API_URL || "http://localhost:5000"}/api/providers/stripe/callback`;

    // Use provider._id as state (used to look up provider in callback)
    const authUrl = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&state=${provider._id}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.status(200).json({
      success: true,
      message: "Stripe Connect URL generated",
      data: {
        authUrl, // ✅ Frontend reads response.data.authUrl — matches exactly
      },
    });
  } catch (error) {
    console.error("Get Stripe connect URL error:", error);
    next(error);
  }
};

// @desc    Handle Stripe OAuth callback
// @route   GET /api/providers/stripe/callback
// @access  Public (Stripe redirects here)
exports.stripeConnectCallback = async (req, res, next) => {
  // FIX: Use the dashboard route that actually exists in your React Router
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
  const SUCCESS_URL = `${FRONTEND_URL}/provider/dashboard?stripe=success`;
  const ERROR_URL = (msg) =>
    `${FRONTEND_URL}/provider/dashboard?stripe=error&msg=${encodeURIComponent(msg)}`;

  try {
    const { code, state, error, error_description } = req.query;

    // ── Stripe returned an error ─────────────────────────────────────────
    if (error) {
      console.error("Stripe OAuth error:", error, error_description);
      return res.redirect(ERROR_URL(error_description || error));
    }

    if (!code || !state) {
      return res.redirect(ERROR_URL("Missing authorization code or state"));
    }

    // ── Load provider ────────────────────────────────────────────────────
    const provider = await User.findById(state);
    if (!provider) {
      return res.redirect(ERROR_URL("Provider not found"));
    }

    if (provider.role !== "provider") {
      return res.redirect(ERROR_URL("Not a provider account"));
    }

    // ── FIX: Idempotency guard ───────────────────────────────────────────
    // If provider is already connected (first call succeeded), skip token
    // exchange and redirect cleanly. This prevents StripeInvalidGrantError
    // when the callback URL is hit a second time with the same code.
    if (provider.stripeConnected && provider.stripeAccountId) {
      console.log(`Stripe callback: provider ${provider._id} already connected — skipping token exchange`);
      return res.redirect(SUCCESS_URL);
    }

    // ── Exchange code for access token ───────────────────────────────────
    const stripe = getStripe();

    let response;
    try {
      response = await stripe.oauth.token({
        grant_type: "authorization_code",
        code,
      });
    } catch (stripeError) {
      console.error("Stripe OAuth token error:", stripeError);

      // FIX: Handle already-used code gracefully (race condition / double redirect)
      if (stripeError.rawType === "invalid_grant") {
        // Check if first call already saved the account successfully
        const refreshedProvider = await User.findById(state);
        if (refreshedProvider?.stripeConnected && refreshedProvider?.stripeAccountId) {
          console.log("Stripe callback: code already used but provider connected — redirecting to success");
          return res.redirect(SUCCESS_URL);
        }
        return res.redirect(ERROR_URL("Authorization code expired. Please try connecting again."));
      }

      return res.redirect(ERROR_URL("Failed to connect Stripe account"));
    }

    // ── Fetch real account status from Stripe ────────────────────────────
    const account = await stripe.accounts.retrieve(response.stripe_user_id);

    // In test mode, Stripe sets charges_enabled=false when "Skip this form" is used.
    // Force true for test accounts so the UI toggle works during development.
    const isTestMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");

    // ── Save to DB ───────────────────────────────────────────────────────
    provider.stripeAccountId = response.stripe_user_id;
    provider.stripeConnected = true;
    provider.stripeConnectStatus = (account.details_submitted || isTestMode) ? "active" : "pending";
    provider.stripeConnectedAt = new Date();
    provider.stripeChargesEnabled = isTestMode ? true : account.charges_enabled;
    provider.stripePayoutsEnabled = isTestMode ? true : account.payouts_enabled;
    await provider.save();

    // ── Notify provider (best-effort) ────────────────────────────────────
    try {
      await createNotification({
        user: provider._id,
        type: "stripe_connected",
        title: "Stripe Account Connected",
        message: "Your Stripe account has been successfully connected. You can now receive payments.",
        actionUrl: "/provider/dashboard",
      });
    } catch (notifyErr) {
      console.error("Stripe connect notification error:", notifyErr);
      // Don't fail the redirect over a notification error
    }

    return res.redirect(SUCCESS_URL);

  } catch (error) {
    console.error("Stripe connect callback error:", error);
    return res.redirect(
      `${FRONTEND_URL}/provider/dashboard?stripe=error&msg=${encodeURIComponent("Something went wrong")}`
    );
  }
};

// @desc    Disconnect Stripe account
// @route   POST /api/providers/stripe/disconnect
// @access  Private/Provider
exports.disconnectStripe = async (req, res, next) => {
  try {
    const provider = await User.findById(req.user._id);

    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    if (provider.role !== "provider") {
      return res.status(403).json({ success: false, message: "Only providers can disconnect Stripe" });
    }

    if (!provider.stripeConnected || !provider.stripeAccountId) {
      return res.status(400).json({ success: false, message: "Stripe account is not connected" });
    }

    const stripe = getStripe();

    try {
      await stripe.oauth.deauthorize({ stripe_user_id: provider.stripeAccountId });
    } catch (err) {
      console.error("Stripe deauthorize error:", err);
      // Continue anyway — always clean up locally
    }

    provider.stripeAccountId = null;
    provider.stripeConnected = false;
    provider.stripeConnectStatus = "not_connected";
    provider.stripeConnectedAt = null;
    provider.stripeChargesEnabled = false;
    provider.stripePayoutsEnabled = false;
    provider.stripeRefreshToken = null;
    await provider.save();

    try {
      await createNotification({
        user: provider._id,
        type: "stripe_disconnected",
        title: "Stripe Account Disconnected",
        message: "Your Stripe account has been disconnected",
        actionUrl: "/provider/dashboard",
      });
    } catch (notifyErr) {
      console.error("Stripe disconnect notification error:", notifyErr);
    }

    return res.status(200).json({ success: true, message: "Stripe account disconnected successfully" });
  } catch (error) {
    console.error("Disconnect Stripe error:", error);
    next(error);
  }
};

// @desc    Get provider Stripe status
// @route   GET /api/providers/stripe/status
// @access  Private/Provider
exports.getStripeStatus = async (req, res, next) => {
  try {
    const provider = await User.findById(req.user._id);

    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    if (provider.role !== "provider") {
      return res.status(403).json({ success: false, message: "Only providers can view Stripe status" });
    }

    let accountStatus = null;
    if (provider.stripeConnected && provider.stripeAccountId) {
      try {
        const stripe = getStripe();
        const account = await stripe.accounts.retrieve(provider.stripeAccountId);
        accountStatus = {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements: account.requirements,
          type: account.type,
          country: account.country,
        };
      } catch (err) {
        console.error("Error fetching Stripe account status:", err);
      }
    }

    const isTestMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");

    return res.status(200).json({
      success: true,
      data: {
        isConnected: provider.stripeConnected,
        stripeAccountId: provider.stripeAccountId || null,
        // Force active + charges enabled in test mode
        stripeConnectStatus: isTestMode && provider.stripeConnected ? "active" : provider.stripeConnectStatus,
        stripeChargesEnabled: isTestMode && provider.stripeConnected ? true : provider.stripeChargesEnabled,
        stripePayoutsEnabled: isTestMode && provider.stripeConnected ? true : provider.stripePayoutsEnabled,
        stripeConnectedAt: provider.stripeConnectedAt,
        accountStatus,
      },
    });
  } catch (error) {
    console.error("Get Stripe status error:", error);
    next(error);
  }
};

// @desc    Verify Stripe account is ready for charges
// @route   GET /api/providers/stripe/verify
// @access  Private/Provider
exports.verifyStripeReady = async (req, res, next) => {
  try {
    const provider = await User.findById(req.user._id);

    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    if (provider.role !== "provider") {
      return res.status(403).json({ success: false, message: "Only providers can verify Stripe" });
    }

    if (!provider.stripeConnected || !provider.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "Stripe account is not connected",
        isReady: false,
      });
    }

    if (!provider.stripeChargesEnabled) {
      return res.status(400).json({
        success: false,
        message: "Stripe account is not ready for charges. Please complete account setup.",
        isReady: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Stripe account is ready for payments",
      isReady: true,
    });
  } catch (error) {
    console.error("Verify Stripe ready error:", error);
    next(error);
  }
};