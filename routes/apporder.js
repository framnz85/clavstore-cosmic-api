const express = require("express");
const router = express.Router();
const {
  getPosOrders,
  updateCart,
  saveOrder,
  sendOrder,
  updateOrder,
} = require("../controllers/app/order");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post("/app/all-pos-orders", authCheck, adminGratisCheck, getPosOrders);
router.post("/app/update-pos-cart", authCheck, adminGratisCheck, updateCart);
router.post("/app/save-pos-orders", authCheck, adminGratisCheck, saveOrder);
router.post("/app/send-pos-orders", authCheck, adminGratisCheck, sendOrder);
router.put("/app/update-pos-orders", authCheck, adminGratisCheck, updateOrder);

module.exports = router;
