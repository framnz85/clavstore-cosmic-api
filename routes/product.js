const express = require("express");
const router = express.Router();
const {
  randomItems,
  getProductBySlug,
  getProductById,
  itemsByBarcode,
  loadInitProducts,
  getWaitingProducts,
  getAdminItems,
  addProduct,
  searchProduct,
  submitRating,
  updateProduct,
  receiveProducts,
  updateProducts,
  deleteProduct,
  checkImageUser,
} = require("../controllers/product");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/products/random/:count", randomItems);
router.get("/gratis/get-product-by-slug/:slug", getProductBySlug);
router.get(
  "/gratis/get-product-by-id/:prodid",
  authCheck,
  adminGratisCheck,
  getProductById
);
router.get("/gratis/get-product-by-barcode/:barcode", itemsByBarcode);
router.get(
  "/gratis/init-product/:count",
  authCheck,
  adminGratisCheck,
  loadInitProducts
);
router.get(
  "/gratis/get-waiting-products",
  authCheck,
  adminGratisCheck,
  getWaitingProducts
);
router.get(
  "/gratis/check-image-owner-product/:publicid/:defaultestore",
  authCheck,
  adminGratisCheck,
  checkImageUser
);
router.post(
  "/gratis/get-admin-products",
  authCheck,
  adminGratisCheck,
  getAdminItems
);
router.post("/gratis/get-best-seller", getAdminItems);
router.post("/gratis/add-product", authCheck, adminGratisCheck, addProduct);
router.post("/gratis/search-product", searchProduct);
router.post("/gratis/submit-rating", authCheck, submitRating);
router.put(
  "/gratis/update-product/:prodid",
  authCheck,
  adminGratisCheck,
  updateProduct
);
router.put(
  "/gratis/receive-product",
  authCheck,
  adminGratisCheck,
  receiveProducts
);
router.put(
  "/gratis/import-products",
  authCheck,
  adminGratisCheck,
  updateProducts
);
router.delete(
  "/gratis/delete-product/:prodid",
  authCheck,
  adminGratisCheck,
  deleteProduct
);

module.exports = router;
