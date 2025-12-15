const express = require("express");
const router = express.Router();
const multer = require("multer");

const { searchProduct } = require("../controllers/ai-image/ai-image");
const { authCheck, adminGratisCheck } = require("../middlewares/auth");
const { buildIndex } = require("../controllers/ai-image/index-builder");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/gratis/ai-image/build", buildIndex);
router.post(
  "/gratis/ai-image/search",
  upload.single("photo"),
  authCheck,
  adminGratisCheck,
  searchProduct
);

module.exports = router;
