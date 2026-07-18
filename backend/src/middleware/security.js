const helmet = require("helmet");

// JSON-only API: nothing may frame it or execute from it.
const securityHeaders = helmet({
  frameguard: { action: "deny" },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
});

// API responses carry personal health data: never cache, never index.
const sensitiveDataHeaders = (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Permissions-Policy": "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  });
  next();
};

// Reject non-JSON bodies up front (express.json would silently skip them,
// leaving req.body empty and turning the real problem into a confusing 400).
const requireJsonContent = (req, res, next) => {
  const hasBody = ["POST", "PUT", "PATCH"].includes(req.method)
    && Number(req.headers["content-length"] || 0) > 0;
  if (hasBody && !req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  next();
};

module.exports = { securityHeaders, sensitiveDataHeaders, requireJsonContent };
