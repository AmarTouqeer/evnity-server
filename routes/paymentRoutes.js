const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  createStripeCheckoutSession,
  verifyStripeSession,
  getBookingPaymentDetails,
  getAdminDeductedFees,
} = require("../controllers/paymentController");

const router = express.Router();

router.post(
  "/stripe/checkout-session",
  protect,
  authorize("customer"),
  createStripeCheckoutSession
);

router.post("/stripe/verify-session", protect, verifyStripeSession);


router.get("/booking/:bookingId", protect, getBookingPaymentDetails);


router.get(
  "/stripe/admin/deducted-fees",
  protect,
  authorize("admin"),
  getAdminDeductedFees
);
module.exports = router;