const express = require("express");
const router = express.Router();
const {
  getBrand,
  getBrands,
  addBrand,
  updateBrand,
  removeBrand,
} = require("../controllers/brand");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/get-brand/:braid", authCheck, getBrand);
router.get("/gratis/get-brands", getBrands);
router.post("/gratis/add-brand", authCheck, adminGratisCheck, addBrand);
router.put(
  "/gratis/update-brand/:braid",
  authCheck,
  adminGratisCheck,
  updateBrand
);
router.delete(
  "/gratis/remove-brand/:braid",
  authCheck,
  adminGratisCheck,
  removeBrand
);

module.exports = router;
