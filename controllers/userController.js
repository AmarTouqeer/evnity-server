const User = require("../models/User");
const { uploadToCloudinary } = require("../middleware/upload");

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, city, address, providerInfo } = req.body;

    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (city) user.city = city;
    if (address !== undefined) user.address = address;

    // Update provider info if user is provider
    if (req.user.role === "provider" && providerInfo) {
      const parsedInfo = typeof providerInfo === "string" 
        ? JSON.parse(providerInfo) 
        : providerInfo;
      
      if (parsedInfo.businessName) user.providerInfo.businessName = parsedInfo.businessName;
      if (parsedInfo.description) user.providerInfo.description = parsedInfo.description;
      if (parsedInfo.experience) user.providerInfo.experience = parsedInfo.experience;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { user },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    next(error);
  }
};

// @desc    Upload avatar
// @route   POST /api/users/avatar
// @access  Private
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Avatar image is required",
      });
    }

    const user = await User.findById(req.user._id);

    // Delete old avatar if exists
    if (user.avatar) {
      // Extract public ID from URL if it's a Cloudinary URL
      // This is optional - Cloudinary free tier allows unlimited uploads
    }

    // Upload new avatar
    const avatar = await uploadToCloudinary(req.file.buffer, "evnity/avatars");

    user.avatar = avatar.url;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      data: { avatar: user.avatar },
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    next(error);
  }
};

