const isScalar = (v) => ["string", "number", "boolean"].includes(typeof v);

// Trimmed string for scalar input; "" when absent; null when the wrong type.
const asTrimmedString = (v) => {
  if (v === undefined || v === null) return "";
  return isScalar(v) ? String(v).trim() : null;
};

const validEmail = (email) =>
  typeof email === "string" &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

// Min 8 with letters + numbers; capped at 72 because bcrypt ignores bytes beyond that.
const strongPassword = (pw) =>
  typeof pw === "string" &&
  pw.length >= 8 &&
  pw.length <= 72 &&
  /[A-Za-z]/.test(pw) &&
  /\d/.test(pw);

// Numeric scalar (number or numeric string) within [min, max]; null otherwise.
const finiteInRange = (v, min, max) => {
  if (typeof v !== "number" && (typeof v !== "string" || v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Singapore phone number: 8 digits starting with 6, 8 or 9 after stripping
// whitespace; an optional +65 prefix is accepted so stored values round-trip.
// Normalized to "+65XXXXXXXX" on the way in.
const validPhone = (v) => {
  if (typeof v !== "string") return null;
  const m = /^(?:\+65)?([689]\d{7})$/.exec(v.replace(/\s+/g, ""));
  return m ? `+65${m[1]}` : null;
};

// Ids are compared and stored as hex strings throughout the app. The stored
// canonical form is lowercase (ObjectId.toString()), and Mongo string queries
// and JS === are case-sensitive - so ids must be normalized to lowercase the
// moment they enter, or an uppercase hex digit slips past every comparison.
const isObjectIdString = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);


// NRIC/FIN "Checksum to Suffix" scheme: checksum = weighted digit sum mod 11,
// suffix = the series row indexed by that checksum. Each row already encodes
// its series offset. M row is the same scheme for FINs issued from 2022.
const NRIC_WEIGHTS = [9, 4, 5, 6, 7, 8, 9];
const NRIC_TABLES = {
  S: "JABCDEFGHIZ",
  T: "GHIZJABCDEF",
  F: "XKLMNPQRTUW",
  G: "RTUWXKLMNPQ",
  M: "TUWXKLJNPQR",
};
const isValidNric = (v) => {
  if (typeof v !== "string") return false;
  const nric = v.trim().toUpperCase();
  if (!/^[STFGM]\d{7}[A-Z]$/.test(nric)) return false;
  let checksum = 0;
  for (let i = 0; i < 7; i++) 
    checksum += Number(nric[i + 1]) * NRIC_WEIGHTS[i];
  return nric[8] === NRIC_TABLES[nric[0]][checksum % 11];
};

// ── Rule engine ───────────────────────────────────────────────────────────────
// Each checker returns the normalized value, or null when invalid.
// (Booleans are the one type whose valid value can be false - handled below.)
const CHECKS = {
  email:    (v) => (typeof v === "string" && validEmail(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null),
  password: (v) => (strongPassword(v) ? v : null),
  string:   (v, r) => {
    const s = asTrimmedString(v);
    if (s === null || s === "") return null;
    if (r.max && s.length > r.max) return null;
    if (r.pattern && !r.pattern.test(s)) return null;
    return s;
  },
  date:     (v) => {
    const s = asTrimmedString(v);
    return s && s.length <= 30 && !Number.isNaN(Date.parse(s)) ? s : null;
  },
  // Date of birth: a parseable date that is not in the future and at most 120
  // years ago. Age-band norm lookups key off this, so a "3000-01-01" must be
  // rejected here, not surface later as a broken norm table match.
  birthDate: (v) => {
    const s = asTrimmedString(v);
    if (!s || s.length > 30) return null;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const now = new Date();
    const oldest = Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
    return t >= oldest && t <= now.getTime() ? s : null;
  },
  enum:     (v, r) => (r.values.includes(v) ? v : null),
  number:   (v, r) => finiteInRange(v, r.min, r.max),
  boolean:  (v) => (typeof v === "boolean" ? v : null),
  objectId: (v) => (isObjectIdString(v) ? v.toLowerCase() : null),
  array:    (v, r) => (Array.isArray(v) && v.length > 0 && (!r.max || v.length <= r.max) ? v : null),
  nric:     (v) => (isValidNric(v) ? v.trim().toUpperCase() : null),
  sgPhone:  (v) => validPhone(v),
  validPhone:  (v) => validPhone(v),
  // Flat map of id → scalar answer (e.g. questionnaire submissions). Stored as
  // Mixed, so shape and size are enforced here: a plain object, 1..max entries,
  // bounded key length, and scalar values only (strings capped at 500 chars).
  scalarMap: (v, r) => {
    if (Object.prototype.toString.call(v) !== "[object Object]") return null;
    const entries = Object.entries(v);
    if (entries.length === 0 || entries.length > (r.max || 100)) return null;
    const scalarOk = (x) =>
      typeof x === "boolean" ||
      (typeof x === "number" && Number.isFinite(x)) ||
      (typeof x === "string" && x.length <= 500);
    return entries.every(([key, value]) => key.length <= (r.maxKey || 64) && scalarOk(value))
      ? v
      : null;
  },
};

const defaultMessage = (key, rule) => {
  const label = rule.label || key;
  switch (rule.type) {
    case "email":    return "A valid email address is required";
    case "password": return "Password must be 8 to 72 characters and include letters and numbers";
    case "string":   return `${label} is required${rule.max ? ` (max ${rule.max} characters)` : ""}`;
    case "date":     return `${label} must be a valid date`;
    case "birthDate": return `${label} must be a valid past date within the last 120 years`;
    case "enum":     return `${label} must be one of: ${rule.values.join(", ")}`;
    case "number":   return `${label} must be a number between ${rule.min} and ${rule.max}`;
    case "boolean":  return `${label} must be true or false`;
    case "objectId": return `A valid ${label} is required`;
    case "array":    return `${label} must be a non-empty list${rule.max ? ` (max ${rule.max} entries)` : ""}`;
    case "nric":     return "Please enter a valid Singapore NRIC or FIN";
    case "sgPhone":  return "Please enter a valid Singapore phone number";
    case "scalarMap": return `${label} must be a map of ids to scalar values${rule.max ? ` (max ${rule.max} entries)` : ""}`;
    default:         return `${label} is invalid`;
  }
};

const isAbsent = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const validate = (body, schema) => {
  const source = (body && typeof body === "object") ? body : {};
  const fields = {};
  const values = {};

  for (const [key, rule] of Object.entries(schema)) {
    const raw = source[key];

    if (isAbsent(raw)) {
      if (rule.required) fields[key] = rule.message || defaultMessage(key, rule);
      continue; // optional and absent: leave values[key] undefined
    }

    const value = CHECKS[rule.type](raw, rule);
    if (value === null) {
      fields[key] = rule.message || defaultMessage(key, rule);
    } else {
      values[key] = value;
    }
  }

  return { ok: Object.keys(fields).length === 0, fields, values };
};

const validationFailed = (res, fields) =>
  res.status(400).json({ error: Object.values(fields)[0], fields });

module.exports = {
  isScalar,
  asTrimmedString,
  validEmail,
  strongPassword,
  finiteInRange,
  isObjectIdString,
  isValidNric,
  validate,
  validationFailed,
};
