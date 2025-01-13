const ObjectId = require("mongoose").Types.ObjectId;
const Category = require("../models/category");
const Brand = require("../models/brand");
const Raffle = require("../models/raffle");
const User = require("../models/user");
const Product = require("../models/product");
const Estore = require("../models/estore");
const MyAddiv3 = require("../models/myAddiv3");

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
          (cat) =>
            cat._id &&
            product.category &&
            cat._id.toString() === product.category.toString()
        ),
        brand: brandList.find(
          (bra) =>
            bra._id &&
            product.brand &&
            bra._id.toString() === product.brand.toString()
        ),
      };
    } else {
      return {
        ...(product._doc ? product._doc : product),
        category: categoryList.find(
          (cat) =>
            cat._id &&
            product.category &&
            cat._id.toString() === product.category.toString()
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

exports.createRaffle = async (estoreid, user, order) => {
  const estore = await Estore.findOne({
    _id: new ObjectId(estoreid),
  }).exec();

  const date1 = new Date(estore.raffleDate);
  const date2 = new Date();
  const timeDifference = date1.getTime() - date2.getTime();
  const daysDifference = Math.round(timeDifference / (1000 * 3600 * 24));

  if (
    user.role === "customer" &&
    estore.raffleActivation &&
    daysDifference > 0
  ) {
    const raffleInsert = {
      estoreid,
      userid: user._id,
      orderid: order._id,
      raffleDate: estore.raffleDate,
    };
    const raffleCount = Math.floor(
      parseFloat(order.cartTotal) / parseFloat(estore.raffleEntryAmount)
    );

    const raffleEntries = Array(raffleCount).fill(raffleInsert);

    Raffle.insertMany(raffleEntries);
  }
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
        (owner) =>
          owner._id &&
          entry.owner &&
          owner._id.toString() === entry.owner.toString()
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
        (owner) =>
          estore._id &&
          owner.estoreid &&
          owner.estoreid.toString() === estore._id.toString()
      ),
    };
  });

  return estores;
};

exports.checkOrderedProd = async (products, estoreid) => {
  let errorProduct = {};
  for (i = 0; i < products.length; i++) {
    let finalMarkup = 0;
    let finalDiscount = 0;
    const checkProduct = await Product.findOne({
      _id: new ObjectId(products[i].product),
      estoreid: Object(estoreid),
    });
    if (!products[i].excess && checkProduct) {
      if (
        parseFloat(products[i].count) > parseFloat(checkProduct.quantity) &&
        !checkProduct.segregate
      ) {
        errorProduct = checkProduct;
      }
    }
    const newQuantity =
      checkProduct && checkProduct.waiting && checkProduct.waiting.newQuantity
        ? checkProduct.waiting.newQuantity
        : 0;

    const newSupplierPrice =
      checkProduct &&
      checkProduct.waiting &&
      checkProduct.waiting.newSupplierPrice
        ? checkProduct.waiting.newSupplierPrice
        : checkProduct.supplierPrice;

    if (parseFloat(checkProduct.markup) > 0) {
      if (checkProduct.markupType === "percent") {
        finalMarkup =
          (parseFloat(checkProduct.markup) * parseFloat(newSupplierPrice)) /
          100;
      } else {
        finalMarkup = parseFloat(checkProduct.markup);
      }
    }

    if (parseFloat(checkProduct.discount) > 0) {
      if (checkProduct.discounttype === "percent") {
        finalDiscount =
          (parseFloat(checkProduct.discount) * parseFloat(newSupplierPrice)) /
          100;
      } else {
        finalDiscount = parseFloat(checkProduct.discount);
      }
    }

    const newPrice = newSupplierPrice + finalMarkup - finalDiscount;

    if (
      products[i].excess &&
      !checkProduct.segregate &&
      newQuantity < products[i].count
    ) {
      errorProduct = {
        ...checkProduct._doc,
        price: newPrice,
        quantity: newQuantity,
      };
    }
  }
  if (errorProduct && errorProduct._id) {
    return {
      err: `Sorry, the remaining quantity for ${errorProduct.title} priced @ ${errorProduct.price} is now only ${errorProduct.quantity}`,
    };
  }
};

const handleUpdateProd = async (product, estoreid, updateType) => {
  const checkProduct = await Product.findOne({
    _id: new ObjectId(product.product),
    estoreid: Object(estoreid),
  });
  if (checkProduct) {
    let finalQty = 0;
    let finalSold = 0;
    let finalMarkup = 0;
    let finalDiscount = 0;

    if (updateType) {
      finalQty = parseFloat(checkProduct.quantity) - parseFloat(product.count);
      finalSold = parseFloat(checkProduct.sold) + parseFloat(product.count);
    } else {
      finalQty = parseFloat(checkProduct.quantity) + parseFloat(product.count);
      finalSold = parseFloat(checkProduct.sold) - parseFloat(product.count);
    }

    const result = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(product.product),
        estoreid: Object(estoreid),
      },
      {
        quantity: parseFloat(finalQty) > 0 ? parseFloat(finalQty) : 0,
        sold: parseFloat(finalSold) > 0 ? parseFloat(finalSold) : 0,
      },
      { new: true }
    );

    if (
      updateType &&
      result &&
      result.waiting &&
      result.waiting.newQuantity &&
      result.quantity <= 0
    ) {
      let newQuantity =
        result && result.waiting && result.waiting.newQuantity
          ? parseFloat(result.waiting.newQuantity)
          : 0;

      if (product.excess) {
        newQuantity = parseFloat(newQuantity) - parseFloat(product.count);
      }

      const newSupplierPrice =
        result && result.waiting && result.waiting.newSupplierPrice
          ? parseFloat(result.waiting.newSupplierPrice)
          : parseFloat(result.supplierPrice);

      if (parseFloat(checkProduct.markup) > 0) {
        if (checkProduct.markupType === "percent") {
          finalMarkup =
            (parseFloat(checkProduct.markup) * parseFloat(newSupplierPrice)) /
            100;
        } else {
          finalMarkup = parseFloat(checkProduct.markup);
        }
      }

      if (parseFloat(checkProduct.discount) > 0) {
        if (checkProduct.discounttype === "percent") {
          finalDiscount =
            (parseFloat(checkProduct.discount) * parseFloat(newSupplierPrice)) /
            100;
        } else {
          finalDiscount = parseFloat(checkProduct.discount);
        }
      }

      const newPrice = newSupplierPrice + finalMarkup - finalDiscount;

      await Product.findOneAndUpdate(
        {
          _id: new ObjectId(product.product),
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
  }
};

exports.updateOrderedProd = async (products, estoreid, updateType) => {
  let remainingProds = products;
  const listOfExcess = products.filter((prod) => prod.excess);

  if (updateType) {
    for (i = 0; i < listOfExcess.length; i++) {
      let mainExcess = products.filter(
        (prod) =>
          prod.product.toString() === listOfExcess[i].product.toString() &&
          prod._id.toString() !== listOfExcess[i]._id.toString()
      );
      if (mainExcess[0] && mainExcess[0]._id) {
        await handleUpdateProd(mainExcess[0], estoreid, updateType);
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== mainExcess[0]._id.toString()
        );
        await handleUpdateProd(listOfExcess[i], estoreid, updateType);
        remainingProds = remainingProds.filter(
          (prod) => prod._id.toString() !== listOfExcess[i]._id.toString()
        );
      }
    }
  }

  for (i = 0; i < remainingProds.length; i++) {
    await handleUpdateProd(remainingProds[i], estoreid, updateType);
  }
};

exports.populateWishlist = async (wishlist, estoreid) => {
  let prodId = [];
  wishlist.map((wish) => {
    prodId.push(wish);
  });

  const result = await Product.find({
    _id: { $in: prodId },
    estoreid: new ObjectId(estoreid),
  }).exec();

  return result;
};

exports.populateAddress = async (addiv3, estoreid) => {
  const result = await MyAddiv3.findOne({
    _id: new ObjectId(addiv3._id),
    estoreid: new ObjectId(estoreid),
  }).exec();
  if (result) {
    return result;
  } else {
    return addiv3;
  }
};
