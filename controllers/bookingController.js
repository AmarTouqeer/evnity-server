const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Resource = require("../models/Resource");
const Service = require("../models/Service");
const { uploadToCloudinary } = require("../middleware/upload");
const { createNotification } = require("../utils/notificationHelper");
const {
  sendBookingConfirmationEmail,
  sendBookingStatusEmail,
} = require("../utils/emailService");
const User = require("../models/User");
const { getPaymentOptionsFromBooking, getActiveManualMethods } = require("../utils/bookingPayment");

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
exports.getBookings = async (req, res, next) => {
  try {
    const { status, bookingType, page = 1, limit = 10 } = req.query;

    const query = {};

    if (req.user.role === "customer") {
      query.customer = req.user._id;
    } else if (req.user.role === "provider") {
      query.provider = req.user._id;
    }

    if (status) query.status = status;
    if (bookingType) query.bookingType = bookingType;

    const bookings = await Booking.find(query)
      .populate("customer", "name email phone")
      .populate("provider", "name email phone")
      .populate("event")
      .populate("resource")
      .populate("service")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    next(error);
  }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("customer", "name email phone")
      .populate("provider", "name email phone")
      .populate("event")
      .populate("resource")
      .populate("service");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (
      booking.customer._id.toString() !== req.user._id.toString() &&
      booking.provider._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this booking",
      });
    }

    res.status(200).json({
      success: true,
      data: { booking },
    });
  } catch (error) {
    console.error("Get booking error:", error);
    next(error);
  }
};

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private/Customer
exports.createBooking = async (req, res, next) => {
  try {
    const {
      bookingType,
      eventId,
      resourceId,
      serviceId,
      eventDate,
      startTime,
      endTime,
      quantity,
      customerNotes,
    } = req.body;

    let providerId, entity, totalAmount, deposit;

   if (bookingType === "event" && eventId) {
      entity = await Event.findById(eventId);
      if (!entity) return res.status(404).json({ success: false, message: "Event not found" });
      providerId = entity.provider;
      const basePrice = entity.charges || 0;
      const capacity = entity.capacity || 1;
      const guests = Number(quantity) || 1;
      totalAmount = capacity > 0 ? Math.round((basePrice / capacity) * guests) : basePrice;
      deposit = 0;
    }
    else if (bookingType === "resource" && resourceId) {
      entity = await Resource.findById(resourceId);
      if (!entity) return res.status(404).json({ success: false, message: "Resource not found" });
      providerId = entity.provider;
      totalAmount = entity.rentalPrice * (quantity || 1);
      deposit = entity.deposit * (quantity || 1);
    } else if (bookingType === "service" && serviceId) {
      entity = await Service.findById(serviceId);
      if (!entity) return res.status(404).json({ success: false, message: "Service not found" });
      providerId = entity.provider;
      totalAmount = entity.pricing.basePrice;
      deposit = 0;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid booking type or missing entity ID",
      });
    }

    if (
      entity.adminApprovalStatus !== "approved" ||
      !entity.isPublished ||
      !entity.isActive
    ) {
      return res.status(400).json({
        success: false,
        message: "This listing is not available for booking",
      });
    }

    // Double-booking checks
    if (bookingType === "service" && serviceId) {
      const existingBooking = await Booking.findOne({
        service: serviceId,
        eventDate: new Date(eventDate),
        startTime,
        endTime,
        status: { $in: ["pending", "accepted", "confirmed"] },
      });
      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message: "This service is already booked for the selected date and time. Please choose a different time slot.",
        });
      }
    }

    if (bookingType === "event" && eventId) {
      const existingBooking = await Booking.findOne({
        event: eventId,
        eventDate: new Date(eventDate),
        startTime,
        endTime,
        status: { $in: ["pending", "accepted", "confirmed"] },
      });
      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message: "This event is already booked for the selected date and time. Please choose a different time slot.",
        });
      }
    }

    const bookingData = {
      customer: req.user._id,
      provider: providerId,
      bookingType,
      [bookingType]: entity._id,
      eventDate: new Date(eventDate),
      startTime,
      endTime,
      quantity: quantity || 1,
      totalAmount,
      deposit,
      customerNotes: customerNotes || "",
    };

    const booking = await Booking.create(bookingData);

    await booking.populate([
      { path: "customer", select: "name email phone" },
      { path: "provider", select: "name email phone" },
      { path: bookingType },
    ]);

    const provider = await User.findById(providerId);
    const customer = req.user;

    // Notify provider about new booking request
    await createNotification({
      user: providerId,
      recipientRole: "provider",            // ✅ provider receives this
      type: "booking_created",
      title: "New Booking Request",
      message: `${customer.name} has requested a booking`,
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
      sendEmail: true,
      emailData: {
        email: provider.email,
        name: provider.name,
        bookingDetails: {
          type: bookingType,
          eventDate: booking.eventDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalAmount: booking.totalAmount,
        },
      },
    });

    // Notify customer that their request was sent
    await createNotification({
      user: req.user._id,
      recipientRole: "customer",            // ✅ customer receives this
      type: "booking_created",
      title: "Booking Request Sent",
      message: `Your booking request has been sent to ${provider.name}`,
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
    });

    res.status(201).json({
      success: true,
      message: "Booking request created successfully",
      data: { booking },
    });
  } catch (error) {
    console.error("Create booking error:", error);
    if (error.statusCode === 409) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// @desc    Accept booking
// @route   PUT /api/bookings/:id/accept
// @access  Private/Provider
exports.acceptBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to accept this booking" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Booking cannot be accepted in its current state",
      });
    }

    if (booking.bookingType === "resource" && booking.resource) {
      const resource = await Resource.findById(booking.resource);
      if (resource && resource.availableQuantity < booking.quantity) {
        return res.status(409).json({
          success: false,
          message: `Insufficient quantity available. Only ${resource.availableQuantity} items available.`,
        });
      }
    }

    booking.status = "accepted";

    try {
      await booking.save();
    } catch (error) {
      if (error.statusCode === 409) {
        return res.status(409).json({ success: false, message: error.message });
      }
      throw error;
    }

    if (booking.bookingType === "resource" && booking.resource) {
      const resource = await Resource.findById(booking.resource);
      if (resource) {
        resource.availableQuantity -= booking.quantity;
        await resource.save();
      }
    }

    const customer = await User.findById(booking.customer);

    // Notify customer that booking was accepted
    await createNotification({
      user: booking.customer,
      recipientRole: "customer",            // ✅ customer receives this
      type: "booking_accepted",
      title: "Booking Accepted",
      message: `Your booking has been accepted by ${req.user.name}`,
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
      sendEmail: true,
      emailData: {
        email: customer.email,
        name: customer.name,
        bookingDetails: {
          type: booking.bookingType,
          eventDate: booking.eventDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Booking accepted successfully",
      data: { booking },
    });
  } catch (error) {
    console.error("Accept booking error:", error);
    next(error);
  }
};

// @desc    Reject booking
// @route   PUT /api/bookings/:id/reject
// @access  Private/Provider
exports.rejectBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to reject this booking" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Booking cannot be rejected in its current state",
      });
    }

    booking.status = "rejected";
    booking.rejectionReason = reason || "";
    await booking.save();

    const customer = await User.findById(booking.customer);

    // Notify customer that booking was rejected
    await createNotification({
      user: booking.customer,
      recipientRole: "customer",            // ✅ customer receives this
      type: "booking_rejected",
      title: "Booking Rejected",
      message: `Your booking has been rejected by ${req.user.name}`,
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
      sendEmail: true,
      emailData: {
        email: customer.email,
        name: customer.name,
        bookingDetails: {
          type: booking.bookingType,
          eventDate: booking.eventDate,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Booking rejected",
      data: { booking },
    });
  } catch (error) {
    console.error("Reject booking error:", error);
    next(error);
  }
};

// @desc    Confirm booking (after manual payment receipt upload)
// @route   PUT /api/bookings/:id/confirm
// @access  Private/Customer
exports.confirmBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("event")
      .populate("resource")
      .populate("service");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to confirm this booking" });
    }

    if (booking.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Booking not accepted" });
    }

    if (booking.paymentMethod === "stripe" || booking.paymentProvider === "stripe") {
      return res.status(400).json({
        success: false,
        message: "This booking uses Stripe payment. Please complete payment via Stripe to confirm.",
      });
    }

    const paymentOptions = getPaymentOptionsFromBooking(booking);
    if (!paymentOptions?.manual?.enabled) {
      return res.status(400).json({ success: false, message: "Manual payment not enabled" });
    }

    const activeMethods = getActiveManualMethods(paymentOptions);
    if (!activeMethods.length) {
      return res.status(400).json({ success: false, message: "No active manual payment methods" });
    }

    if (!booking.receipt || !booking.receipt.url) {
      return res.status(400).json({ success: false, message: "Payment receipt is required" });
    }

    booking.status = "confirmed";
    booking.paymentStatus = "paid";
    booking.paymentMethod = "manual";
    booking.paymentProvider = "manual";
    booking.paidAt = Date.now();
    await booking.save();

    // Notify provider that customer has confirmed with receipt
    await createNotification({
      user: booking.provider,
      recipientRole: "provider",            // ✅ provider receives this
      type: "booking_confirmed",
      title: "Booking Confirmed",
      message: `Booking has been confirmed by ${req.user.name}`,
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
    });

    const customer = req.user;
    const provider = await User.findById(booking.provider);

    await sendBookingConfirmationEmail(customer.email, customer.name, {
      type: booking.bookingType,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalAmount: booking.totalAmount,
    });

    await sendBookingConfirmationEmail(provider.email, provider.name, {
      type: booking.bookingType,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalAmount: booking.totalAmount,
    });

    res.status(200).json({
      success: true,
      message: "Booking confirmed successfully",
      data: { booking },
    });
  } catch (error) {
    console.error("Confirm booking error:", error);
    next(error);
  }
};

// @desc    Upload payment receipt
// @route   POST /api/bookings/:id/receipt
// @access  Private/Customer
exports.uploadReceipt = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("event")
      .populate("resource")
      .populate("service");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Booking not accepted" });
    }

    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to upload receipt for this booking" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Receipt image is required" });
    }

    const paymentOptions = getPaymentOptionsFromBooking(booking);
    if (!paymentOptions?.manual?.enabled) {
      return res.status(400).json({ success: false, message: "Manual payment not enabled" });
    }

    const activeMethods = getActiveManualMethods(paymentOptions);
    if (!activeMethods.length) {
      return res.status(400).json({ success: false, message: "No active manual payment methods" });
    }

    const methodType =
      typeof req.body.methodType === "string" ? req.body.methodType.trim() : "";
    if (methodType && !activeMethods.some((method) => method.type === methodType)) {
      return res.status(400).json({ success: false, message: "Invalid payment method type" });
    }

    const transactionId =
      typeof req.body.transactionId === "string" ? req.body.transactionId.trim() : "";

    const receipt = await uploadToCloudinary(req.file.buffer, "evnity/receipts");

    booking.receipt = {
      url: receipt.url,
      publicId: receipt.publicId,
      uploadedAt: Date.now(),
    };

    booking.paymentMethod = "manual";
    booking.paymentProvider = "manual";
    booking.manualPayment = booking.manualPayment || {};
    if (methodType) booking.manualPayment.methodType = methodType;
    if (transactionId) booking.manualPayment.transactionId = transactionId;

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Receipt uploaded successfully",
      data: {
        receipt: booking.receipt,
        manualPayment: booking.manualPayment,
      },
    });
  } catch (error) {
    console.error("Upload receipt error:", error);
    next(error);
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const isCustomer = booking.customer.toString() === req.user._id.toString();
    const isProvider = booking.provider.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to cancel this booking" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: "Booking cannot be cancelled in its current state",
      });
    }

    const oldStatus = booking.status;

    booking.status = "cancelled";
    booking.cancelledBy = isCustomer ? "customer" : isProvider ? "provider" : "admin";
    booking.cancellationReason = reason || "";
    booking.cancelledAt = Date.now();

    if (
      booking.bookingType === "resource" &&
      booking.resource &&
      ["accepted", "confirmed"].includes(oldStatus)
    ) {
      const resource = await Resource.findById(booking.resource);
      if (resource) {
        resource.availableQuantity += booking.quantity;
        await resource.save();
      }
    }

    await booking.save();

    const customer = await User.findById(booking.customer);
    const provider = await User.findById(booking.provider);

    if (isCustomer) {
      // Customer cancelled → notify provider
      await createNotification({
        user: booking.provider,
        recipientRole: "provider",          // ✅ provider receives this
        type: "booking_cancelled",
        title: "Booking Cancelled",
        message: `${customer.name} has cancelled the booking`,
        relatedEntity: { entityType: "booking", entityId: booking._id },
        actionUrl: `/bookings/${booking._id}`,
      });
    } else {
      // Provider or admin cancelled → notify customer
      await createNotification({
        user: booking.customer,
        recipientRole: "customer",          // ✅ customer receives this
        type: "booking_cancelled",
        title: "Booking Cancelled",
        message: `${provider.name} has cancelled the booking`,
        relatedEntity: { entityType: "booking", entityId: booking._id },
        actionUrl: `/bookings/${booking._id}`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: { booking },
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    next(error);
  }
};

// @desc    Mark booking as completed (provider accepts payment)
// @route   PUT /api/bookings/:id/complete
// @access  Private/Provider
exports.completeBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to complete this booking" });
    }

    const isManualConfirmed = booking.status === "confirmed";
    const isAcceptedAndPaid =
      booking.status === "accepted" && booking.paymentStatus === "paid";

    if (!isManualConfirmed && !isAcceptedAndPaid) {
      return res.status(400).json({
        success: false,
        message: "Booking can only be completed after payment has been received.",
      });
    }

    if (booking.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot complete booking — payment not yet received.",
      });
    }

    booking.status = "completed";
    booking.completedAt = Date.now();
    await booking.save();

    // Notify customer to leave a review
    await createNotification({
      user: booking.customer,
      recipientRole: "customer",            // ✅ customer receives this
      type: "booking_completed",
      title: "Booking Completed",
      message: "Your booking has been completed. Share your experience by leaving a review!",
      relatedEntity: { entityType: "booking", entityId: booking._id },
      actionUrl: `/bookings/${booking._id}`,
    });

    res.status(200).json({
      success: true,
      message: "Booking marked as completed",
      data: { booking },
    });
  } catch (error) {
    console.error("Complete booking error:", error);
    next(error);
  }
};

// @desc    Mark resource as returned
// @route   PUT /api/bookings/:id/return
// @access  Private/Provider
exports.markResourceReturned = async (req, res, next) => {
  try {
    const { returnStatus, damageDescription } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (booking.bookingType !== "resource") {
      return res.status(400).json({ success: false, message: "This endpoint is only for resource bookings" });
    }

    if (booking.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to mark this resource as returned" });
    }

    const wasAlreadyReturned = booking.returnStatus === "returned";
    const shouldRestoreQuantity =
      !wasAlreadyReturned &&
      (booking.status === "confirmed" || booking.status === "completed");

    booking.returnStatus = returnStatus || "returned";
    booking.returnDate = Date.now();
    if (damageDescription) booking.damageDescription = damageDescription;

    if (shouldRestoreQuantity && booking.resource) {
      const resource = await Resource.findById(booking.resource);
      if (resource) {
        resource.availableQuantity += booking.quantity;
        await resource.save();
      }
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Resource marked as returned",
      data: { booking },
    });
  } catch (error) {
    console.error("Mark resource returned error:", error);
    next(error);
  }
};

// @desc    Get provider dashboard statistics
// @route   GET /api/bookings/provider/dashboard-stats
// @access  Private/Provider
exports.getProviderDashboardStats = async (req, res, next) => {
  try {
    const providerId = req.user._id;

    const totalBookings = await Booking.countDocuments({
      provider: providerId,
      status: { $in: ["accepted", "confirmed", "completed"] },
    });

    const [activeEvents, activeResources, activeServices] = await Promise.all([
      Event.countDocuments({
        provider: providerId,
        isPublished: true,
        adminApprovalStatus: "approved",
      }),
      Resource.countDocuments({
        provider: providerId,
        isActive: true,
        adminApprovalStatus: "approved",
      }),
      Service.countDocuments({
        provider: providerId,
        isActive: true,
        adminApprovalStatus: "approved",
      }),
    ]);

    const activeListings = activeEvents + activeResources + activeServices;

    const revenueData = await Booking.aggregate([
      {
        $match: {
          provider: providerId,
          status: { $in: ["completed", "confirmed"] },
          paymentStatus: { $in: ["paid", "partial"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    const Review = require("../models/Review");
    const avgRatingData = await Review.aggregate([
      { $match: { provider: providerId } },
      { $group: { _id: null, averageRating: { $avg: "$rating" } } },
    ]);

    const averageRating =
      avgRatingData.length > 0
        ? Math.round(avgRatingData[0].averageRating * 10) / 10
        : 0;

    const recentBookings = await Booking.find({ provider: providerId })
      .populate("customer", "name email phone")
      .populate("event", "name category")
      .populate("resource", "name category")
      .populate("service", "name category")
      .sort({ createdAt: -1 })
      .limit(5);

    const [events, resources, services] = await Promise.all([
      Event.find({ provider: providerId })
        .select("title category charges isPublished adminApprovalStatus")
        .lean(),
      Resource.find({ provider: providerId })
        .select("name category rentalPrice isActive adminApprovalStatus")
        .lean(),
      Service.find({ provider: providerId })
        .select("title category pricing isActive adminApprovalStatus")
        .lean(),
    ]);

    const listingsWithStats = await Promise.all([
      ...events.map(async (event) => {
        const bookingCount = await Booking.countDocuments({
          event: event._id,
          status: { $in: ["accepted", "confirmed", "completed"] },
        });
        const reviews = await Review.find({ relatedItem: event._id });
        const avgRating =
          reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;
        return {
          id: event._id,
          type: "Event",
          name: event.title,
          category: event.category,
          price: event.charges || 0,
          priceUnit: "per event",
          status:
            event.isPublished && event.adminApprovalStatus === "approved"
              ? "Active"
              : "Inactive",
          bookings: bookingCount,
          rating: Math.round(avgRating * 10) / 10,
        };
      }),
      ...resources.map(async (resource) => {
        const bookingCount = await Booking.countDocuments({
          resource: resource._id,
          status: { $in: ["accepted", "confirmed", "completed"] },
        });
        const reviews = await Review.find({ relatedItem: resource._id });
        const avgRating =
          reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;
        return {
          id: resource._id,
          type: "Resource",
          name: resource.name,
          category: resource.category,
          price: resource.rentalPrice || 0,
          priceUnit: "per day",
          status:
            resource.isActive && resource.adminApprovalStatus === "approved"
              ? "Active"
              : "Inactive",
          bookings: bookingCount,
          rating: Math.round(avgRating * 10) / 10,
        };
      }),
      ...services.map(async (service) => {
        const bookingCount = await Booking.countDocuments({
          service: service._id,
          status: { $in: ["accepted", "confirmed", "completed"] },
        });
        const reviews = await Review.find({ relatedItem: service._id });
        const avgRating =
          reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;
        return {
          id: service._id,
          type: "Service",
          name: service.title,
          category: service.category,
          price: service.pricing?.basePrice || 0,
          priceUnit: service.pricing?.pricingType || "package",
          status:
            service.isActive && service.adminApprovalStatus === "approved"
              ? "Active"
              : "Inactive",
          bookings: bookingCount,
          rating: Math.round(avgRating * 10) / 10,
        };
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalBookings,
          activeListings,
          totalRevenue,
          averageRating,
        },
        recentBookings,
        listings: listingsWithStats,
      },
    });
  } catch (error) {
    console.error("Get provider dashboard stats error:", error);
    next(error);
  }
};