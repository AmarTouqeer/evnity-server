const Service = require("../models/Service");
const { uploadMultipleToCloudinary } = require("../middleware/upload");
const { createNotification } = require("../utils/notificationHelper");
const User = require("../models/User");
const { parseMaybeJson, normalizePaymentOptions } = require("../utils/paymentOptions");

// @desc    Get all services (with filters)
// @route   GET /api/services
// @access  Public
exports.getServices = async (req, res, next) => {
  try {
    const {
      category,
      city,
      minPrice,
      maxPrice,
      search,
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
    }

    // Search filter (searches in title and description)
    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
      ];
    }

    if (category) query.category = new RegExp(category, "i");
    if (city) query["location.city"] = new RegExp(city, "i");
    if (minPrice || maxPrice) {
      query["pricing.basePrice"] = {};
      if (minPrice) query["pricing.basePrice"].$gte = Number(minPrice);
      if (maxPrice) query["pricing.basePrice"].$lte = Number(maxPrice);
    }

    const services = await Service.find(query)
      .populate("provider", "name email phone city avatar")
      .sort({ [sort]: order === "desc" ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Service.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        services,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get services error:", error);
    next(error);
  }
};

// @desc    Get single service
// @route   GET /api/services/:id
// @access  Public
exports.getService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate(
      "provider",
      "name email phone city avatar providerInfo"
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { service },
    });
  } catch (error) {
    console.error("Get service error:", error);
    next(error);
  }
};

// @desc    Create service
// @route   POST /api/services
// @access  Private/Provider
exports.createService = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      location,
      pricing,
      availability,
      images: preUploadedImages,
      paymentOptions,
      availableDates,
    } = req.body;

    const availableDatesData =
      typeof availableDates === "string"
        ? JSON.parse(availableDates)
        : availableDates || [];

    let images = [];
    if (req.files && req.files.length > 0) {
      images = await uploadMultipleToCloudinary(req.files, "evnity/services");
    } else if (preUploadedImages && Array.isArray(preUploadedImages)) {
      images = preUploadedImages;
    }

    // Parse JSON fields if they're strings
    const locationData =
      typeof location === "string" ? JSON.parse(location) : location;
    const pricingData =
      typeof pricing === "string" ? JSON.parse(pricing) : pricing;
    const availabilityData =
      typeof availability === "string"
        ? JSON.parse(availability)
        : availability || {};

    const paymentOptionsData = normalizePaymentOptions(parseMaybeJson(paymentOptions));

    const service = await Service.create({
      provider: req.user._id,
      title,
      description,
      category,
      location: locationData,
      images,
      pricing: pricingData,
      availability: availabilityData,
      availableDates: availableDatesData,
      ...(paymentOptionsData ? { paymentOptions: paymentOptionsData } : {}),
    });

    // Notify admin
    const adminUsers = await User.find({ role: "admin" });
    for (const admin of adminUsers) {
      await createNotification({
        user: admin._id,
        recipientRole: "admin",
        type: "admin_approval",
        title: "New Service Pending Approval",
        message: `New service "${title}" is pending approval`,
        relatedEntity: { entityType: "service", entityId: service._id },
        actionUrl: `/admin/services/${service._id}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Service created successfully. Waiting for admin approval.",
      data: { service },
    });
  } catch (error) {
    console.error("Create service error:", error);
    next(error);
  }
};

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private/Provider
exports.updateService = async (req, res, next) => {
  try {
    let service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (service.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this service",
      });
    }

    const {
      title,
      description,
      category,
      location,
      pricing,
      availability,
      images: providedImages,
      paymentOptions,
    } = req.body;

    // Handle images
    if (providedImages && Array.isArray(providedImages)) {
      service.images = providedImages;
    } else if (req.files && req.files.length > 0) {
      const newImages = await uploadMultipleToCloudinary(
        req.files,
        "evnity/services"
      );
      service.images = newImages;
    }

    if (title) service.title = title;
    if (description) service.description = description;
    if (category) service.category = category;
    if (location)
      service.location =
        typeof location === "string" ? JSON.parse(location) : location;
    if (pricing)
      service.pricing =
        typeof pricing === "string" ? JSON.parse(pricing) : pricing;
    if (availability)
      service.availability =
        typeof availability === "string"
          ? JSON.parse(availability)
          : availability;
    if (paymentOptions) {
      const parsed = parseMaybeJson(paymentOptions);
      const normalized = normalizePaymentOptions(parsed);
      if (normalized) service.paymentOptions = normalized;
    }

    if (req.body.availableDates !== undefined) {
      const parsed =
        typeof req.body.availableDates === "string"
          ? JSON.parse(req.body.availableDates)
          : req.body.availableDates;
      service.availableDates = parsed;
    }
    if (service.adminApprovalStatus === "approved") {
      service.adminApprovalStatus = "pending";
      service.isPublished = false;
    }

    await service.save();

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: { service },
    });
  } catch (error) {
    console.error("Update service error:", error);
    next(error);
  }
};

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private/Provider
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (service.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this service",
      });
    }

    await service.deleteOne();

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);
    next(error);
  }
};

// @desc    Get provider's services
// @route   GET /api/services/provider/my-services
// @access  Private/Provider
exports.getMyServices = async (req, res, next) => {
  try {
    const services = await Service.find({ provider: req.user._id })
      .sort({ createdAt: -1 })
      .populate("provider", "name email");

    res.status(200).json({
      success: true,
      data: { services },
    });
  } catch (error) {
    console.error("Get my services error:", error);
    next(error);
  }
};
