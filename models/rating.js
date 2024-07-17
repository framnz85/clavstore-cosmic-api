const mongoose = require("mongoose");
const conn = require("../dbconnect/gratis");

const ratingSchema = new mongoose.Schema({
  userid: {
    type: Object,
    required: true,
  },
  prodid: {
    type: Object,
    required: true,
  },
  estoreid: {
    type: Object,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
    default: 0,
  },
});

ratingSchema.index({ name: "text" });

module.exports = conn.model("GratisRating", ratingSchema);
