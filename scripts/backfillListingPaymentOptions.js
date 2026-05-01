require("dotenv").config();
const mongoose = require("mongoose");
const Resource = require("../models/Resource");
const Service = require("../models/Service");
const { normalizePaymentOptions } = require("../utils/paymentOptions");

function buildDefaultPaymentOptions(existing) {
  const normalized = normalizePaymentOptions(existing || {});
  return (
    normalized || {
      stripe: { enabled: false, currency: "pkr" },
      manual: { enabled: false, methods: [] },
    }
  );
}

async function backfillModel(Model, modelName) {
  const docs = await Model.find({}, { paymentOptions: 1 }).lean();
  let updated = 0;

  for (const doc of docs) {
    const paymentOptions = buildDefaultPaymentOptions(doc.paymentOptions);
    await Model.updateOne({ _id: doc._id }, { $set: { paymentOptions } });
    updated += 1;
  }

  console.log(`${modelName}: updated ${updated} documents`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);
  await backfillModel(Resource, "Resource");
  await backfillModel(Service, "Service");
  await mongoose.disconnect();
  console.log("Payment options backfill completed");
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
