const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLES, VERIFICATION_STATUSES } = require("../utils/constants");

const EmergencyContactSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  phone:        { type: String, required: true, match: /^\+65[689]\d{7}$/ },
  relationship: { type: String, required: true },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:           { type: String, required: true, select: false },
  name:               { type: String, required: true, trim: true },
  role:               { type: String, enum: ROLES, default: "client" },
  dateOfBirth:        { type: String },
  gender:             { type: String, enum: ["male","female","other"] },
  height:             { type: Number },
  weight:             { type: Number },
  verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: "unverified" },
  passwordChangedAt:  { type: Date, select: false },
  nricHash:           { type: String, select: false },
  nricLastFour:       { type: String },
  staffVerification:  {
    type: new mongoose.Schema({
      recommended: { type: Boolean, required: true },
      by:          { type: String,  required: true },
      at:          { type: String,  required: true },
    }, { _id: false }),
  },
  emergencyContact:   { type: EmergencyContactSchema },
  programmeIds:       [{ type: String }],
  assignedClientIds:  [{ type: String }],
}, { timestamps: true });


UserSchema.index({ role: 1, verificationStatus: 1 });

UserSchema.index({ assignedClientIds: 1 });

UserSchema.index({ createdAt: -1 });


UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

// Compare password on login
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Strip credential material and format fields for frontend.
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordChangedAt;
  delete obj.nricHash;
  obj._id = obj._id.toString();
  if (obj.createdAt) obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
