const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
    },
    name: {
      type: String,
      required: [true, "Resource name is required"],
      trim: true,
      maxlength: [200, "Name cannot exceed 200 characters"],
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
        "furniture",
        "equipment",
        "decoration",
        "lighting",
        "sound",
        "catering",
        "tent",
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
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
      },
    ],
    rentalPrice: {
      type: Number,
      required: [true, "Rental price is required"],
      min: [0, "Price cannot be negative"],
    },
    deposit: {
      type: Number,
      default: 0,
      min: [0, "Deposit cannot be negative"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    availableQuantity: {
      type: Number,
      required: [true, "Available quantity is required"],
      min: [0, "Available quantity cannot be negative"],
    },
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
resourceSchema.index({ category: 1, "location.city": 1, adminApprovalStatus: 1 });
resourceSchema.index({ provider: 1 });
resourceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Resource", resourceSchema);

