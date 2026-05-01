const express = require("express");
const {
  createReview,
  getReviews,
  updateReview,
  deleteReview,
  replyToReview,
} = require("../controllers/reviewController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/:type/:id", getReviews);

// Protected routes
router.use(protect);
router.post("/", createReview);
router.put("/:id", updateReview);
router.delete("/:id", deleteReview);
router.post("/:id/reply", authorize("provider"), replyToReview);

module.exports = router;