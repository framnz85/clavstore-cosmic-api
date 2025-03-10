const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const brandSchema = new mongoose.Schema(
  {
    estoreid: ObjectId,
    name: {
      type: String,
      trim: true,
      required: true,
      minlength: 2,
      maxlength: 32,
    },
    slug: {
      type: String,
      lowercase: true,
      index: true,
    },
    bra_code: ObjectId,
    images: {
      type: Array,
    },
  },
  { timestamps: true }
);

const Brand = conn.model("GratisBrand", brandSchema);

module.exports = Brand;
