const stripeLib = require("stripe");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationHelper");
const { sendBookingConfirmationEmail } = require("../utils/emailService");
const {
  getListingFromBooking,
  getListingDisplayName,
  getPaymentOptionsFromBooking,
} = require("../utils/bookingPayment");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
    err.statusCode = 500;
    throw err;
  }
  return stripeLib(key);
}

function getPlatformFeePercentage() {
  const val = parseInt(process.env.PLATFORM_FEE_PERCENTAGE);
  return Number.isFinite(val) && val > 0 ? val : 10;
}

function calculateFees(totalAmount, feePercentage = getPlatformFeePercentage()) {
  const platformFee = Math.round(totalAmount * (feePercentage / 100));
  const providerPayout = totalAmount - platformFee;
  return { platformFee, providerPayout, feePercentage };
}

// ─────────────────────────────────────────────
// @desc    Create Stripe Checkout Session
// @route   POST /api/payments/stripe/checkout-session
// @access  Private/Customer
// ─────────────────────────────────────────────
exports.createStripeCheckoutSession = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId)
      .populate("event")
      .populate("resource")
      .populate("service")
      .populate("provider");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const isTestMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
    console.log("💳 Checkout session debug:", {
      bookingId,
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
      isTestMode,
    });

    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }

    if (booking.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Booking not accepted" });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "This booking has already been paid" });
    }

    const listing = getListingFromBooking(booking);
    if (!listing) {
      return res.status(400).json({ success: false, message: "Booking listing not found" });
    }

    const paymentOptions = getPaymentOptionsFromBooking(booking);

    if (!paymentOptions?.stripe?.enabled) {
      return res.status(400).json({ success: false, message: "Stripe not enabled for this listing" });
    }

    const provider = booking.provider;

    if (!provider?.stripeAccountId || !provider?.stripeConnected) {
      return res.status(400).json({ success: false, message: "Provider Stripe account not ready" });
    }

    if (!provider.stripeChargesEnabled) {
      return res.status(400).json({ success: false, message: "Provider Stripe account not ready" });
    }

    const totalAmount = Number(booking.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid booking amount" });
    }

    const rawCurrency = paymentOptions?.stripe?.currency;
    const listingDisplayName = getListingDisplayName(booking, listing);

   const currency = (rawCurrency && rawCurrency.trim())
  ? rawCurrency.trim().toLowerCase()
  : "pkr";

    const amountInSmallestUnit = Math.round(totalAmount * 100);

    const { platformFee, providerPayout, feePercentage } = calculateFees(
      totalAmount,
      getPlatformFeePercentage()
    );

    booking.platformFeePercentage = feePercentage;
    booking.platformFee = platformFee;
    booking.providerPayout = providerPayout;
    await booking.save();

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
      .split(",")[0]
      .trim();

    const successUrl = `${frontendUrl}/bookings/${booking._id}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/bookings/${booking._id}?cancelled=true`;

    console.log("✅ Success URL:", successUrl);

    const stripe = getStripe();

    const sessionPayload = {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountInSmallestUnit,
            product_data: {
              name: listingDisplayName,
              description: `Booking for ${new Date(booking.eventDate).toDateString()} (${booking.startTime} – ${booking.endTime})`,
            },
          },
        },
      ],
      metadata: {
        bookingId: booking._id.toString(),
        bookingType: booking.bookingType,
        customerId: req.user._id.toString(),
        providerId: provider._id.toString(),
        platformFee: platformFee.toString(),
        providerPayout: providerPayout.toString(),
        currency,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (provider.stripeAccountId && provider.stripePayoutsEnabled) {
      sessionPayload.payment_intent_data = {
        application_fee_amount: Math.round(platformFee * 100),
        transfer_data: {
          destination: provider.stripeAccountId,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);

    booking.paymentMethod = "stripe";
    booking.paymentProvider = "stripe";
    booking.paymentStatus = "pending";
    booking.stripeCheckoutSessionId = session.id;
    await booking.save();

    console.log("✅ Stripe session created:", session.id, "→", session.url);

    return res.status(200).json({
      success: true,
      message: "Stripe checkout session created",
      data: {
        sessionId: session.id,
        url: session.url,
        fees: {
          totalAmount,
          platformFee,
          providerPayout,
          feePercentage: `${feePercentage}%`,
          currency: currency.toUpperCase(),
        },
      },
    });
  } catch (error) {
    console.error("❌ Create Stripe checkout session error:", error);

    if (error.type && error.type.startsWith("Stripe")) {
      return res.status(400).json({
        success: false,
        message: `Stripe error: ${error.message}`,
        stripeError: { type: error.type, code: error.code },
      });
    }

    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Stripe Webhook Handler
// @route   POST /api/payments/stripe/webhook
// @access  Public (Stripe only)
// ─────────────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("Stripe webhook config error:", e.message);
    return res.status(500).send("Stripe is not configured");
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set in environment");
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (stripeEvent.type) {

      case "checkout.session.completed": {
        const session = stripeEvent.data.object;
        const bookingId = session?.metadata?.bookingId;

        if (!bookingId) {
          console.warn("Stripe webhook: no bookingId in session metadata");
          return res.status(200).json({ received: true });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
          console.warn(`Stripe webhook: booking ${bookingId} not found`);
          return res.status(200).json({ received: true });
        }

        if (booking.paymentStatus === "paid") {
          console.log(`Stripe webhook: booking ${bookingId} already paid, skipping`);
          return res.status(200).json({ received: true });
        }

        booking.paymentMethod = "stripe";
        booking.paymentProvider = "stripe";
        booking.paymentStatus = "paid";
        booking.paidAt = new Date();
        booking.stripeCheckoutSessionId = session.id || booking.stripeCheckoutSessionId;
        booking.stripePaymentIntentId = session.payment_intent || booking.stripePaymentIntentId;
        booking.platformFee = Number(session?.metadata?.platformFee || booking.platformFee || 0);
        booking.providerPayout = Number(session?.metadata?.providerPayout || booking.providerPayout || 0);
        booking.transferStatus = "paid";
        booking.transferredAt = new Date();

        // Keep "accepted" so provider sees the Accept Payment button
        await booking.save();
        console.log(`✅ Webhook: booking ${bookingId} marked as PAID, status stays: ${booking.status}`);

        setImmediate(async () => {
          try {
            const [customer, provider] = await Promise.all([
              User.findById(booking.customer),
              User.findById(booking.provider),
            ]);

            if (provider) {
              await createNotification({
                user: provider._id,
                recipientRole: "provider",  // ✅ provider receives this
                type: "payment_received",
                title: "Payment Received — Action Required",
                message: `Customer has paid Rs. ${booking.totalAmount}. Go to the booking to accept payment.`,
                relatedEntity: { entityType: "booking", entityId: booking._id },
                actionUrl: `/bookings/${booking._id}`,
              });
            }

            if (customer) {
              await createNotification({
                user: customer._id,
                recipientRole: "customer",  // ✅ customer receives this
                type: "payment_confirmed",
                title: "Payment Successful",
                message: `Your payment of Rs. ${booking.totalAmount} has been received. Waiting for provider to confirm.`,
                relatedEntity: { entityType: "booking", entityId: booking._id },
                actionUrl: `/bookings/${booking._id}`,
              });
            }

            if (customer && provider) {
              await Promise.allSettled([
                sendBookingConfirmationEmail(customer.email, customer.name, {
                  type: booking.bookingType,
                  eventDate: booking.eventDate,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                  totalAmount: booking.totalAmount,
                  paymentStatus: "paid",
                }),
                sendBookingConfirmationEmail(provider.email, provider.name, {
                  type: booking.bookingType,
                  eventDate: booking.eventDate,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                  totalAmount: booking.totalAmount,
                  providerPayout: booking.providerPayout,
                  platformFee: booking.platformFee,
                  paymentStatus: "paid",
                }),
              ]);
            }
          } catch (notifyErr) {
            console.error("Stripe webhook notify/email error:", notifyErr);
          }
        });

        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = stripeEvent.data.object;
        console.warn(`Payment failed: ${paymentIntent.id}`, paymentIntent.last_payment_error?.message);

        const booking = await Booking.findOne({ stripePaymentIntentId: paymentIntent.id });
        if (booking && booking.paymentStatus !== "paid") {
          booking.paymentStatus = "failed";
          await booking.save();

          setImmediate(async () => {
            try {
              await createNotification({
                user: booking.customer,
                recipientRole: "customer",  // ✅ customer receives this
                type: "payment_failed",
                title: "Payment Failed",
                message: `Your payment failed: ${paymentIntent.last_payment_error?.message || "Unknown error"}. Please try again.`,
                relatedEntity: { entityType: "booking", entityId: booking._id },
                actionUrl: `/bookings/${booking._id}`,
              });
            } catch (err) {
              console.error("Failed to notify customer of payment failure:", err);
            }
          });
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = stripeEvent.data.object;
        console.warn(`Dispute created: ${dispute.id} for charge: ${dispute.charge}`);
        break;
      }

      case "charge.refunded": {
        const charge = stripeEvent.data.object;
        console.log(`Charge refunded: ${charge.id}`);
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return res.status(200).json({ received: true });
  }
};

// ─────────────────────────────────────────────
// @desc    Get booking payment details
// @route   GET /api/payments/booking/:bookingId
// @access  Private
// ─────────────────────────────────────────────
exports.getBookingPaymentDetails = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate("customer", "name email")
      .populate("provider", "name email stripeConnected stripeChargesEnabled")
      .populate("event", "title charges paymentOptions")
      .populate("service", "title pricing paymentOptions")
      .populate("resource", "name rentalPrice paymentOptions");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const isCustomer = booking.customer._id.toString() === req.user._id.toString();
    const isProvider = booking.provider._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to view payment details" });
    }

    const listing = getListingFromBooking(booking);

    return res.status(200).json({
      success: true,
      data: {
        booking: {
          _id: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          totalAmount: booking.totalAmount,
          platformFee: booking.platformFee,
          platformFeePercentage: booking.platformFeePercentage,
          providerPayout: booking.providerPayout,
          paymentMethod: booking.paymentMethod,
          paymentProvider: booking.paymentProvider,
          paidAt: booking.paidAt,
          stripeCheckoutSessionId: booking.stripeCheckoutSessionId,
          stripePaymentIntentId: booking.stripePaymentIntentId,
          transferStatus: booking.transferStatus,
          transferredAt: booking.transferredAt,
          customer: booking.customer,
          provider: booking.provider,
          event: booking.event,
          service: booking.service,
          resource: booking.resource,
          listing,
          bookingType: booking.bookingType,
          eventDate: booking.eventDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      },
    });
  } catch (error) {
    console.error("Get booking payment details error:", error);
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Verify Stripe session & update booking if paid
// @route   POST /api/payments/stripe/verify-session
// @access  Private/Customer
// ─────────────────────────────────────────────
exports.verifyStripeSession = async (req, res, next) => {
  try {
    const { sessionId, bookingId } = req.body;

    if (!sessionId || !bookingId) {
      return res.status(400).json({ success: false, message: "sessionId and bookingId are required" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: "Stripe session not found" });
    }

    const booking = await Booking.findById(bookingId)
      .populate("customer", "name email")
      .populate("provider", "name email");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    // Already paid — just return current booking
    if (booking.paymentStatus === "paid") {
      return res.status(200).json({ success: true, alreadyPaid: true, data: { booking } });
    }

    if (session.payment_status === "paid") {
      const feePercentage = getPlatformFeePercentage();
      const { platformFee, providerPayout } = calculateFees(booking.totalAmount, feePercentage);

      booking.paymentStatus = "paid";
      booking.paidAt = new Date();
      booking.paymentMethod = "stripe";
      booking.paymentProvider = "stripe";
      booking.stripeCheckoutSessionId = session.id;
      booking.stripePaymentIntentId = session.payment_intent || booking.stripePaymentIntentId;
      booking.platformFee = platformFee;
      booking.platformFeePercentage = feePercentage;
      booking.providerPayout = providerPayout;
      booking.transferStatus = "paid";

      // Keep "accepted" so provider sees the Accept Payment button
      await booking.save();
      console.log(`✅ verifyStripeSession: booking ${bookingId} marked as PAID, status stays: ${booking.status}`);

      setImmediate(async () => {
        try {
          const provider = booking.provider;
          const customer = booking.customer;

          if (provider) {
            await createNotification({
              user: provider._id,
              recipientRole: "provider",    // ✅ provider receives this
              type: "payment_received",
              title: "Payment Received — Action Required",
              message: `Customer has paid Rs. ${booking.totalAmount}. Go to the booking to accept payment.`,
              relatedEntity: { entityType: "booking", entityId: booking._id },
              actionUrl: `/bookings/${booking._id}`,
            });
          }

          if (customer) {
            await createNotification({
              user: customer._id,
              recipientRole: "customer",    // ✅ customer receives this
              type: "payment_confirmed",
              title: "Payment Successful",
              message: `Your payment of Rs. ${booking.totalAmount} has been received. Waiting for provider to confirm.`,
              relatedEntity: { entityType: "booking", entityId: booking._id },
              actionUrl: `/bookings/${booking._id}`,
            });
          }
        } catch (err) {
          console.error("verifyStripeSession notify error:", err);
        }
      });

      return res.status(200).json({
        success: true,
        message: "Payment verified. Waiting for provider to accept.",
        data: { booking },
      });
    }

    return res.status(200).json({
      success: false,
      message: `Payment status is '${session.payment_status}' — not yet paid`,
      paymentStatus: session.payment_status,
    });

  } catch (error) {
    console.error("verifyStripeSession error:", error);
    next(error);
  }
};

exports.getAdminDeductedFees = async (req, res, next) => {
  try {
    const result = await Booking.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: null,
          totalBookings:      { $sum: 1 },
          totalGrossRevenue:  { $sum: "$totalAmount" },
          totalDeductedFees:  { $sum: "$platformFee" },
          totalPaidToProviders: { $sum: "$providerPayout" },
        },
      },
    ]);

    const totals = result[0] || {
      totalBookings: 0,
      totalGrossRevenue: 0,
      totalDeductedFees: 0,
      totalPaidToProviders: 0,
    };

    return res.status(200).json({
      success: true,
      data: { totals },
    });
  } catch (error) {
    console.error("getAdminDeductedFees error:", error);
    next(error);
  }
};