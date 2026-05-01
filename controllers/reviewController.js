const Review = require("../models/Review");
const Booking = require("../models/Booking");

// @desc    Create review
// @route   POST /api/reviews
// @access  Private
exports.createReview = async (req, res, next) => {
  try {
    const {
      bookingId,
      rating,
      comment,
      providerRating,
      providerComment,
    } = req.body;

    // Validate booking exists and belongs to user
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check if booking is completed
    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only review completed bookings",
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      reviewer: req.user._id,
      booking: bookingId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "Review already exists for this booking",
      });
    }

    // Determine review type and entity
    const reviewType = booking.bookingType;
    let entityId;
    if (reviewType === "event") entityId = booking.event;
    else if (reviewType === "resource") entityId = booking.resource;
    else if (reviewType === "service") entityId = booking.service;

    // Create review
    const reviewData = {
      reviewer: req.user._id,
      reviewee: booking.provider,
      booking: bookingId,
      reviewType,
      [reviewType]: entityId,
      rating,
      comment: comment || "",
    };

    // For services and resources, allow provider to rate customer (2-way)
    if ((reviewType === "service" || reviewType === "resource") && providerRating) {
      reviewData.providerRating = providerRating;
      reviewData.providerComment = providerComment || "";
    }

    const review = await Review.create(reviewData);

    await review.populate([
      { path: "reviewer", select: "name avatar" },
      { path: "reviewee", select: "name avatar" },
    ]);

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: { review },
    });
  } catch (error) {
    console.error("Create review error:", error);
    next(error);
  }
};

// @desc    Get reviews for an entity
// @route   GET /api/reviews/:type/:id
// @access  Public
exports.getReviews = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!["event", "resource", "service"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review type",
      });
    }

    const query = {
      reviewType: type,
      [type]: id,
      isVisible: true,
    };

    const reviews = await Review.find(query)
      .populate("reviewer", "name avatar")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Review.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        reviews,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    next(error);
  }
};

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private
exports.updateReview = async (req, res, next) => {
  try {
    const { rating, comment, providerRating, providerComment } = req.body;

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check ownership
    if (review.reviewer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this review",
      });
    }

    if (rating) review.rating = rating;
    if (comment !== undefined) review.comment = comment;
    if (providerRating) review.providerRating = providerRating;
    if (providerComment !== undefined) review.providerComment = providerComment;

    await review.save();

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: { review },
    });
  } catch (error) {
    console.error("Update review error:", error);
    next(error);
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check ownership or admin
    if (
      review.reviewer.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this review",
      });
    }

    await review.deleteOne();

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);
    next(error);
  }
};

exports.replyToReview = async (req, res, next) => {
  try {
    const { comment } = req.body;

    if (!comment || comment.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Reply comment is required",
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Only the provider who was reviewed can reply
    if (review.reviewee.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to reply to this review",
      });
    }

    review.providerReply = {
      comment: comment.trim(),
      repliedAt: new Date(),
    };

    await review.save();

    res.status(200).json({
      success: true,
      message: "Reply added successfully",
      data: { review },
    });
  } catch (error) {
    console.error("Reply to review error:", error);
    next(error);
  }
};