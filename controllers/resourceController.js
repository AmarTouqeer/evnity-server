const Resource = require("../models/Resource");
const { uploadMultipleToCloudinary } = require("../middleware/upload");
const { createNotification } = require("../utils/notificationHelper");
const User = require("../models/User");
const { parseMaybeJson, normalizePaymentOptions } = require("../utils/paymentOptions");

// @desc    Get all resources (with filters)
// @route   GET /api/resources
// @access  Public
exports.getResources = async (req, res, next) => {
  try {
    const {
      category,
      city,
      minPrice,
      maxPrice,
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
      adminApprovalStatus,
    } = req.query;

    // Base query
    const query = {};

    // If adminApprovalStatus is provided in query params, use it
    // Otherwise, default to approved for public listings
    if (adminApprovalStatus) {
      query.adminApprovalStatus = adminApprovalStatus;
    } else {
      query.adminApprovalStatus = "approved";
      query.isPublished = true;
      query.isActive = true;
      query.availableQuantity = { $gt: 0 };
    }

    if (category) query.category = category;
    if (city) query["location.city"] = new RegExp(city, "i");
    if (minPrice || maxPrice) {
      query.rentalPrice = {};
      if (minPrice) query.rentalPrice.$gte = Number(minPrice);
      if (maxPrice) query.rentalPrice.$lte = Number(maxPrice);
    }

    const resources = await Resource.find(query)
      .populate("provider", "name email phone city avatar")
      .sort({ [sort]: order === "desc" ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Resource.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        resources,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get resources error:", error);
    next(error);
  }
};

// @desc    Get single resource
// @route   GET /api/resources/:id
// @access  Public
exports.getResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id).populate(
      "provider",
      "name email phone city avatar providerInfo"
    );

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { resource },
    });
  } catch (error) {
    console.error("Get resource error:", error);
    next(error);
  }
};

// @desc    Create resource
// @route   POST /api/resources
// @access  Private/Provider
exports.createResource = async (req, res, next) => {
  try {
    const {
      name,
      description,
      category,
      location,
      rentalPrice,
      deposit,
      quantity,
      availableQuantity,
      images: preUploadedImages,
      paymentOptions,
    } = req.body;

    let images = [];
    if (req.files && req.files.length > 0) {
      images = await uploadMultipleToCloudinary(req.files, "evnity/resources");
    } else if (preUploadedImages && Array.isArray(preUploadedImages)) {
      images = preUploadedImages;
    }

    // Parse location if it's a string
    const locationData =
      typeof location === "string" ? JSON.parse(location) : location;

    const paymentOptionsData = normalizePaymentOptions(parseMaybeJson(paymentOptions));

    const resource = await Resource.create({
      provider: req.user._id,
      name,
      description,
      category,
      location: locationData,
      images,
      rentalPrice: Number(rentalPrice),
      deposit: Number(deposit || 0),
      quantity: Number(quantity),
      availableQuantity: Number(availableQuantity || quantity),
      ...(paymentOptionsData ? { paymentOptions: paymentOptionsData } : {}),
    });

    // Notify admin
    const adminUsers = await User.find({ role: "admin" });
    for (const admin of adminUsers) {
      await createNotification({
        user: admin._id,
        type: "admin_approval",
        recipientRole: "admin",
        title: "New Resource Pending Approval",
        message: `New resource "${name}" is pending approval`,
        relatedEntity: { entityType: "resource", entityId: resource._id },
        actionUrl: `/admin/resources/${resource._id}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Resource created successfully. Waiting for admin approval.",
      data: { resource },
    });
  } catch (error) {
    console.error("Create resource error:", error);
    next(error);
  }
};

// @desc    Update resource
// @route   PUT /api/resources/:id
// @access  Private/Provider
exports.updateResource = async (req, res, next) => {
  try {
    let resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    if (resource.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this resource",
      });
    }

    const {
      name,
      description,
      category,
      location,
      rentalPrice,
      deposit,
      quantity,
      images: providedImages,
      paymentOptions,
    } = req.body;

    // Handle images
    if (providedImages && Array.isArray(providedImages)) {
      resource.images = providedImages;
    } else if (req.files && req.files.length > 0) {
      const newImages = await uploadMultipleToCloudinary(
        req.files,
        "evnity/resources"
      );
      resource.images = newImages;
    }

    if (name) resource.name = name;
    if (description) resource.description = description;
    if (category) resource.category = category;
    if (location)
      resource.location =
        typeof location === "string" ? JSON.parse(location) : location;
    if (rentalPrice) resource.rentalPrice = Number(rentalPrice);
    if (deposit) resource.deposit = Number(deposit);
    if (quantity) {
      const diff = Number(quantity) - resource.quantity;
      resource.quantity = Number(quantity);
      resource.availableQuantity = Math.max(
        0,
        resource.availableQuantity + diff
      );
    }
    if (paymentOptions) {
      const parsed = parseMaybeJson(paymentOptions);
      const normalized = normalizePaymentOptions(parsed);
      if (normalized) resource.paymentOptions = normalized;
    }

    if (resource.adminApprovalStatus === "approved") {
      resource.adminApprovalStatus = "pending";
      resource.isPublished = false;
    }

    await resource.save();

    res.status(200).json({
      success: true,
      message: "Resource updated successfully",
      data: { resource },
    });
  } catch (error) {
    console.error("Update resource error:", error);
    next(error);
  }
};

// @desc    Delete resource
// @route   DELETE /api/resources/:id
// @access  Private/Provider
exports.deleteResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    if (resource.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this resource",
      });
    }

    await resource.deleteOne();

    res.status(200).json({
      success: true,
      message: "Resource deleted successfully",
    });
  } catch (error) {
    console.error("Delete resource error:", error);
    next(error);
  }
};

// @desc    Get provider's resources
// @route   GET /api/resources/provider/my-resources
// @access  Private/Provider
exports.getMyResources = async (req, res, next) => {
  try {
    const resources = await Resource.find({ provider: req.user._id })
      .sort({ createdAt: -1 })
      .populate("provider", "name email");

    res.status(200).json({
      success: true,
      data: { resources },
    });
  } catch (error) {
    console.error("Get my resources error:", error);
    next(error);
  }
};
