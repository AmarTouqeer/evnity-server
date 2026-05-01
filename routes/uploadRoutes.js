const express = require("express");
const { uploadSingle, uploadMultiple, uploadToCloudinary } = require("../middleware/upload");
const { protect } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Upload single image
router.post("/image", uploadSingle("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    const result = await uploadToCloudinary(req.file.buffer, "evnity/uploads");
    
    res.status(200).json({
      success: true,
      data: {
        url: result.url,
        publicId: result.publicId,
      },
    });
  } catch (error) {
    console.error("Upload image error:", error);
    next(error);
  }
});

// Upload multiple images
router.post("/multiple", uploadMultiple("images", 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Images are required",
      });
    }

    const { uploadMultipleToCloudinary } = require("../middleware/upload");
    const results = await uploadMultipleToCloudinary(req.files, "evnity/uploads");
    
    res.status(200).json({
      success: true,
      data: {
        images: results,
      },
    });
  } catch (error) {
    console.error("Upload multiple images error:", error);
    next(error);
  }
});

module.exports = router;

