const ObjectId = require("mongoose").Types.ObjectId;

const Category = require("../../models/category");
const Product = require("../../models/product");
const Order = require("../../models/order");
const User = require("../../models/user");

exports.getAllCounts = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const categories = await Category.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();
    const products = await Product.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();
    const orders = await Order.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();
    const users = await User.countDocuments({
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ categories, products, orders, users });
  } catch (error) {
    res.json({ err: "Getting all counts failed." + error.message });
  }
};

exports.getProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const page = req.body.page;
  const limit = req.body.limit;

  try {
    const products = await Product.find({
      estoreid: new ObjectId(estoreid),
    })
      .skip(page * limit)
      .limit(limit)
      .exec();

    res.json(products);
  } catch (error) {
    res.json({ err: "Getting all products failed." + error.message });
  }
};

exports.updateProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const prodid = req.body.prodid;
  const count = req.body.quantity;
  let product = {};

  try {
    product = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      },
      { $inc: { quantity: -count, sold: count } },
      { new: true }
    );

    if (product.quantity <= 0) {
      const newQuantity =
        product && product.waiting && product.waiting.newQuantity
          ? product.waiting.newQuantity
          : 0;

      const newSupplierPrice =
        product && product.waiting && product.waiting.newSupplierPrice
          ? product.waiting.newSupplierPrice
          : product.supplierPrice;

      const newPrice =
        newSupplierPrice + (newSupplierPrice * product.markup) / 100;

      product = await Product.findOneAndUpdate(
        {
          _id: new ObjectId(prodid),
          estoreid: Object(estoreid),
        },
        {
          quantity: newQuantity,
          supplierPrice: newSupplierPrice,
          price: newPrice,
          waiting: {},
        },
        { new: true }
      );
    }

    res.json(product);
  } catch (error) {
    res.json({ err: "Updating a product details failed." + error.message });
  }
};
