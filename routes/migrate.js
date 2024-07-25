const express = require("express");
const router = express.Router();
const { getAllProducts, getAllCategories } = require("../controllers/migrate");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.post(
  "/gratis/get-migrate-products",
  authCheck,
  adminGratisCheck,
  getAllProducts
);

router.post(
  "/gratis/get-migrate-categories",
  authCheck,
  adminGratisCheck,
  getAllCategories
);

module.exports = router;
