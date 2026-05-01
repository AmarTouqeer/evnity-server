const express = require("express");
const {
  getResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getMyResources,
} = require("../controllers/resourceController");
const { protect, authorize, checkAdminApproval } = require("../middleware/auth");
const { uploadMultiple } = require("../middleware/upload");

const router = express.Router();

// Public routes
router.get("/", getResources);
router.get("/:id", getResource);

// Protected routes
router.use(protect);
router.use(checkAdminApproval);

// Provider routes
router.post("/", authorize("provider"), uploadMultiple("images", 10), createResource);
router.get("/provider/my-resources", authorize("provider"), getMyResources);
router.put("/:id", authorize("provider"), uploadMultiple("images", 10), updateResource);
router.delete("/:id", authorize("provider"), deleteResource);

module.exports = router;

