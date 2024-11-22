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
    allowPackA: { type: Boolean, default: true },
    allowPackB: { type: Boolean, default: true },
    allowPackC: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Payment = conn.model("GratisPayment", paymentSchema);

module.exports = Payment;
