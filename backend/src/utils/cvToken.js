const crypto = require("crypto");

const B64URL = { "+": "-", "/": "_" };

const b64url = (buf) => buf.toString("base64").replace(/[+/]/g, (c) => B64URL[c]).replace(/=+$/, "");

const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const secret = () => {
  const value = process.env.CV_SIGNING_SECRET;
  // server.js refuses to boot without this, so reaching here means the process
  // was started some other way. Fail closed rather than sign with "undefined".
  if (!value) throw new Error("CV_SIGNING_SECRET is not set");
  return value;
};

const macOf = (body) => b64url(crypto.createHmac("sha256", secret()).update(body).digest());

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Sign a payload, stamping version, type and expiry. */
const sign = (type, payload, ttlSeconds) => {
  const issued = nowSeconds();
  const full = { v: 1, typ: type, iat: issued, exp: issued + ttlSeconds, ...payload };
  const body = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${body}.${macOf(body)}`;
};

/**
 * Verify and decode. Returns the payload, or null for any failure - bad shape,
 * bad signature, wrong type, or expired. Callers must treat null as "reject".
 */
const verify = (token, expectedType) => {
  if (typeof token !== "string" || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "utf8");
  const expected = Buffer.from(macOf(body), "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch. The length
  // of a MAC is not secret, so comparing it early leaks nothing.
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.v !== 1 || payload.typ !== expectedType) return null;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds()) return null;
  return payload;
};

module.exports = { sign, verify, nowSeconds };
