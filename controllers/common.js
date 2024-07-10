const ObjectId = require("mongoose").Types.ObjectId;
const Category = require("../models/category");
const Raffle = require("../models/raffle");
const User = require("../models/user");

exports.populateProduct = async (products, estoreid) => {
  let categories = [];

  products = products.map((product) => {
    categories.push(product.category);
    return product;
  });

  const categoryList = await Category.find({
    _id: { $in: categories },
    estoreid: new ObjectId(estoreid),
  }).exec();

  products = products.map((product) => {
    return {
      ...(product._doc ? product._doc : product),
      category: categoryList.filter(
        (cat) => cat._id.toString() === product.category.toString()
      )[0],
    };
  });

  return products;
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
