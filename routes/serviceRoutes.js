const express = require("express");
const {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  getMyServices,
} = require("../controllers/serviceController");
const { protect, authorize, checkAdminApproval } = require("../middleware/auth");
const { uploadMultiple } = require("../middleware/upload");

const router = express.Router();

// Public routes
router.get("/", getServices);
router.get("/:id", getService);

// Protected routes
router.use(protect);
router.use(checkAdminApproval);

// Provider routes
router.post("/", authorize("provider"), uploadMultiple("images", 10), createService);
router.get("/provider/my-services", authorize("provider"), getMyServices);
router.put("/:id", authorize("provider"), uploadMultiple("images", 10), updateService);
router.delete("/:id", authorize("provider"), deleteService);

module.exports = router;

