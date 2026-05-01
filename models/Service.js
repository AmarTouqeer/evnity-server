const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
    },
    title: {
      type: String,
      required: [true, "Service title is required"],
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
      enum: [
        "photography",
        "videography",
        "catering",
        "dj",
        "entertainment",
        "planning",
        "decorator",
        "makeup",
        "other",
      ],
    },
    location: {
      address: {
        type: String,
        required: [true, "Address is required"],
      },
      city: {
        type: String,
        required: [true, "City is required"],
      },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
      serviceArea: [
        {
          type: String, // Cities or areas where service is available
        },
      ],
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
      },
    ],
    pricing: {
      basePrice: {
        type: Number,
        required: [true, "Base price is required"],
        min: [0, "Price cannot be negative"],
      },
      pricingType: {
        type: String,
        enum: ["hourly", "daily", "package", "custom"],
        default: "package",
      },
      packages: [
        {
          name: { type: String },
          price: { type: Number },
          description: { type: String },
        },
      ],
    },
   availableDates: [
  {
    date: { type: Date, required: true },
    timeSlots: [
      {
        startTime: { type: String, default: "08:00" },
        endTime:   { type: String, default: "22:00" },
        isAvailable: { type: Boolean, default: true },
      },
    ],
  },
],
    // Admin approval
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
    // Statistics
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

// Index for search and filtering
serviceSchema.index({ category: 1, "location.city": 1, adminApprovalStatus: 1 });
serviceSchema.index({ provider: 1 });
serviceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Service", serviceSchema);

