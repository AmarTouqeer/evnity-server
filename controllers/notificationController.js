const {
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} = require("../utils/notificationHelper");
const Notification = require("../models/Notification");

// @desc    Get all notifications for user (role-filtered)
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res, next) => {
  try {
    const { isRead, page = 1, limit = 20 } = req.query;

    const query = {
      user: req.user._id,
      recipientRole: req.user.role, // ✅ Only fetch notifications meant for this role
    };

    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Notification.countDocuments(query);
    const unreadCount = await getUnreadCount(req.user._id, req.user.role); // ✅ Pass role

    res.status(200).json({
      success: true,
      data: {
        notifications,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        total: count,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markNotificationAsRead = async (req, res, next) => {
  try {
    const notification = await markAsRead(req.params.id, req.user._id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: { notification },
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    next(error);
  }
};

// @desc    Mark all notifications as read (role-scoped)
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllNotificationsAsRead = async (req, res, next) => {
  try {
    await markAllAsRead(req.user._id, req.user.role); // ✅ Pass role

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);
    next(error);
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await deleteNotification(req.params.id, req.user._id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    next(error);
  }
};

// @desc    Get unread count (role-scoped)
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await getUnreadCount(req.user._id, req.user.role); // ✅ Pass role

    res.status(200).json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    next(error);
  }
};