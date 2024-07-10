const express = require("express");
const router = express.Router();
const {
  getBillings,
  createBilling,
  updateBilling,
} = require("../controllers/billing");
const { authCheck } = require("../middlewares/auth");

router.get("/gratis/get-billings", authCheck, getBillings);
router.post("/gratis/create-billing", authCheck, createBilling);
router.put("/gratis/update-billing", authCheck, updateBilling);

module.exports = router;
