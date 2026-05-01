const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Memory storage for multer
const storage = multer.memoryStorage();

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/gif" ||
      file.mimetype === "image/webp"
    ) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."),
        false
      );
    }
  },
});

// Helper function to upload single image
const uploadSingle = (fieldName = "image") => {
  return upload.single(fieldName);
};

// Helper function to upload multiple images
const uploadMultiple = (fieldName = "images", maxCount = 10) => {
  return upload.array(fieldName, maxCount);
};

// Helper function to upload multiple fields
const uploadFields = (fields) => {
  return upload.fields(fields);
};

// Helper function to upload image buffer to Cloudinary
const uploadToCloudinary = async (buffer, folder = "evnity") => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "image",
        transformation: [{ width: 1000, height: 1000, crop: "limit" }],
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    ).end(buffer);
  });
};

// Helper function to upload multiple images to Cloudinary
const uploadMultipleToCloudinary = async (files, folder = "evnity") => {
  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file.buffer, folder)
  );
  return Promise.all(uploadPromises);
};

// Helper function to delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
    throw error;
  }
};

// Export all functions
module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteImage,
};

