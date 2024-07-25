const ObjectId = require("mongoose").Types.ObjectId;

const Product = require("../models/product");
const Category = require("../models/category");

exports.getAllProducts = async (req, res) => {
  const estoreid = req.body.estoreid;
  const skip = req.body.skip;
  const limit = req.body.limit;

  try {
    const products = await Product.find({ estoreid: new ObjectId(estoreid) })
      .select("_id images")
      .skip(skip)
      .limit(limit)
      .exec();

    res.json(products);
  } catch (error) {
    res.json({ err: "Getting all products failed. " + error.message });
  }
};

exports.getAllCategories = async (req, res) => {
  const estoreid = req.body.estoreid;

  try {
    const categories = await Category.find({ estoreid: new ObjectId(estoreid) })
      .select("_id images")
      .exec();

    res.json(categories);
  } catch (error) {
    res.json({ err: "Getting all categories failed. " + error.message });
  }
};
