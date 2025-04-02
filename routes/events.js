const express = require("express");
const router = express.Router();
const { sendPurchase } = require("../controllers/events");

router.post("/facebook/purchase", sendPurchase);

module.exports = router;
