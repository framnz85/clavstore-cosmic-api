const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const jobListSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      index: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    slug: {
      type: String,
      lowercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
    },
    // price for doing the job (fixed fee)
    price: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "PHP" },
    },
    category: String,
    tags: [String],
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: ObjectId,
      ref: "GratisUser",
    },
    meta: Object,
  },
  { timestamps: true }
);

// text index for search
jobListSchema.index({ title: "text", description: "text", tags: "text" }, { weights: { title: 5, description: 2, tags: 1 } });

const JobList = conn.model("JobList", jobListSchema);

module.exports = JobList;
