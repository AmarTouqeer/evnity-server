const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },

    // ✅ NEW: Determines which role this notification is intended for
    recipientRole: {
      type: String,
      enum: ["customer", "provider", "admin"],
      required: [true, "Recipient role is required"],
      index: true,
    },

    type: {
      type: String,
      enum: [
        "booking_created",
        "booking_accepted",
        "booking_rejected",
        "booking_confirmed",
        "booking_cancelled",
        "booking_completed",
        "review_received",
        "admin_approval",
        "admin_rejection",
        "event_approved",
        "event_rejected",
        "resource_approved",
        "resource_rejected",
        "service_approved",
        "service_rejected",
        "payment_received",
        "payment_confirmed",
        "payment_failed",
        "resource_return_reminder",
        "stripe_connected",
        "stripe_disconnected",
        "general",
      ],
      required: [true, "Notification type is required"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    relatedEntity: {
      entityType: {
        type: String,
        enum: ["booking", "event", "resource", "service", "review", "user"],
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    actionUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Updated indexes to include recipientRole
notificationSchema.index({ user: 1, recipientRole: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);