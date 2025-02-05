const ObjectId = require("mongoose").Types.ObjectId;
const Category = require("../../models/category");

exports.getCategories = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const page = req.body.page;
  const limit = req.body.page;

  try {
    const categories = await Category.find({
      estoreid: new ObjectId(estoreid),
    })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    res.json(categories);
  } catch (error) {
    res.json({ err: "Fetching categories fails. " + error.message });
  }
};
