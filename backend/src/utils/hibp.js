const crypto = require("node:crypto");

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

const sha1Hex = (password) =>
  crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();


const suffixIsBreached = (body, suffix) =>
  String(body).split("\n").some((line) => {
    const [candidate, count] = line.split(":");
    return candidate !== undefined && candidate.trim() === suffix && Number.parseInt(count, 10) > 0;
  });


const isPasswordBreached = async (password) => {
  const hash = sha1Hex(password);
  try {
    const res = await fetch(`${RANGE_ENDPOINT}${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`HIBP range check returned ${res.status}; allowing the password through.`);
      return false;
    }
    return suffixIsBreached(await res.text(), hash.slice(5));
  } catch (err) {
    console.warn(`HIBP range check unavailable (${err.message}); allowing the password through.`);
    return false;
  }
};

module.exports = { sha1Hex, suffixIsBreached, isPasswordBreached };
