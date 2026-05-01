const express = require("express");
const {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getMyEvents,
} = require("../controllers/eventController");
const {
  protect,
  authorize,
  checkAdminApproval,
} = require("../middleware/auth");
const { uploadMultiple } = require("../middleware/upload");

const router = express.Router();

// Public routes
router.get("/", getEvents);
router.get("/:id", getEvent);

// Protected routes
router.use(protect);
router.use(checkAdminApproval);

// Provider routes
router.post(
  "/",
  authorize("provider"),
  uploadMultiple("images", 10),
  createEvent
);
router.get("/provider/my-events", authorize("provider"), getMyEvents);
router.put(
  "/:id",
  authorize("provider"),
  uploadMultiple("images", 10),
  updateEvent
);
router.delete("/:id", authorize("provider"), deleteEvent);

module.exports = router;
