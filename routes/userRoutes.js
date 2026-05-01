const express = require("express");
const {
  getProfile,
  updateProfile,
  uploadAvatar,
} = require("../controllers/userController");
const { protect } = require("../middleware/auth");
const { uploadSingle } = require("../middleware/upload");

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.post("/avatar", uploadSingle("avatar"), uploadAvatar);

module.exports = router;

