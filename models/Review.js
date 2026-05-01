const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewer is required"],
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewee is required"],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking is required"],
    },
    reviewType: {
      type: String,
      enum: ["event", "resource", "service"],
      required: [true, "Review type is required"],
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
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    // For two-way reviews (services and resources)
    providerRating: {
      type: Number,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    providerComment: {
      type: String,
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    // Review status
    isVisible: {
      type: Boolean,
      default: true,
    },
    isReported: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for queries
reviewSchema.index({ reviewer: 1, booking: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ reviewType: 1, event: 1 });
reviewSchema.index({ reviewType: 1, resource: 1 });
reviewSchema.index({ reviewType: 1, service: 1 });
reviewSchema.index({ createdAt: -1 });

// Update average rating when review is saved
reviewSchema.post("save", async function () {
  await updateAverageRating(this);
});

// Update average rating when review is removed
reviewSchema.post("remove", async function () {
  await updateAverageRating(this);
});

async function updateAverageRating(review) {
  let model, id;
  if (review.event) {
    model = require("./Event");
    id = review.event;
  } else if (review.resource) {
    model = require("./Resource");
    id = review.resource;
  } else if (review.service) {
    model = require("./Service");
    id = review.service;
  }

  if (model && id) {
    const Review = review.constructor;
    const stats = await Review.aggregate([
      {
        $match: {
          [review.reviewType]: id,
          isVisible: true,
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      await model.findByIdAndUpdate(id, {
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
        totalReviews: stats[0].totalReviews,
      });
    } else {
      await model.findByIdAndUpdate(id, {
        averageRating: 0,
        totalReviews: 0,
      });
    }
  }
}

module.exports = mongoose.model("Review", reviewSchema);

