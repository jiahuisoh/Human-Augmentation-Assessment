const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const EmergencyContactSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  phone:        { type: String, required: true },
  relationship: { type: String, required: true },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:           { type: String, required: true, select: false },
  name:               { type: String, required: true, trim: true },
  role:               { type: String, enum: ["client","staff","clinician","developer","administrator"], default: "client" },
  dateOfBirth:        { type: String },
  gender:             { type: String, enum: ["male","female","other"] },
  height:             { type: Number },
  weight:             { type: Number },
  verificationStatus: { type: String, enum: ["unverified","pending","verified","suspended"], default: "unverified" },
  emergencyContact:   { type: EmergencyContactSchema },
  programmeIds:       [{ type: String }],
  assignedClientIds:  [{ type: String }],
}, { timestamps: true });

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password on login
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Strip password and format fields for frontend
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  obj._id = obj._id.toString();
  if (obj.createdAt) obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
