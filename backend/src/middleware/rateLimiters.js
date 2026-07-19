const erl = require("express-rate-limit");

const rateLimit = erl.rateLimit || erl;
const ipKeyGenerator = erl.ipKeyGenerator || ((ip) => ip);

// Global rate limit: coarse backstop of 100 requests per 15 minutes per IP.
// The strict per-endpoint limiters below are the real abuse controls (login
// 5/15min per IP+email, register 30/hour per IP). If several dashboards share
// one clinic NAT IP and start hitting 429s, raise this cap rather than
// loosening the auth limiters.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Login throttle keyed by IP + submitted email, counting failures only, so
// credential guessing is cut off without a shared-IP site-wide lockout.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
  handler: (req, res) => res.status(429).json({ error: "Too many login attempts, please try again later." }),
});

// Registration throttle: the duplicate-email response is unavoidably an
// account-existence oracle (no email-verification flow exists to hide it), so
// cap how fast that oracle can be queried. 30/hour still covers a clinic
// kiosk onboarding a full day of clients.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res) => res.status(429).json({ error: "Too many registration attempts, please try again later." }),
});


const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${req.user?.id || ""}`,
  handler: (req, res) => res.status(429).json({ error: "Too many password attempts, please try again later." }),
});

module.exports = { globalLimiter, loginLimiter, registerLimiter, passwordChangeLimiter };
