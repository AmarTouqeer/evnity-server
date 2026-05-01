const User = require("../models/User");
const Event = require("../models/Event");
const Resource = require("../models/Resource");
const Service = require("../models/Service");
const Booking = require("../models/Booking");
const { sendApprovalEmail, sendRejectionEmail } = require("../utils/emailService");
const { createNotification } = require("../utils/notificationHelper");

// @desc    Get all pending users awaiting approval
// @route   GET /api/admin/pending-users
// @access  Private/Admin
exports.getPendingUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role } = req.query;

    const query = {
      adminApprovalStatus: "pending",
      isEmailVerified: true,
    };

    if (role && ["customer", "provider"].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select("-password -otp -otpExpire")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get pending users error:", error);
    next(error);
  }
};

// @desc    Get all approved users
// @route   GET /api/admin/approved-users
// @access  Private/Admin
exports.getApprovedUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role } = req.query;

    const query = {
      adminApprovalStatus: "approved",
      isApprovedByAdmin: true,
    };

    if (role && ["customer", "provider"].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select("-password -otp -otpExpire")
      .populate("approvedBy", "name email")
      .sort({ approvedAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get approved users error:", error);
    next(error);
  }
};

// @desc    Get all rejected users
// @route   GET /api/admin/rejected-users
// @access  Private/Admin
exports.getRejectedUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role } = req.query;

    const query = {
      adminApprovalStatus: "rejected",
    };

    if (role && ["customer", "provider"].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select("-password -otp -otpExpire")
      .populate("approvedBy", "name email")
      .sort({ updatedAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get rejected users error:", error);
    next(error);
  }
};

// @desc    Approve a user
// @route   POST /api/admin/approve-user/:userId
// @access  Private/Admin
exports.approveUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isApprovedByAdmin) {
      return res.status(400).json({ success: false, message: "User is already approved" });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "User must verify email before approval",
      });
    }

    user.isApprovedByAdmin = true;
    user.adminApprovalStatus = "approved";
    user.approvedBy = req.user._id;
    user.approvedAt = Date.now();
    user.adminRejectionReason = undefined;

    await user.save();

    await sendApprovalEmail(user.email, user.name, "account");

    await createNotification({
      user: user._id,
      recipientRole: user.role, // "customer" or "provider" dynamically
      type: "admin_approval",
      title: "Account Approved",
      message: "Your account has been approved by admin. You can now access all features.",
      relatedEntity: { entityType: "user", entityId: user._id },
      actionUrl: "/profile",
    });

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been approved successfully`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          approvedAt: user.approvedAt,
        },
      },
    });
  } catch (error) {
    console.error("Approve user error:", error);
    next(error);
  }
};

// @desc    Reject a user
// @route   POST /api/admin/reject-user/:userId
// @access  Private/Admin
exports.rejectUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required and must be at least 10 characters",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isApprovedByAdmin = false;
    user.adminApprovalStatus = "rejected";
    user.adminRejectionReason = reason;
    user.approvedBy = req.user._id;
    user.approvedAt = undefined;

    await user.save();

    await sendRejectionEmail(user.email, user.name, "account", reason);

    await createNotification({
      user: user._id,
      recipientRole: user.role, // "customer" or "provider" dynamically
      type: "admin_rejection",
      title: "Account Rejected",
      message: `Your account has been rejected. Reason: ${reason}`,
      relatedEntity: { entityType: "user", entityId: user._id },
      actionUrl: "/profile",
    });

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been rejected`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          adminRejectionReason: user.adminRejectionReason,
        },
      },
    });
  } catch (error) {
    console.error("Reject user error:", error);
    next(error);
  }
};

// @desc    Get user approval statistics
// @route   GET /api/admin/user-stats
// @access  Private/Admin
exports.getUserStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "admin" } });
    const pendingUsers = await User.countDocuments({
      adminApprovalStatus: "pending",
      isEmailVerified: true,
    });
    const approvedUsers = await User.countDocuments({ adminApprovalStatus: "approved" });
    const rejectedUsers = await User.countDocuments({ adminApprovalStatus: "rejected" });
    const unverifiedEmails = await User.countDocuments({ isEmailVerified: false });

    const customerStats = {
      total: await User.countDocuments({ role: "customer" }),
      pending: await User.countDocuments({
        role: "customer",
        adminApprovalStatus: "pending",
        isEmailVerified: true,
      }),
      approved: await User.countDocuments({ role: "customer", adminApprovalStatus: "approved" }),
      rejected: await User.countDocuments({ role: "customer", adminApprovalStatus: "rejected" }),
    };

    const providerStats = {
      total: await User.countDocuments({ role: "provider" }),
      pending: await User.countDocuments({
        role: "provider",
        adminApprovalStatus: "pending",
        isEmailVerified: true,
      }),
      approved: await User.countDocuments({ role: "provider", adminApprovalStatus: "approved" }),
      rejected: await User.countDocuments({ role: "provider", adminApprovalStatus: "rejected" }),
    };

    res.status(200).json({
      success: true,
      data: {
        overall: {
          total: totalUsers,
          pending: pendingUsers,
          approved: approvedUsers,
          rejected: rejectedUsers,
          unverifiedEmails,
        },
        customers: customerStats,
        providers: providerStats,
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    next(error);
  }
};

// @desc    Block/Unblock a user
// @route   PUT /api/admin/toggle-block/:userId
// @access  Private/Admin
exports.toggleBlockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ success: false, message: "Cannot block admin users" });
    }

    user.isBlocked = !user.isBlocked;

    if (user.isBlocked && (!reason || reason.trim().length < 10)) {
      return res.status(400).json({
        success: false,
        message: "Block reason is required and must be at least 10 characters",
      });
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: user.isBlocked
        ? `User ${user.name} has been blocked`
        : `User ${user.name} has been unblocked`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isBlocked: user.isBlocked,
        },
      },
    });
  } catch (error) {
    console.error("Toggle block user error:", error);
    next(error);
  }
};

// ==================== EVENT MANAGEMENT ====================

// @desc    Get pending events
// @route   GET /api/admin/pending-events
// @access  Private/Admin
exports.getPendingEvents = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const events = await Event.find({ adminApprovalStatus: "pending" })
      .populate("provider", "name email phone")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await Event.countDocuments({ adminApprovalStatus: "pending" });

    res.status(200).json({
      success: true,
      data: {
        events,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get pending events error:", error);
    next(error);
  }
};

// @desc    Approve event
// @route   POST /api/admin/approve-event/:eventId
// @access  Private/Admin
exports.approveEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.eventId).populate("provider");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    event.adminApprovalStatus = "approved";
    event.isPublished = true;
    event.approvedBy = req.user._id;
    event.approvedAt = Date.now();
    await event.save();

    await createNotification({
      user: event.provider._id,       // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "event_approved",
      title: "Event Approved",
      message: `Your event "${event.title}" has been approved and is now live.`,
      relatedEntity: { entityType: "event", entityId: event._id },
      actionUrl: `/events/${event._id}`,
    });

    await sendApprovalEmail(event.provider.email, event.provider.name, "event");

    res.status(200).json({
      success: true,
      message: "Event approved successfully",
      data: { event },
    });
  } catch (error) {
    console.error("Approve event error:", error);
    next(error);
  }
};

// @desc    Reject event
// @route   POST /api/admin/reject-event/:eventId
// @access  Private/Admin
exports.rejectEvent = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required and must be at least 10 characters",
      });
    }

    const event = await Event.findById(req.params.eventId).populate("provider");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    event.adminApprovalStatus = "rejected";
    event.adminRejectionReason = reason;
    event.approvedBy = req.user._id;
    await event.save();

    await createNotification({
      user: event.provider._id,       // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "event_rejected",
      title: "Event Rejected",
      message: `Your event "${event.title}" has been rejected. Reason: ${reason}`,
      relatedEntity: { entityType: "event", entityId: event._id },
      actionUrl: `/events/${event._id}`,
    });

    await sendRejectionEmail(event.provider.email, event.provider.name, "event", reason);

    res.status(200).json({
      success: true,
      message: "Event rejected",
      data: { event },
    });
  } catch (error) {
    console.error("Reject event error:", error);
    next(error);
  }
};

// ==================== RESOURCE MANAGEMENT ====================

// @desc    Get pending resources
// @route   GET /api/admin/pending-resources
// @access  Private/Admin
exports.getPendingResources = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const resources = await Resource.find({ adminApprovalStatus: "pending" })
      .populate("provider", "name email phone")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await Resource.countDocuments({ adminApprovalStatus: "pending" });

    res.status(200).json({
      success: true,
      data: {
        resources,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get pending resources error:", error);
    next(error);
  }
};

// @desc    Approve resource
// @route   POST /api/admin/approve-resource/:resourceId
// @access  Private/Admin
exports.approveResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.resourceId).populate("provider");

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    resource.adminApprovalStatus = "approved";
    resource.isPublished = true;
    resource.approvedBy = req.user._id;
    resource.approvedAt = Date.now();
    await resource.save();

    await createNotification({
      user: resource.provider._id,    // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "resource_approved",
      title: "Resource Approved",
      message: `Your resource "${resource.name}" has been approved and is now live.`,
      relatedEntity: { entityType: "resource", entityId: resource._id },
      actionUrl: `/resources/${resource._id}`,
    });

    await sendApprovalEmail(resource.provider.email, resource.provider.name, "resource");

    res.status(200).json({
      success: true,
      message: "Resource approved successfully",
      data: { resource },
    });
  } catch (error) {
    console.error("Approve resource error:", error);
    next(error);
  }
};

// @desc    Reject resource
// @route   POST /api/admin/reject-resource/:resourceId
// @access  Private/Admin
exports.rejectResource = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required and must be at least 10 characters",
      });
    }

    const resource = await Resource.findById(req.params.resourceId).populate("provider");

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    resource.adminApprovalStatus = "rejected";
    resource.adminRejectionReason = reason;
    resource.approvedBy = req.user._id;
    await resource.save();

    await createNotification({
      user: resource.provider._id,    // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "resource_rejected",
      title: "Resource Rejected",
      message: `Your resource "${resource.name}" has been rejected. Reason: ${reason}`,
      relatedEntity: { entityType: "resource", entityId: resource._id },
      actionUrl: `/resources/${resource._id}`,
    });

    await sendRejectionEmail(resource.provider.email, resource.provider.name, "resource", reason);

    res.status(200).json({
      success: true,
      message: "Resource rejected",
      data: { resource },
    });
  } catch (error) {
    console.error("Reject resource error:", error);
    next(error);
  }
};

// ==================== SERVICE MANAGEMENT ====================

// @desc    Get pending services
// @route   GET /api/admin/pending-services
// @access  Private/Admin
exports.getPendingServices = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const services = await Service.find({ adminApprovalStatus: "pending" })
      .populate("provider", "name email phone")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const count = await Service.countDocuments({ adminApprovalStatus: "pending" });

    res.status(200).json({
      success: true,
      data: {
        services,
        totalPages: Math.ceil(count / Number(limit)),
        currentPage: Number(page),
        total: count,
      },
    });
  } catch (error) {
    console.error("Get pending services error:", error);
    next(error);
  }
};

// @desc    Approve service
// @route   POST /api/admin/approve-service/:serviceId
// @access  Private/Admin
exports.approveService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.serviceId).populate("provider");

    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    service.adminApprovalStatus = "approved";
    service.isPublished = true;
    service.approvedBy = req.user._id;
    service.approvedAt = Date.now();
    await service.save();

    await createNotification({
      user: service.provider._id,     // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "service_approved",
      title: "Service Approved",
      message: `Your service "${service.title}" has been approved and is now live.`,
      relatedEntity: { entityType: "service", entityId: service._id },
      actionUrl: `/services/${service._id}`,
    });

    await sendApprovalEmail(service.provider.email, service.provider.name, "service");

    res.status(200).json({
      success: true,
      message: "Service approved successfully",
      data: { service },
    });
  } catch (error) {
    console.error("Approve service error:", error);
    next(error);
  }
};

// @desc    Reject service
// @route   POST /api/admin/reject-service/:serviceId
// @access  Private/Admin
exports.rejectService = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required and must be at least 10 characters",
      });
    }

    const service = await Service.findById(req.params.serviceId).populate("provider");

    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    service.adminApprovalStatus = "rejected";
    service.adminRejectionReason = reason;
    service.approvedBy = req.user._id;
    await service.save();

    await createNotification({
      user: service.provider._id,     // ✅ correct variable
      recipientRole: "provider",       // ✅ fixed
      type: "service_rejected",
      title: "Service Rejected",
      message: `Your service "${service.title}" has been rejected. Reason: ${reason}`,
      relatedEntity: { entityType: "service", entityId: service._id },
      actionUrl: `/services/${service._id}`,
    });

    await sendRejectionEmail(service.provider.email, service.provider.name, "service", reason);

    res.status(200).json({
      success: true,
      message: "Service rejected",
      data: { service },
    });
  } catch (error) {
    console.error("Reject service error:", error);
    next(error);
  }
};

// ==================== DASHBOARD STATS ====================

// @desc    Get admin dashboard stats
// @route   GET /api/admin/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "admin" } });
    const pendingUsers = await User.countDocuments({
      adminApprovalStatus: "pending",
      isEmailVerified: true,
    });
    const approvedUsers = await User.countDocuments({ adminApprovalStatus: "approved" });

    const totalEvents = await Event.countDocuments();
    const pendingEvents = await Event.countDocuments({ adminApprovalStatus: "pending" });
    const approvedEvents = await Event.countDocuments({ adminApprovalStatus: "approved" });

    const totalResources = await Resource.countDocuments();
    const pendingResources = await Resource.countDocuments({ adminApprovalStatus: "pending" });
    const approvedResources = await Resource.countDocuments({ adminApprovalStatus: "approved" });

    const totalServices = await Service.countDocuments();
    const pendingServices = await Service.countDocuments({ adminApprovalStatus: "pending" });
    const approvedServices = await Service.countDocuments({ adminApprovalStatus: "approved" });

    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: "pending" });
    const confirmedBookings = await Booking.countDocuments({ status: "confirmed" });
    const completedBookings = await Booking.countDocuments({ status: "completed" });

    res.status(200).json({
      success: true,
      data: {
        users: { total: totalUsers, pending: pendingUsers, approved: approvedUsers },
        events: { total: totalEvents, pending: pendingEvents, approved: approvedEvents },
        resources: { total: totalResources, pending: pendingResources, approved: approvedResources },
        services: { total: totalServices, pending: pendingServices, approved: approvedServices },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          confirmed: confirmedBookings,
          completed: completedBookings,
        },
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    next(error);
  }
};