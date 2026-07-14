const mongoose = require("mongoose");

// Strip $-operators from query filter values built from user input, so an
// injected {$ne:…} can never widen a lookup (routes also type-check inputs).
mongoose.set("sanitizeFilter", true);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
