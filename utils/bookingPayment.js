function getListingFromBooking(booking) {
  if (!booking) return null;
  if (booking.bookingType === "event") return booking.event || null;
  if (booking.bookingType === "service") return booking.service || null;
  if (booking.bookingType === "resource") return booking.resource || null;
  return null;
}

function getListingDisplayName(booking, listing) {
  if (booking?.bookingType === "event") return listing?.title || "Event Booking";
  if (booking?.bookingType === "service") return listing?.title || "Service Booking";
  if (booking?.bookingType === "resource") return listing?.name || "Resource Booking";
  return "Booking";
}

function getPaymentOptionsFromBooking(booking) {
  const listing = getListingFromBooking(booking);
  return listing?.paymentOptions || {};
}

function getActiveManualMethods(paymentOptions = {}) {
  if (!paymentOptions?.manual?.enabled) return [];
  if (!Array.isArray(paymentOptions.manual.methods)) return [];
  return paymentOptions.manual.methods.filter((m) => m && m.isActive);
}

module.exports = {
  getListingFromBooking,
  getListingDisplayName,
  getPaymentOptionsFromBooking,
  getActiveManualMethods,
};
