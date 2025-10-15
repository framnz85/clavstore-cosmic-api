const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const cashflowSchema = new mongoose.Schema(
  {
    estoreid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Estore",
      required: true,
    },
    type: {
      type: String,
      enum: ["inflow", "outflow"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Cashflow = conn.model("GratisCashflow", cashflowSchema);

module.exports = Cashflow;
