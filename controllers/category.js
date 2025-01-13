const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");

const Category = require("../models/category");
const Estore = require("../models/estore");
const Product = require("../models/product");

exports.getCategory = async (req, res) => {
  const catid = req.params.catid;
  const estoreid = req.headers.estoreid;
  try {
    const category = await Category.findOne({
      _id: new ObjectId(catid),
      estoreid: new ObjectId(estoreid),
    });
    const countProduct = await Product.countDocuments({
      category: new ObjectId(category._id),
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json({
      ...category._doc,
      itemcount: countProduct,
    });
  } catch (error) {
    res.json({ err: "Getting category fails. " + error.message });
  }
};

exports.getCategories = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    let categories = await Category.find({
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json(categories);
  } catch (error) {
    res.json({ err: "Fetching categories fails. " + error.message });
  }
};

exports.checkImageUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const publicid = req.params.publicid;

  try {
    let category = await Category.findOne({
      images: {
        $elemMatch: { public_id: publicid },
      },
      estoreid: { $ne: new ObjectId(estoreid) },
    }).exec();

    if (category) {
      res.json({ delete: false });
    } else {
      category = await Category.findOne({
        images: {
          $elemMatch: { public_id: publicid },
        },
        estoreid: new ObjectId(estoreid),
      }).exec();

      const theImage =
        category && category.images
          ? category.images.filter((img) => img.public_id === publicid)
          : [];

      if (theImage[0].length > 0 && theImage[0].fromid) {
        if (theImage[0].fromid === estoreid) {
          res.json({ delete: true });
        } else {
          res.json({ delete: false });
        }
      } else {
        res.json({ delete: true });
      }
    }
  } catch (error) {
    res.status(400).send("Checking image user failed.");
  }
};

exports.addCategory = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const platform = req.headers.platform;
  const name = req.body.name;
  const images = req.body.images;
  const slug = slugify(req.body.name.toString().toLowerCase());

  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(estoreid),
    })
      .select("categoryLimit")
      .exec();

    const categoryCount = await Category.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();

    if (categoryCount < estore.categoryLimit || platform === "cosmic") {
      const category = new Category({ name, slug, images, estoreid });
      await category.save();
      res.json(category);
    } else {
      res.json({
        err: `Sorry, you already added ${estore.categoryLimit} categories on this account. Go to Upgrades to increase your limit.`,
      });
    }
  } catch (error) {
    res.json({ err: "Adding category fails. " + error.message });
  }
};

exports.updateCategory = async (req, res) => {
  const catid = req.params.catid;
  const estoreid = req.headers.estoreid;
  const name = req.body.name;
  let values = req.body;

  if (name) {
    values = {
      ...values,
      slug: slugify(name.toString().toLowerCase()),
    };
  }

  try {
    const category = await Category.findOneAndUpdate(
      {
        _id: new ObjectId(catid),
        estoreid: new ObjectId(estoreid),
      },
      values,
      {
        new: true,
      }
    ).exec();

    const countProduct = await Product.find({
      category: new ObjectId(catid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ...category._doc, itemcount: countProduct.length });
  } catch (error) {
    res.json({ err: "Updating category fails. " + error.message });
  }
};

exports.removeCategory = async (req, res) => {
  const catid = req.params.catid;
  const estoreid = req.headers.estoreid;
  try {
    const category = await Category.findOneAndDelete({
      _id: new ObjectId(catid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json(category);
  } catch (error) {
    res.json({ err: "Deleting category fails. " + error.message });
  }
};
