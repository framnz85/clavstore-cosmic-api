const express = require("express");
const router = express.Router();
const {
  createPurchase,
  getPurchase,
  listPurchases,
  updatePurchase,
  deletePurchase,
  receivePurchase,
} = require("../controllers/purchase");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post("/gratis/create-purchase", authCheck, adminGratisCheck, createPurchase);
router.get("/gratis/purchase/:purchaseid", authCheck, getPurchase);
router.post("/gratis/purchases", authCheck, adminGratisCheck, listPurchases);
router.put("/gratis/purchase/:purchaseid", authCheck, adminGratisCheck, updatePurchase);
router.delete("/gratis/delete-purchase/:purchaseid", authCheck, adminGratisCheck, deletePurchase);
router.put("/gratis/receive-purchase/:purchaseid", authCheck, receivePurchase);

module.exports = router;
