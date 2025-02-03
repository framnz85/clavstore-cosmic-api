const express = require("express");
const router = express.Router();
const {
  latestBill,
  getHostingBill,
  getBillings,
  addBilling,
  updateBilling,
} = require("../controllers/billing");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get(
  "/gratis/latest-bill/:packid",
  authCheck,
  adminGratisCheck,
  latestBill
);
router.get(
  "/gratis/get-hosting-billing",
  authCheck,
  adminGratisCheck,
  getHostingBill
);
router.get("/gratis/get-billings", authCheck, adminGratisCheck, getBillings);
router.post("/gratis/add-billing", authCheck, adminGratisCheck, addBilling);
router.put(
  "/gratis/update-billing",
  authCheck,
  adminGratisCheck,
  updateBilling
);

module.exports = router;
