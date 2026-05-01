const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer is required"],
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
    },
    bookingType: {
      type: String,
      enum: ["event", "resource", "service"],
      required: [true, "Booking type is required"],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
    },
    // Booking details
    eventDate: {
      type: Date,
      required: [true, "Event date is required"],
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Quantity must be at least 1"],
    },
    // Pricing
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    deposit: {
      type: Number,
      default: 0,
      min: [0, "Deposit cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "refunded"],
      default: "pending",
    },
    // Booking status
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "confirmed",
        "completed",
        "cancelled",
        "returned", // For resources
      ],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    // Payment receipt
    receipt: {
      url: { type: String },
      publicId: { type: String },
      uploadedAt: { type: Date },
    },
    // Resource return (only for resources)
    returnDate: {
      type: Date,
    },
    returnStatus: {
      type: String,
      enum: ["pending", "returned", "damaged", "overdue"],
      default: "pending",
    },
    damageDescription: {
      type: String,
      default: "",
    },
    // Cancellation
    cancelledBy: {
      type: String,
      enum: ["customer", "provider", "admin"],
    },
    cancellationReason: {
      type: String,
      default: "",
    },
    cancelledAt: {
      type: Date,
    },
    // Additional notes
    customerNotes: {
      type: String,
      default: "",
    },
    providerNotes: {
      type: String,
      default: "",
    },

    // ==============================
    // 💳 Payment details
    // ==============================
    // This project is for testing; we store enough info to reconcile payments.
    paymentMethod: {
      type: String,
      enum: ["none", "stripe", "manual"],
      default: "none",
    },
    paymentProvider: {
      type: String,
      enum: ["stripe", "manual"],
    },
    paidAt: {
      type: Date,
    },
    // Stripe tracking
    stripeCheckoutSessionId: {
      type: String,
    },
    stripePaymentIntentId: {
      type: String,
    },
    // Manual payment tracking (Pakistani payment methods)
    manualPayment: {
      methodType: {
        type: String,
        enum: ["easypaisa", "jazzcash", "bank_transfer", "cash"],
      },
      transactionId: {
        type: String,
        default: "",
      },
    },

    // Platform fee & payout breakdown (for Stripe / reporting)
    platformFeePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    providerPayout: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Transfer lifecycle (for Stripe Connect payouts)
    transferStatus: {
      type: String,
      enum: ["pending", "in_transit", "paid", "failed"],
      default: "pending",
    },
    transferredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for queries
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index({ eventDate: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ bookingType: 1, status: 1 });
bookingSchema.index({ createdAt: -1 });

// Pre-save middleware to prevent double booking
bookingSchema.pre("save", async function (next) {
  // Only check for new bookings or status changes to accepted/confirmed
  if (
    !this.isNew &&
    (!this.isModified("status") || !["accepted", "confirmed"].includes(this.status))
  ) {
    return next();
  }

  // Check for overlapping bookings for events and services (calendar integration)
  if ((this.bookingType === "event" || this.bookingType === "service") && this.eventDate) {
    const Booking = this.constructor;
    
    // Convert dates to compare properly
    const bookingDate = new Date(this.eventDate);
    bookingDate.setHours(0, 0, 0, 0);
    
    const overlappingBooking = await Booking.findOne({
      _id: { $ne: this._id },
      provider: this.provider,
      bookingType: this.bookingType,
      status: { $in: ["accepted", "confirmed"] },
      eventDate: {
        $gte: new Date(bookingDate),
        $lt: new Date(bookingDate.getTime() + 24 * 60 * 60 * 1000),
      },
      $or: [
        {
          startTime: { $lt: this.endTime },
          endTime: { $gt: this.startTime },
        },
      ],
    });

    if (overlappingBooking) {
      const error = new Error(
        "This time slot is already booked. Please choose another time."
      );
      error.statusCode = 409;
      return next(error);
    }
  }

  // Check for resource availability
  if (this.bookingType === "resource" && this.resource && this.status === "accepted") {
    const Resource = require("./Resource");
    const resource = await Resource.findById(this.resource);

    if (resource) {
      const Booking = this.constructor;
      const bookingDate = new Date(this.eventDate);
      const returnDate = this.returnDate ? new Date(this.returnDate) : bookingDate;

      // Find all active bookings that overlap with this booking period
      const overlappingBookings = await Booking.find({
        _id: { $ne: this._id },
        resource: this.resource,
        status: { $in: ["accepted", "confirmed"] },
        $or: [
          {
            // Booking starts before this one ends and ends after this one starts
            eventDate: { $lte: returnDate },
            returnDate: { $gte: bookingDate },
          },
          {
            // Booking has no return date but event date overlaps
            eventDate: {
              $gte: bookingDate,
              $lte: returnDate,
            },
            returnDate: { $exists: false },
          },
        ],
      });

      // Calculate total booked quantity
      const totalBooked = overlappingBookings.reduce(
        (sum, booking) => sum + (booking.quantity || 1),
        0
      );

      if (totalBooked + (this.quantity || 1) > resource.availableQuantity) {
        const error = new Error(
          `Insufficient quantity available. Only ${resource.availableQuantity - totalBooked} items available.`
        );
        error.statusCode = 409;
        return next(error);
      }
    }
  }

  next();
});

module.exports = mongoose.model("Booking", bookingSchema);

