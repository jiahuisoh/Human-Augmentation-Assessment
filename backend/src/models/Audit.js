const mongoose = require("mongoose");

const AuditSchema = new mongoose.Schema({
  actorId:   { type: String, required: true },
  actorRole: { type: String, required: true },
  category:  { type: String, enum: ["AUTH","TOKEN","ADMIN","CONTRACT","CONSENT","AI","CV","ASSESSMENT"], required: true },
  level:     { type: String, enum: ["INFO","WARN","ERROR"], default: "INFO" },
  message:   { type: String, required: true },
  context:   { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

// GET /api/audit reads the newest entries (find().sort({createdAt:-1}).limit(n))
AuditSchema.index({ createdAt: -1 });

AuditSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = obj._id.toString();
  obj.createdAt = obj.createdAt.toISOString();
  return obj;
};

module.exports = mongoose.model("AuditLog", AuditSchema);
