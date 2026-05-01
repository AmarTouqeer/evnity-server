const express = require("express");
const {
  getBookings,
  getBooking,
  createBooking,
  acceptBooking,
  rejectBooking,
  confirmBooking,
  uploadReceipt,
  cancelBooking,
  completeBooking,
  markResourceReturned,
  getProviderDashboardStats,
} = require("../controllers/bookingController");
const { protect, authorize } = require("../middleware/auth");
const { uploadSingle } = require("../middleware/upload");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Provider dashboard stats
router.get(
  "/provider/dashboard-stats",
  authorize("provider"),
  getProviderDashboardStats
);

// Customer and Provider routes
router.get("/", getBookings);
router.get("/:id", getBooking);

// Customer routes
router.post("/", authorize("customer"), createBooking);
router.put("/:id/confirm", authorize("customer"), confirmBooking);
router.post(
  "/:id/receipt",
  authorize("customer"),
  uploadSingle("receipt"),
  uploadReceipt
);
router.put("/:id/cancel", cancelBooking);

// Provider routes
router.put("/:id/accept", authorize("provider"), acceptBooking);
router.put("/:id/reject", authorize("provider"), rejectBooking);
router.put("/:id/complete", authorize("provider"), completeBooking);
router.put("/:id/return", authorize("provider"), markResourceReturned);

module.exports = router;
