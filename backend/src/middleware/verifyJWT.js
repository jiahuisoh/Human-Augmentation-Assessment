const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(decoded.id).select("role email verificationStatus");
    if (!user) return res.status(401).json({ error: "This account no longer exists" });
    if (user.verificationStatus === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended. Please contact the administrator if you believe this is an error.", code: "ACCOUNT_SUSPENDED" });
    }
    req.user = { id: user._id.toString(), role: user.role, email: user.email };
    next();
  } catch {
    return res.status(500).json({ error: "Could not verify account status" });
  }
};

module.exports = verifyJWT;
