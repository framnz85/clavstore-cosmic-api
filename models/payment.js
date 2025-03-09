const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const paymentSchema = new mongoose.Schema(
  {
    estoreid: ObjectId,
    bankName: String,
    accName: String,
    accNumber: String,
    accDetails: String,
    msgLink: String,
    buttonText: String,
    images: Array,
    purpose: {
      type: String,
      enum: ["basic", "dedicated", "single"],
      default: "basic",
    },
  },
  { timestamps: true }
);

const Payment = conn.model("GratisPayment", paymentSchema);

module.exports = Payment;
