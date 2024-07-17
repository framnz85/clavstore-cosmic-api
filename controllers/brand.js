const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");

const Brand = require("../models/brand");
const Product = require("../models/product");

exports.getBrand = async (req, res) => {
  const braid = req.params.braid;
  const estoreid = req.headers.estoreid;
  try {
    const brand = await Brand.findOne({
      _id: new ObjectId(braid),
      estoreid: new ObjectId(estoreid),
    });
    res.json(brand);
  } catch (error) {
    res.json({ err: "Getting brand fails. " + error.message });
  }
};

exports.getBrands = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    let brands = await Brand.find({
      estoreid: new ObjectId(estoreid),
    }).exec();

    let updatedBrands = [];

    for (let i = 0; i < brands.length; i++) {
      const countProduct = await Product.find({
        brand: new ObjectId(brands[i]._id),
        estoreid: new ObjectId(estoreid),
      }).exec();
      updatedBrands.push({
        ...brands[i]._doc,
        itemcount: countProduct.length,
      });
    }

    res.json(updatedBrands);
  } catch (error) {
    res.json({ err: "Fetching brands fails. " + error.message });
  }
};

exports.addBrand = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const name = req.body.name;
  const slug = slugify(req.body.name.toString().toLowerCase());

  try {
    const brand = new Brand({ name, slug, estoreid });
    await brand.save();
    res.json(brand);
  } catch (error) {
    res.json({ err: "Adding brand fails. " + error.message });
  }
};

exports.updateBrand = async (req, res) => {
  const braid = req.params.braid;
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
    const brand = await Brand.findOneAndUpdate(
      {
        _id: new ObjectId(braid),
        estoreid: new ObjectId(estoreid),
      },
      values,
      {
        new: true,
      }
    ).exec();

    const countProduct = await Product.find({
      brand: new ObjectId(braid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ...brand._doc, itemcount: countProduct.length });
  } catch (error) {
    res.json({ err: "Updating brand fails. " + error.message });
  }
};

exports.removeBrand = async (req, res) => {
  const braid = req.params.braid;
  const estoreid = req.headers.estoreid;
  try {
    const brand = await Brand.findOneAndDelete({
      _id: new ObjectId(braid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json(brand);
  } catch (error) {
    res.json({ err: "Deleting brand fails. " + error.message });
  }
};
