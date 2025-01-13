const express = require("express");
const router = express.Router();
const {
  getUserDetails,
  getRaffleEntries,
  getTopEntries,
  getAllUsers,
  createNewUser,
  updateUser,
  updateCustomer,
  verifyUserEmail,
  changePassword,
  resetPassword,
  forgotPassword,
  deleteUser,
  deleteAllRaffles,
  sendEmail,
  addToWishlist,
  deleteAccountRequest,
} = require("../controllers/user");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/user-details/:resellid", authCheck, getUserDetails);
router.get("/gratis/raffle-entries", authCheck, getRaffleEntries);
router.get(
  "/gratis/top-entries/:count",
  authCheck,
  adminGratisCheck,
  getTopEntries
);
router.post("/gratis/all-users", authCheck, adminGratisCheck, getAllUsers);
router.post("/gratis/user-create/:resellid", createNewUser);
router.post("/gratis/user-email", sendEmail);
router.post("/gratis/add-wishlist", authCheck, addToWishlist);
router.put("/gratis/user-update", authCheck, updateUser);
router.put("/gratis/update-customer/:userid", authCheck, updateCustomer);
router.put("/gratis/user-verify", authCheck, verifyUserEmail);
router.put("/gratis/change-password", authCheck, changePassword);
router.put(
  "/gratis/reset-password/:userid",
  authCheck,
  adminGratisCheck,
  resetPassword
);
router.put("/gratis/forgot-password", forgotPassword);
router.put("/gratis/delete-account-request", deleteAccountRequest);
router.delete(
  "/gratis/user-delete/:userid",
  authCheck,
  adminGratisCheck,
  deleteUser
);
router.delete(
  "/gratis/delete-all-raffles",
  authCheck,
  adminGratisCheck,
  deleteAllRaffles
);

module.exports = router;
