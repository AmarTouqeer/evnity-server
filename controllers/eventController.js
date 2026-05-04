const Event = require("../models/Event");
const { uploadMultipleToCloudinary } = require("../middleware/upload");
const { createNotification } = require("../utils/notificationHelper");
const User = require("../models/User");
const { parseMaybeJson, normalizePaymentOptions } = require("../utils/paymentOptions");

/**
 * Haversine formula — distance between two lat/lng points in km.
 * Used as a defensive fallback if $geoWithin somehow lets stale data through.
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * @desc    Get all events (filters + pagination + geo search)
 * @route   GET /api/events
 * @access  Public
 */
exports.getEvents = async (req, res, next) => {
  try {
    const {
      search,
      category,
      city,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      minGuests,
      date,
      lat,
      lng,
      radius,
      page = 1,
      limit = 10,
      sort = "-createdAt",
      adminApprovalStatus,
    } = req.query;

    // ── Parse sort string ("-field" => desc) ──
    let sortField = sort;
    let sortOrder = 1;
    if (typeof sort === "string" && sort.startsWith("-")) {
      sortField = sort.substring(1);
      sortOrder = -1;
    }

    const query = {};

    // ── Approval & visibility logic ──
    if (adminApprovalStatus) {
      query.adminApprovalStatus = adminApprovalStatus;
    } else {
      query.adminApprovalStatus = "approved";
      query.isPublished = true;
      query.isActive = true;
    }

    // ── Text search (title, description, venue) ──
    if (search) {
      const re = new RegExp(search, "i");
      query.$or = [{ title: re }, { description: re }, { venue: re }];
    }

    // ── Standard filters ──
    if (category) query.category = category.toLowerCase();

    if (minPrice || maxPrice) {
      query.charges = {};
      if (minPrice) query.charges.$gte = Number(minPrice);
      if (maxPrice) query.charges.$lte = Number(maxPrice);
    }

    if (minGuests) {
      query.capacity = { $gte: Number(minGuests) };
    }

    if (startDate || endDate) {
      query["availableDates.date"] = {};
      if (startDate) query["availableDates.date"].$gte = new Date(startDate);
      if (endDate) query["availableDates.date"].$lte = new Date(endDate);
    } else if (date) {
      query["availableDates.date"] = new Date(date);
    }

    // ── Geo validation ──
    let useGeoSearch = false;
    let userLat, userLng, radiusKm;

    if (lat && lng && radius) {
      userLat = parseFloat(lat);
      userLng = parseFloat(lng);
      radiusKm = parseFloat(radius);

      if (
        isNaN(userLat) || isNaN(userLng) || isNaN(radiusKm) ||
        userLat < -90 || userLat > 90 ||
        userLng < -180 || userLng > 180 ||
        radiusKm <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid latitude, longitude, or radius values",
        });
      }
      useGeoSearch = true;
    }

    // ── City filter ONLY when geo is NOT active ──
    // (Geo search supersedes city — we don't want both filters competing.)
    if (city && !useGeoSearch) {
      query["location.city"] = new RegExp(city, "i");
    }

    let events;
    let total;

    // ====================================================
    // 🌍 GEO (RADIUS) SEARCH
    // ====================================================
    if (useGeoSearch) {
      const geoQuery = {
        ...query,
        "location.geo": {
          $geoWithin: {
            $centerSphere: [
              [userLng, userLat],          // [lng, lat] — order matters!
              radiusKm / 6378.1,           // km → radians
            ],
          },
        },
      };

      // Belt-and-suspenders: ensure city filter is gone
      delete geoQuery["location.city"];

      console.log("🌍 Geo search:", {
        userLocation: [userLng, userLat],
        radiusKm,
        query: JSON.stringify(geoQuery),
      });

      try {
        let geoResults = await Event.find(geoQuery)
          .populate("provider", "name email phone city avatar")
          .sort({ [sortField]: sortOrder });

        console.log(`🌍 $geoWithin returned ${geoResults.length} events`);

        // ── Defensive Haversine re-check ──
        // Filter out anything that somehow slipped through (malformed coords,
        // stale index entries, etc.). This guarantees the radius is enforced.
        geoResults = geoResults
          .map((event) => {
            const obj = event.toObject();
            const coords = event.location?.geo?.coordinates;

            if (!coords || coords.length !== 2) {
              console.warn(`⚠️  Event ${event._id} has no valid coordinates — excluding`);
              return null;
            }

            const [eLng, eLat] = coords;
            const distance = haversineDistance(userLat, userLng, eLat, eLng);

            if (distance > radiusKm) {
              console.warn(
                `⚠️  Event ${event._id} (${event.title}) is ${distance.toFixed(2)}km away — ` +
                `outside ${radiusKm}km radius. Excluding.`
              );
              return null;
            }

            obj.distance = Math.round(distance * 10) / 10;
            return obj;
          })
          .filter(Boolean);

        console.log(`🌍 After Haversine verification: ${geoResults.length} events`);

        // Sort by distance if user is on default sort
        if (sort === "-createdAt" || !sort) {
          geoResults.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
        }

        // Paginate after filtering
        total = geoResults.length;
        const startIdx = (Number(page) - 1) * Number(limit);
        events = geoResults.slice(startIdx, startIdx + Number(limit));
      } catch (geoError) {
        console.error("Geo search error:", geoError);
        return res.status(400).json({
          success: false,
          message: "Geo search failed. Verify the 2dsphere index on location.geo exists.",
          error: geoError.message,
        });
      }
    }

    // ====================================================
    // 📦 NORMAL SEARCH
    // ====================================================
    else {
      events = await Event.find(query)
        .populate("provider", "name email phone city avatar")
        .sort({ [sortField]: sortOrder })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      total = await Event.countDocuments(query);
    }

    res.status(200).json({
      success: true,
      data: {
        events,
        totalPages: Math.ceil(total / Number(limit)),
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

    // ── Validate geo coordinates exist and are sane ──
    if (
      !locationData?.geo?.coordinates ||
      !Array.isArray(locationData.geo.coordinates) ||
      locationData.geo.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message: "location.geo.coordinates [lng, lat] is required",
      });
    }

    const [lng, lat] = locationData.geo.coordinates.map(Number);
    if (
      isNaN(lng) || isNaN(lat) ||
      lng < -180 || lng > 180 ||
      lat < -90 || lat > 90
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates. Expected [longitude, latitude] in valid ranges.",
      });
    }

    // Ensure GeoJSON shape is correct
    locationData.geo = { type: "Point", coordinates: [lng, lat] };

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

      // Validate updated coordinates if provided
      if (updates.location.geo?.coordinates) {
        const [lng, lat] = updates.location.geo.coordinates.map(Number);
        if (
          isNaN(lng) || isNaN(lat) ||
          lng < -180 || lng > 180 ||
          lat < -90 || lat > 90
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid coordinates in update",
          });
        }
        updates.location.geo = { type: "Point", coordinates: [lng, lat] };
      }
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