const express = require("express");
const router = express.Router();
const {
  userOrder,
  userOrders,
  adminOrder,
  adminOrders,
  adminSales,
  updateCart,
  saveCartOrder,
  updateOrderStatus,
  updatePaidOrder,
  updateCustomDetails,
  updateProductRating,
  voidProducts,
  editOrder,
  submitEditOrder,
  deleteAdminOrder,
  deleteOrder,
} = require("../controllers/order");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/user-order/:orderid", authCheck, userOrder);
router.get(
  "/gratis/admin-order/:orderid",
  authCheck,
  adminGratisCheck,
  adminOrder
);
router.post("/gratis/user-orders", authCheck, userOrders);
router.post("/gratis/admin-orders", authCheck, adminGratisCheck, adminOrders);
router.post("/gratis/update-cart", authCheck, updateCart);
router.post("/gratis/save-cart-order", authCheck, saveCartOrder);
router.post("/gratis/admin-sales", authCheck, adminGratisCheck, adminSales);
router.put(
  "/gratis/update-order-status",
  authCheck,
  adminGratisCheck,
  updateOrderStatus
);
router.put("/gratis/update-paid-order", authCheck, updatePaidOrder);
router.put("/gratis/update-custom-details", authCheck, updateCustomDetails);
router.put("/gratis/update-product-rating", authCheck, updateProductRating);
router.put("/gratis/void-product", authCheck, adminGratisCheck, voidProducts);
router.put("/gratis/edit-order", authCheck, editOrder);
router.put("/gratis/submit-edit-order", authCheck, submitEditOrder);
router.delete(
  "/gratis/delete-admin-order/:orderid",
  authCheck,
  adminGratisCheck,
  deleteAdminOrder
);
router.delete("/gratis/delete-order/:orderid", authCheck, deleteOrder);

module.exports = router;
