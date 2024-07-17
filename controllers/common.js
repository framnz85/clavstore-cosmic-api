const ObjectId = require("mongoose").Types.ObjectId;
const Category = require("../models/category");
const Brand = require("../models/brand");
const Raffle = require("../models/raffle");
const User = require("../models/user");
const Product = require("../models/product");

exports.populateProduct = async (products, estoreid) => {
  let categories = [];
  let brands = [];
  let newProducts = [];

  products = products.map((product) => {
    categories.push(product.category);
    brands.push(product.brand);
    return product;
  });

  const categoryList = await Category.find({
    _id: { $in: categories },
    estoreid: new ObjectId(estoreid),
  }).exec();

  const brandList = await Brand.find({
    _id: { $in: brands },
    estoreid: new ObjectId(estoreid),
  }).exec();

  products = products.map((product) => {
    if (product.brand) {
      return {
        ...(product._doc ? product._doc : product),
        category: categoryList.find(
          (cat) => cat._id.toString() === product.category.toString()
        ),
        brand: brandList.find(
          (bra) => bra._id.toString() === product.brand.toString()
        ),
      };
    } else {
      return {
        ...(product._doc ? product._doc : product),
        category: categoryList.find(
          (cat) => cat._id.toString() === product.category.toString()
        ),
      };
    }
  });

  for (i = 0; i < products.length; i++) {
    const variants = products[i].brand
      ? await Product.find({
          brand: new ObjectId(products[i].brand),
          estoreid: new ObjectId(estoreid),
        })
          .select("_id slug variantName")
          .exec()
      : [];
    newProducts.push({ ...products[i], variants });
  }

  return newProducts;
};

exports.createRaffle = async (
  estoreid,
  owner,
  orderid,
  raffleDate,
  raffleEntryAmount,
  amount
) => {
  const raffleInsert = { estoreid, owner, orderid, raffleDate };
  const raffleCount = Math.floor(
    parseFloat(amount) / parseFloat(raffleEntryAmount)
  );

  const raffleEntries = Array(raffleCount).fill(raffleInsert);

  Raffle.insertMany(raffleEntries);
};

exports.populateRaffle = async (entries) => {
  let owners = [];

  entries = entries.map((entry) => {
    owners.push(entry.owner);
    return entry;
  });

  const ownerList = await User.find({ _id: { $in: owners } }).exec();

  entries = entries.map((entry) => {
    return {
      ...(entry._doc ? entry._doc : entry),
      owner: ownerList.find(
        (owner) => owner._id.toString() === entry.owner.toString()
      ),
    };
  });

  return entries;
};

exports.populateEstore = async (estores) => {
  let estoreids = [];

  estores = estores.map((estore) => {
    estoreids.push(estore._id);
    return estore;
  });

  const ownerList = await User.find({
    estoreid: { $in: estoreids },
    role: "admin",
  }).exec();

  estores = estores.map((estore) => {
    return {
      ...(estore._doc ? estore._doc : estore),
      owner: ownerList.find(
        (owner) => owner.estoreid.toString() === estore._id.toString()
      ),
    };
  });

  return estores;
};
