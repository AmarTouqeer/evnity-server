const Event = require("../models/Event");
const { uploadMultipleToCloudinary } = require("../middleware/upload");
const { createNotification } = require("../utils/notificationHelper");
const User = require("../models/User");
const { parseMaybeJson, normalizePaymentOptions } = require("../utils/paymentOptions");

/**
 * @desc    Get all events (filters + pagination + geo search)
 * @route   GET /api/events
 * @access  Public
 */
exports.getEvents = async (req, res, next) => {
  try {
    const {
      category,
      city,
      minPrice,
      maxPrice,
      date,
      lat,
      lng,
      radius,
      page = 1,
      limit = 10,
      sort = "createdAt", // FIXED: Accept as single string
      adminApprovalStatus,
    } = req.query;

    // FIXED: Parse sort string (handles "-createdAt" format)
    let sortField = sort;
    let sortOrder = 1;

    if (sort.startsWith("-")) {
      sortField = sort.substring(1);
      sortOrder = -1;
    }

    const query = {};

    // Approval & visibility logic
    if (adminApprovalStatus) {
      query.adminApprovalStatus = adminApprovalStatus;
    } else {
      query.adminApprovalStatus = "approved";
      query.isPublished = true;
      query.isActive = true;
    }

    // Standard filters
    if (category) query.category = category;

    if (city) {
      query["location.city"] = new RegExp(city, "i");
    }

    if (minPrice || maxPrice) {
      query.charges = {};
      if (minPrice) query.charges.$gte = Number(minPrice);
      if (maxPrice) query.charges.$lte = Number(maxPrice);
    }

    if (date) {
      query["availableDates.date"] = new Date(date);
    }

    // FIXED: Validate geo parameters before use
    let useGeoSearch = false;

    if (lat && lng && radius) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusKm = parseFloat(radius);

      // Validate numeric conversion
      if (isNaN(latitude) || isNaN(longitude) || isNaN(radiusKm)) {
        return res.status(400).json({
          success: false,
          message: "Invalid latitude, longitude, or radius values",
        });
      }

      // Validate latitude range
      if (latitude < -90 || latitude > 90) {
        return res.status(400).json({
          success: false,
          message: "Latitude must be between -90 and 90",
        });
      }

      // Validate longitude range
      if (longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          message: "Longitude must be between -180 and 180",
        });
      }

      // Validate radius
      if (radiusKm <= 0) {
        return res.status(400).json({
          success: false,
          message: "Radius must be greater than 0",
        });
      }

      useGeoSearch = true;
    }

    let events;
    let total;

    // ==============================
    // 🌍 GEO (RADIUS) SEARCH
    // ==============================
    if (useGeoSearch) {
      try {
        // Remove city filter when geo search is active
        delete query["location.city"];

        const geoQuery = {
          ...query,
          "location.geo": {
            $geoWithin: {
              $centerSphere: [
                [Number(lng), Number(lat)],
                Number(radius) / 6378.1, // km → radians
              ],
            },
          },
        };

        events = await Event.find(geoQuery)
          .populate("provider", "name email phone city avatar")
          .sort({ [sortField]: sortOrder }) // FIXED: Use parsed sort
          .limit(Number(limit))
          .skip((page - 1) * limit);

        total = await Event.countDocuments(geoQuery);
      } catch (geoError) {
        console.error("Geo search error:", geoError);
        return res.status(400).json({
          success: false,
          message: "Invalid geospatial query. Please check your coordinates.",
        });
      }
    }

    // ==============================
    // 📦 NORMAL SEARCH
    // ==============================
    else {
      events = await Event.find(query)
        .populate("provider", "name email phone city avatar")
        .sort({ [sortField]: sortOrder }) // FIXED: Use parsed sort
        .limit(Number(limit))
        .skip((page - 1) * limit);

      total = await Event.countDocuments(query);
    }

    res.status(200).json({
      success: true,
      data: {
        events,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    next(error);
  }
};

/**
 * @desc    Get single event
 * @route   GET /api/events/:id
 * @access  Public
 */
exports.getEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).populate(
      "provider",
      "name email phone city avatar providerInfo"
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { event },
    });
  } catch (error) {
    console.error("Get event error:", error);
    next(error);
  }
};

/**
 * @desc    Create event
 * @route   POST /api/events
 * @access  Private/Provider
 */
exports.createEvent = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      venue,
      location,
      charges,
      capacity,
      availableDates,
      images: preUploadedImages,
      paymentOptions,
    } = req.body;

    let images = [];

    if (req.files && req.files.length > 0) {
      images = await uploadMultipleToCloudinary(req.files, "evnity/events");
    } else if (preUploadedImages) {
      images = preUploadedImages;
    }

    const locationData =
      typeof location === "string" ? JSON.parse(location) : location;

    const availableDatesData =
      typeof availableDates === "string"
        ? JSON.parse(availableDates)
        : availableDates || [];

    const paymentOptionsData = normalizePaymentOptions(parseMaybeJson(paymentOptions));

    const event = await Event.create({
      provider: req.user._id,
      title,
      description,
      category,
      venue,
      location: locationData,
      images,
      charges: Number(charges),
      capacity: Number(capacity),
      availableDates: availableDatesData,
      ...(paymentOptionsData ? { paymentOptions: paymentOptionsData } : {}),
    });

    // Notify admins
    const admins = await User.find({ role: "admin" });

    for (const admin of admins) {
      await createNotification({
        user: admin._id,
        recipientRole: "admin",
        type: "admin_approval",
        title: "New Event Pending Approval",
        message: `New event "${title}" is pending approval`,
        relatedEntity: { entityType: "event", entityId: event._id },
        actionUrl: `/events/${event._id}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Event created successfully. Waiting for admin approval.",
      data: { event },
    });
  } catch (error) {
    console.error("Create event error:", error);
    next(error);
  }
};

/**
 * @desc    Update event
 * @route   PUT /api/events/:id
 * @access  Private/Provider
 */
exports.updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const updates = req.body;

    if (updates.location) {
      updates.location =
        typeof updates.location === "string"
          ? JSON.parse(updates.location)
          : updates.location;
    }

    if (updates.paymentOptions) {
      const parsed = parseMaybeJson(updates.paymentOptions);
      const normalized = normalizePaymentOptions(parsed);
      if (normalized) updates.paymentOptions = normalized;
    }

    Object.assign(event, updates);

    if (event.adminApprovalStatus === "approved") {
      event.adminApprovalStatus = "pending";
      event.isPublished = false;
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: { event },
    });
  } catch (error) {
    console.error("Update event error:", error);
    next(error);
  }
};

/**
 * @desc    Delete event
 * @route   DELETE /api/events/:id
 * @access  Private/Provider
 */
exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    await event.deleteOne();

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Delete event error:", error);
    next(error);
  }
};

/**
 * @desc    Get provider events
 * @route   GET /api/events/provider/my-events
 * @access  Private/Provider
 */
exports.getMyEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ provider: req.user._id })
      .sort({ createdAt: -1 })
      .populate("provider", "name email");

    res.status(200).json({
      success: true,
      data: { events },
    });
  } catch (error) {
    console.error("Get my events error:", error);
    next(error);
  }
};