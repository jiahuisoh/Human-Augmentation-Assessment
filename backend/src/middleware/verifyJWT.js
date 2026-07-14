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
    // .lean(): this runs on every authenticated request and only reads plain
    // fields — skip mongoose document hydration.
    const user = await User.findById(decoded.id).select("role email verificationStatus assignedClientIds +passwordChangedAt").lean();
    if (!user) return res.status(401).json({ error: "This account no longer exists" });
    if (user.verificationStatus === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended. Please contact the administrator if you believe this is an error.", code: "ACCOUNT_SUSPENDED" });
    }
    // A token minted before a role change or password change is stale:
    // force a fresh login rather than honouring the old claims.
    if (decoded.role && decoded.role !== user.role) {
      return res.status(401).json({ error: "Your account role has changed. Please log in again." });
    }
    const tokenPwdAt = decoded.pwdAt ?? null;
    const dbPwdAt = user.passwordChangedAt ? user.passwordChangedAt.getTime() : null;
    if (tokenPwdAt !== dbPwdAt) {
      return res.status(401).json({ error: "Session is no longer valid. Please log in again." });
    }
    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      verificationStatus: user.verificationStatus,
      assignedClientIds: user.assignedClientIds || [],
    };
    next();
  } catch {
    return res.status(500).json({ error: "Could not verify account status" });
  }
};

module.exports = verifyJWT;
