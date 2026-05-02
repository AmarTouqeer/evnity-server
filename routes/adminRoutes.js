const express = require("express");
const { body } = require("express-validator");
const {
  getPendingUsers,
  getApprovedUsers,
  getRejectedUsers,
  approveUser,
  rejectUser,
  getUserStats,
  toggleBlockUser,
  getPendingEvents,
  approveEvent,
  rejectEvent,
  getPendingResources,
  approveResource,
  rejectResource,
  getPendingServices,
  approveService,
  rejectService,
  getDashboardStats,
  blockUser,
  unblockUser,
  getAdminReviews,
  adminDeleteReview,
  adminDeleteEvent,
  adminDeleteService,
  adminDeleteResource,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validation");

const router = express.Router();

// Validation rules
const rejectUserValidation = [
  body("reason")
    .trim()
    .notEmpty()
    .withMessage("Rejection reason is required")
    .isLength({ min: 10, max: 500 })
    .withMessage("Rejection reason must be between 10 and 500 characters"),
];

const blockUserValidation = [
  body("reason")
    .if((value, { req }) => req.body.isBlocking === true)
    .trim()
    .notEmpty()
    .withMessage("Block reason is required when blocking a user")
    .isLength({ min: 10, max: 500 })
    .withMessage("Block reason must be between 10 and 500 characters"),
];

const rejectValidation = [
  body("reason")
    .trim()
    .notEmpty()
    .withMessage("Rejection reason is required")
    .isLength({ min: 10, max: 500 })
    .withMessage("Rejection reason must be between 10 and 500 characters"),
];

// All routes require authentication and admin role
router.use(protect);
router.use(authorize("admin"));

// Dashboard
router.get("/stats", getDashboardStats);

// User approval management routes
router.get("/pending-users", getPendingUsers);
router.get("/approved-users", getApprovedUsers);
router.get("/rejected-users", getRejectedUsers);
router.post("/approve-user/:userId", approveUser);
router.post("/reject-user/:userId", rejectUserValidation, validate, rejectUser);
router.get("/user-stats", getUserStats);
router.put(
  "/toggle-block/:userId",
  blockUserValidation,
  validate,
  toggleBlockUser
);

// Event approval management routes
router.get("/pending-events", getPendingEvents);
router.post("/approve-event/:eventId", approveEvent);
router.post("/reject-event/:eventId", rejectValidation, validate, rejectEvent);

// Resource approval management routes
router.get("/pending-resources", getPendingResources);
router.post("/approve-resource/:resourceId", approveResource);
router.post("/reject-resource/:resourceId", rejectValidation, validate, rejectResource);

// Service approval management routes
router.get("/pending-services", getPendingServices);
router.post("/approve-service/:serviceId", approveService);
router.post("/reject-service/:serviceId", rejectValidation, validate, rejectService);


router.get("/reviews", getAdminReviews);
router.delete("/reviews/:reviewId", adminDeleteReview);

// Delete listings
router.delete("/events/:eventId", adminDeleteEvent);
router.delete("/services/:serviceId", adminDeleteService);
router.delete("/resources/:resourceId", adminDeleteResource);

// Block / Unblock (separate endpoints matching the frontend)
router.put("/block-user/:userId", blockUser);
router.put("/unblock-user/:userId", unblockUser);

module.exports = router;
