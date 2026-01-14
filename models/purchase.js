const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const conn = require("../dbconnect/gratis");

const purchaseSchema = new mongoose.Schema(
  {
    orderCode: { type: String },
    poType: { type: String, default: "purchase", enum: ["purchase", "job"] },
    supplier: { type: ObjectId, ref: "GratisEstore" },
    items: [
      {
        product: { type: ObjectId, ref: "GratisProduct" },
        description: String,
        unitCost: Number,
        price: Number,
        qty: Number,
        receivedQty: { type: Number, default: 0 },
        variant: ObjectId,
      },
    ],
    paymentOption: { type: ObjectId, ref: "GratisPayment" },
    poStatus: {
      type: String,
      default: "Draft",
      enum: [
        "Draft",
        "Pending",
        "Ordered",
        "Partially Received",
        "Received",
        "Cancelled",
        "Closed",
      ],
    },
    statusHistory: [{ status: String, remarks: String, date: Date }],
    subTotal: Number,
    tax: Number,
    discount: Number,
    grandTotal: Number,
    expectedDelivery: Date,
    receivedDate: Date,
    createdBy: { type: ObjectId, ref: "GratisUser" },
    approvedBy: { type: ObjectId, ref: "GratisUser" },
    receivedBy: { type: ObjectId, ref: "GratisUser" },
    notes: String,
    customFields: [
      {
        key: String,
        value: String,
      },
    ],
  },
  { timestamps: true }
);

purchaseSchema.index(
  {
    orderCode: "text",
  },
  {
    weights: { orderCode: 5 },
  }
);

const PurchaseOrder = conn.model("GratisPurchase", purchaseSchema);

module.exports = PurchaseOrder;
