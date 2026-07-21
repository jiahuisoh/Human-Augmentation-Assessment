const path = require("path");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const connectDB = require("./config/db");

// Tokens signed with an empty secret would be forgeable - refuse to boot.
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set - refusing to start.");
  process.exit(1);
}

if (!process.env.CV_SIGNING_SECRET) {
  console.error("FATAL: CV_SIGNING_SECRET is not set - refusing to start. It must match the value given to cv-service.");
  process.exit(1);
}

// Require the app only after the environment is loaded and validated.
const app = require("./app");

// ── Connect to MongoDB Atlas ──────────────────────────────────────────────────
connectDB();

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4502;
app.listen(PORT, () => {
  console.log(`HANA backend running on http://localhost:${PORT}`);
});
