const express = require("express");
const router = express.Router();
const {
  getEstore,
  getDefaultEstore,
  getReseller,
  getEstores,
  getDedicatedEstores,
  getEstoresBilling,
  getEstoreCounters,
  updateEstore,
  createEstore,
  addNewEstore,
  copyingEstore,
  approveCosmic,
  updateEstoreReseller,
  updateEstoreCounters,
  updateEstoresDefault,
  deletingEstore,
} = require("../controllers/estore");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");

router.get("/gratis/estore/:slug", getEstore);
router.get("/gratis/default-estore", getDefaultEstore);
router.get("/gratis/reseller/:id", getReseller);
router.get("/gratis/dedicated-estores", getDedicatedEstores);
router.post("/gratis/estores", authCheck, adminGratisCheck, getEstores);
router.post(
  "/gratis/estores-billing",
  authCheck,
  adminGratisCheck,
  getEstoresBilling
);
router.get("/gratis/estore-counters/:estoreid", getEstoreCounters);
router.post("/gratis/estore-update", authCheck, adminGratisCheck, updateEstore);
router.post("/gratis/estore-create/:resellid", createEstore);
router.post(
  "/gratis/add-new-estore/:resellid",
  authCheck,
  adminGratisCheck,
  addNewEstore
);
router.post(
  "/gratis/copying-estore/:resellid",
  authCheck,
  adminGratisCheck,
  copyingEstore
);
router.put(
  "/gratis/approve-cosmic",
  authCheck,
  adminGratisCheck,
  approveCosmic
);
router.put(
  "/gratis/update-estore-reseller",
  authCheck,
  adminGratisCheck,
  updateEstoreReseller
);
router.put("/gratis/update-estore-counters", updateEstoreCounters);
router.put("/gratis/update-estores-default", updateEstoresDefault);
router.delete(
  "/gratis/delete-estore/:deleteid",
  authCheck,
  adminGratisCheck,
  deletingEstore
);

module.exports = router;
