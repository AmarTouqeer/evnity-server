const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const paymentControllerPath = path.join(root, "controllers", "paymentController.js");
const bookingControllerPath = path.join(root, "controllers", "bookingController.js");

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function mockModule(modulePath, mockExports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: mockExports,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makePopulateQuery(result) {
  return {
    populate() {
      return this;
    },
    then(resolve) {
      return Promise.resolve(resolve(result));
    },
  };
}

function makeBooking(bookingType, overrides = {}) {
  const baseListing =
    bookingType === "event"
      ? { title: "My Event" }
      : bookingType === "service"
      ? { title: "My Service" }
      : { name: "My Resource" };

  const booking = {
    _id: "booking-1",
    bookingType,
    customer: { toString: () => "customer-1" },
    provider: {
      _id: "provider-1",
      stripeAccountId: "acct_test",
      stripeConnected: true,
      stripeChargesEnabled: true,
    },
    status: "accepted",
    paymentStatus: "pending",
    totalAmount: 1000,
    eventDate: new Date("2026-05-01T00:00:00.000Z"),
    startTime: "10:00",
    endTime: "12:00",
    paymentMethod: "none",
    paymentProvider: undefined,
    platformFee: 0,
    providerPayout: 0,
    platformFeePercentage: 0,
    save: async function () {
      return this;
    },
    event: bookingType === "event" ? baseListing : null,
    service: bookingType === "service" ? baseListing : null,
    resource: bookingType === "resource" ? baseListing : null,
  };

  const listing = booking.event || booking.service || booking.resource;
  listing.paymentOptions = {
    stripe: { enabled: true, currency: "usd" },
    manual: { enabled: true, methods: [{ type: "cash", isActive: true }] },
  };

  return Object.assign(booking, overrides);
}

test("creates Stripe checkout for service booking", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.PLATFORM_FEE_PERCENTAGE = "10";

  const booking = makeBooking("service");

  mockModule(path.join(root, "models", "Booking.js"), {
    findById: () => makePopulateQuery(booking),
  });
  mockModule(path.join(root, "models", "User.js"), {});
  mockModule(path.join(root, "utils", "notificationHelper.js"), { createNotification: async () => {} });
  mockModule(path.join(root, "utils", "emailService.js"), { sendBookingConfirmationEmail: async () => {} });
  mockModule("stripe", () => ({
    checkout: {
      sessions: {
        create: async () => ({ id: "cs_test_service", url: "https://stripe.test/service" }),
      },
    },
  }));

  clearModule(paymentControllerPath);
  const { createStripeCheckoutSession } = require(paymentControllerPath);

  const req = { body: { bookingId: "booking-1" }, user: { _id: "customer-1", email: "c@test.com" } };
  const res = makeRes();
  await createStripeCheckoutSession(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.url, "https://stripe.test/service");
});

test("webhook marks resource booking paid", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";

  const booking = makeBooking("resource", {
    status: "accepted",
    paymentStatus: "pending",
  });

  mockModule(path.join(root, "models", "Booking.js"), {
    findById: async () => booking,
    findOne: async () => null,
  });
  mockModule(path.join(root, "models", "User.js"), { findById: async () => null });
  mockModule(path.join(root, "utils", "notificationHelper.js"), { createNotification: async () => {} });
  mockModule(path.join(root, "utils", "emailService.js"), { sendBookingConfirmationEmail: async () => {} });
  mockModule("stripe", () => ({
    webhooks: {
      constructEvent: () => ({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_resource",
            payment_intent: "pi_test_resource",
            metadata: { bookingId: "booking-1", platformFee: "100", providerPayout: "900" },
          },
        },
      }),
    },
  }));

  clearModule(paymentControllerPath);
  const { stripeWebhook } = require(paymentControllerPath);

  const req = { headers: { "stripe-signature": "sig" }, body: Buffer.from("{}") };
  const res = makeRes();
  await stripeWebhook(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(booking.paymentStatus, "paid");
  assert.equal(booking.paymentProvider, "stripe");
  assert.equal(booking.status, "confirmed");
});

test("manual confirm rejects service booking when manual disabled", async () => {
  const booking = makeBooking("service", {
    receipt: { url: "https://cdn/receipt.png" },
  });
  booking.service.paymentOptions.manual.enabled = false;

  mockModule(path.join(root, "models", "Booking.js"), {
    findById: () => makePopulateQuery(booking),
  });
  mockModule(path.join(root, "models", "Event.js"), {});
  mockModule(path.join(root, "models", "Resource.js"), {});
  mockModule(path.join(root, "models", "Service.js"), {});
  mockModule(path.join(root, "models", "User.js"), { findById: async () => ({}) });
  mockModule(path.join(root, "middleware", "upload.js"), { uploadToCloudinary: async () => ({}) });
  mockModule(path.join(root, "utils", "notificationHelper.js"), { createNotification: async () => {} });
  mockModule(path.join(root, "utils", "emailService.js"), {
    sendBookingConfirmationEmail: async () => {},
    sendBookingStatusEmail: async () => {},
  });

  clearModule(bookingControllerPath);
  const { confirmBooking } = require(bookingControllerPath);

  const req = { params: { id: "booking-1" }, user: { _id: "customer-1", name: "C" } };
  const res = makeRes();
  await confirmBooking(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "manual not enabled");
});

test("event checkout regression remains successful", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  const booking = makeBooking("event");

  mockModule(path.join(root, "models", "Booking.js"), {
    findById: () => makePopulateQuery(booking),
  });
  mockModule(path.join(root, "models", "User.js"), {});
  mockModule(path.join(root, "utils", "notificationHelper.js"), { createNotification: async () => {} });
  mockModule(path.join(root, "utils", "emailService.js"), { sendBookingConfirmationEmail: async () => {} });
  mockModule("stripe", () => ({
    checkout: {
      sessions: {
        create: async () => ({ id: "cs_test_event", url: "https://stripe.test/event" }),
      },
    },
  }));

  clearModule(paymentControllerPath);
  const { createStripeCheckoutSession } = require(paymentControllerPath);

  const req = { body: { bookingId: "booking-1" }, user: { _id: "customer-1", email: "c@test.com" } };
  const res = makeRes();
  await createStripeCheckoutSession(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});
