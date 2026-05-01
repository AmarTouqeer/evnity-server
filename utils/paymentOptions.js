const ALLOWED_MANUAL_METHOD_TYPES = new Set([
  "easypaisa",
  "jazzcash",
  "bank_transfer",
  "cash",
]);

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return fallback;
    }
  }
  return value;
}

function normalizePaymentOptions(input) {
  if (!input || typeof input !== "object") return undefined;

  const stripeEnabled = Boolean(input?.stripe?.enabled);
  const manualEnabled = Boolean(input?.manual?.enabled);

  const stripeCurrencyRaw = input?.stripe?.currency || "pkr";
  const stripeCurrency =
    typeof stripeCurrencyRaw === "string" && stripeCurrencyRaw.trim()
      ? stripeCurrencyRaw.trim().toLowerCase()
      : "pkr";

  const methodsInput = Array.isArray(input?.manual?.methods)
    ? input.manual.methods
    : [];

  const methods = methodsInput
    .map((m) => ({
      type: typeof m?.type === "string" ? m.type.trim() : "",
      label: typeof m?.label === "string" ? m.label.trim() : "",
      accountTitle: typeof m?.accountTitle === "string" ? m.accountTitle.trim() : "",
      accountNumber: typeof m?.accountNumber === "string" ? m.accountNumber.trim() : "",
      bankName: typeof m?.bankName === "string" ? m.bankName.trim() : "",
      iban: typeof m?.iban === "string" ? m.iban.trim() : "",
      instructions: typeof m?.instructions === "string" ? m.instructions.trim() : "",
      isActive: m?.isActive === undefined ? true : Boolean(m.isActive),
    }))
    .filter((m) => ALLOWED_MANUAL_METHOD_TYPES.has(m.type));

  return {
    stripe: { enabled: stripeEnabled, currency: stripeCurrency },
    manual: { enabled: manualEnabled, methods },
  };
}

module.exports = {
  parseMaybeJson,
  normalizePaymentOptions,
  ALLOWED_MANUAL_METHOD_TYPES,
};
