const Notification = require("../models/Notification");
const { sendBookingStatusEmail } = require("./emailService");

// Create notification with role targeting
exports.createNotification = async ({
  user,
  recipientRole,          // ✅ NEW: "customer" | "provider" | "admin"
  type,
  title,
  message,
  relatedEntity = null,
  actionUrl = "",
  sendEmail = false,
  emailData = null,
}) => {
  try {
    const notification = await Notification.create({
      user,
      recipientRole,        // ✅ Persisted to DB
      type,
      title,
      message,
      relatedEntity,
      actionUrl,
    });

    if (sendEmail && emailData) {
      try {
        if (type.includes("booking")) {
          await sendBookingStatusEmail(
            emailData.email,
            emailData.name,
            type,
            emailData.bookingDetails
          );
        }
      } catch (emailError) {
        console.error("Error sending notification email:", emailError);
      }
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

// Create multiple notifications (each must include recipientRole)
exports.createBulkNotifications = async (notifications) => {
  try {
    // ✅ Validate all entries have recipientRole before bulk insert
    const valid = notifications.every((n) => n.recipientRole);
    if (!valid) throw new Error("All bulk notifications must include recipientRole");
    return await Notification.insertMany(notifications);
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    throw error;
  }
};

exports.markAsRead = async (notificationId, userId) => {
  try {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true, readAt: Date.now() },
      { new: true }
    );
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
};

// ✅ Now role-scoped: only marks read for the user's current role
exports.markAllAsRead = async (userId, recipientRole) => {
  try {
    return await Notification.updateMany(
      { user: userId, recipientRole, isRead: false },
      { isRead: true, readAt: Date.now() }
    );
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
};

exports.deleteNotification = async (notificationId, userId) => {
  try {
    return await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId,
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
};

// ✅ Now role-scoped: unread count only for the user's current role
exports.getUnreadCount = async (userId, recipientRole) => {
  try {
    return await Notification.countDocuments({
      user: userId,
      recipientRole,
      isRead: false,
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    throw error;
  }
};