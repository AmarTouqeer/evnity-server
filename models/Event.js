const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
    },
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      lowercase: true,
      enum: [
        "wedding",
        "birthday",
        "corporate",
        "religious",
        "cultural",
        "sports",
        "music",
        "other",
      ],
    },
    venue: {
      type: String,
      required: [true, "Venue is required"],
      trim: true,
    },
    location: {
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      geo: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
          required: true,              
        },
        coordinates: {
          type: [Number],           
          required: true,
          validate: { 
            validator: function (val) {
              return (
                val.length === 2 &&
                val[0] >= -180 && val[0] <= 180 &&  // lng
                val[1] >= -90  && val[1] <= 90      // lat
              );
            },
            message: "coordinates must be [longitude, latitude] with valid ranges",
          },
        },
      },
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
      },
    ],
    charges: {
      type: Number,
      required: [true, "Charges are required"],
      min: [0, "Charges cannot be negative"],
    },
    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: [1, "Capacity must be at least 1"],
    },
    availableDates: [
      {
        date: { type: Date, required: true },
        timeSlots: [
          {
            startTime: { type: String, required: true },
            endTime: { type: String, required: true },
            isAvailable: { type: Boolean, default: true },
          },
        ],
      },
    ],
    adminApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminRejectionReason: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Date,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    paymentOptions: {
      stripe: {
        enabled: { type: Boolean, default: false },
        currency: { type: String, default: "pkr", lowercase: true },
      },
      manual: {
        enabled: { type: Boolean, default: false },
        methods: [
          {
            type: {
              type: String,
              enum: ["easypaisa", "jazzcash", "bank_transfer", "cash"],
              required: true,
            },
            label: { type: String, default: "" },
            accountTitle: { type: String, default: "" },
            accountNumber: { type: String, default: "" },
            bankName: { type: String, default: "" },
            iban: { type: String, default: "" },
            instructions: { type: String, default: "" },
            isActive: { type: Boolean, default: true },
          },
        ],
      },
    },
  },
  {
    timestamps: true,
  }
);


eventSchema.index({ adminApprovalStatus: 1, isPublished: 1, isActive: 1 });

eventSchema.index({ category: 1, "location.city": 1, adminApprovalStatus: 1 });
eventSchema.index({ provider: 1 });
eventSchema.index({ createdAt: -1 });

eventSchema.index({ "location.geo": "2dsphere" }, { sparse: true });


eventSchema.statics.recalculateStats = async function (eventId) {
  const Review  = mongoose.model("Review");
  const Booking = mongoose.model("Booking");

  const [reviewStats, bookingCount] = await Promise.all([
    Review.aggregate([
      { $match: { event: new mongoose.Types.ObjectId(eventId) } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
    Booking.countDocuments({ event: eventId, status: "confirmed" }),
  ]);

  await this.findByIdAndUpdate(eventId, {
    averageRating: reviewStats[0]?.avg   ?? 0,
    totalReviews:  reviewStats[0]?.count ?? 0,
    totalBookings: bookingCount,
  });
};

module.exports = mongoose.model("Event", eventSchema);