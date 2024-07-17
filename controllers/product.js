const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");

const Product = require("../models/product");
const User = require("../models/user");
const Category = require("../models/category");
const Order = require("../models/order");
const Rating = require("../models/rating");

const { populateProduct } = require("./common");

exports.randomItems = async (req, res) => {
  const count = req.params.count;
  const estoreid = req.headers.estoreid;

  try {
    let products = await Product.aggregate([
      { $match: { activate: true, estoreid: new ObjectId(estoreid) } },
      { $sample: { size: parseInt(count) } },
    ]).exec();

    products = await populateProduct(products, estoreid);

    const countProduct = await Product.find({
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ products, count: countProduct.length });
  } catch (error) {
    res.json({ err: "Getting random product failed." + error.message });
  }
};

exports.getProductBySlug = async (req, res) => {
  const slug = req.params.slug;
  const estoreid = req.headers.estoreid;

  try {
    let product = await Product.find({
      slug,
      estoreid: new ObjectId(estoreid),
    }).exec();

    product = await populateProduct(product, estoreid);

    res.json(product);
  } catch (error) {
    res.json({ err: "Getting a single product failed." + error.message });
  }
};

exports.getProductById = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;

  try {
    let product = await Product.find({
      _id: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    product = await populateProduct(product, estoreid);

    res.json(product);
  } catch (error) {
    res.json({ err: "Getting a single product failed." + error.message });
  }
};

exports.itemsByBarcode = async (req, res) => {
  const barcode = req.params.barcode;
  const estoreid = req.headers.estoreid;
  const purpose = req.headers.purpose;

  try {
    let products = [];

    if (purpose === "read" || purpose === "inventory") {
      products = await Product.find({
        barcode,
        estoreid: new ObjectId(estoreid),
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .exec();
    } else {
      products = await Product.find({
        barcode,
      })
        .sort({ updatedAt: -1 })
        .populate("estoreid")
        .limit(5)
        .exec();
    }

    products = await populateProduct(products, estoreid);

    res.json(products);
  } catch (error) {
    res.json({ err: "Getting a product by barcode failed." + error.message });
  }
};

exports.loadInitProducts = async (req, res) => {
  const estoreidFrom = Object("613216389261e003d696cc65");
  const estoreid = new ObjectId(req.headers.estoreid);
  const count = req.params.count;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const products = await Product.find({
        estoreid: estoreidFrom,
        initial: 1,
      }).select("-_id -quantity -sold -createdAt -updatedAt -__v");

      for (let i = products.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [products[i - 1], products[j]] = [products[j], products[i - 1]];
      }

      const copyingProducts = products.slice(0, count).map((product) => {
        const images = product.images.map((img) => {
          return { ...img, fromid: estoreidFrom };
        });
        return { ...product._doc, images, estoreid };
      });
      const newProducts = await Product.insertMany(copyingProducts);

      const categoryIds = copyingProducts.map((prod) => prod.category);

      if (newProducts.length) {
        const categories = await Category.find({
          _id: { $in: categoryIds },
          estoreid: estoreidFrom,
          initial: 1,
        });

        categories.forEach(async (category) => {
          const images = category.images.map((img) => {
            return { ...img, fromid: estoreidFrom };
          });
          const newCategory = new Category({
            name: category.name,
            slug: category.slug,
            images,
            estoreid,
          });
          await newCategory.save();
          await Product.updateMany(
            { category: new ObjectId(category._id), estoreid },
            { category: new ObjectId(newCategory._id) },
            { new: true }
          );
        });
        res.json({ ok: true });
      }
    } else {
      res.json({ err: "Cannot fetch this order." });
    }
  } catch (error) {
    res.json({ err: "Getting products failed." + error.message });
  }
};

exports.getWaitingProducts = async (req, res) => {
  const estoreid = new ObjectId(req.headers.estoreid);
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const products = await Product.find({
        estoreid: new ObjectId(estoreid),
        "waiting._id": { $exists: true },
      })
        .select("waiting")
        .exec();

      res.json(products);
    } else {
      res.json({ err: "Cannot fetch the user details." });
    }
  } catch (error) {
    res.json({ err: "Getting waiting products failed." + error.message });
  }
};

exports.getAdminItems = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const {
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery,
      category,
      barcode,
      sales,
    } = req.body;

    let searchObj = searchQuery
      ? { $text: { $search: searchQuery }, estoreid: new ObjectId(estoreid) }
      : { estoreid: new ObjectId(estoreid) };

    if (category && category !== "1") {
      searchObj = {
        ...searchObj,
        category: new ObjectId(category),
      };
    }

    if (barcode) {
      searchObj = {
        ...searchObj,
        barcode: { $ne: null },
      };
    }

    let products = await Product.find(searchObj)
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    if (products.length < 1 && searchQuery) {
      products = await Product.find({
        title: { $regex: searchQuery, $options: "i" },
        estoreid: new ObjectId(estoreid),
      })
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .exec();
    }

    products = await populateProduct(products, estoreid);

    const countProduct = await Product.find(searchObj).exec();

    if (sales && sales.type && sales.type === "sales") {
      const newProdSold = [];
      for (i = 0; i < products.length; i++) {
        const result = await Order.find({
          estoreid: Object(estoreid),
          "products.product": new ObjectId(products[i]._id),
          createdAt: {
            $gte: new Date(new Date(sales.dateStart).setHours(0o0, 0o0, 0o0)),
            $lt: new Date(new Date(sales.endDate).setHours(23, 59, 59)),
          },
        })
          .select("products")
          .exec();
        if (result.length > 0) {
          let totalSold = 0;
          for (j = 0; j < result.length; j++) {
            for (k = 0; k < result[j].products.length; k++) {
              totalSold = totalSold + result[j].products[k].count;
            }
          }
          newProdSold.push({ ...products[i], sold: totalSold });
        } else {
          newProdSold.push({ ...products[i], sold: 0 });
        }
      }
      products = [...newProdSold];
    }

    res.json({ products, count: countProduct.length });
  } catch (error) {
    res.json({ err: "Listing product failed. " + error.message });
  }
};

exports.addProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const platform = req.headers.platform;
  try {
    if (platform === "cosmic") {
      const checkExist = await Product.findOne({
        slug: slugify(req.body.title.toString().toLowerCase()),
        estoreid: new ObjectId(estoreid),
      });
      if (checkExist) {
        res.json({
          err: "Sorry, this product is already existing. Choose another tittle for the product.",
        });
      } else {
        let product = new Product({
          ...req.body,
          slug: slugify(req.body.title.toString().toLowerCase()),
          estoreid: new ObjectId(estoreid),
        });
        await product.save();
        product = await populateProduct([product], estoreid);
        res.json(product[0]);
      }
    } else {
      res.json({
        err: `Sorry, your account is not a valid account.`,
      });
    }
  } catch (error) {
    res.json({ err: "Adding product failed. " + error.message });
  }
};

exports.searchProduct = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const text = req.body.text;
  const catSlug = req.body.catSlug;
  const price = req.body.price;
  let querySearch = {};
  let noResultSearch = {};
  let products = [];

  if (text) {
    querySearch = { ...querySearch, $text: { $search: text } };
  }

  if (catSlug && catSlug !== "all") {
    const category = await Category.findOne({
      slug: catSlug,
      estoreid: new ObjectId(estoreid),
    });
    if (category) {
      querySearch = { ...querySearch, category: new ObjectId(category._id) };
      noResultSearch = {
        ...noResultSearch,
        category: new ObjectId(category._id),
      };
    }
  }

  if (price) {
    querySearch = { ...querySearch, price: { $gt: price[0], $lt: price[1] } };
    noResultSearch = {
      ...noResultSearch,
      price: { $gt: price[0], $lt: price[1] },
    };
  }
  try {
    if (Object.keys(querySearch).length) {
      products = await Product.find({
        ...querySearch,
        estoreid: new ObjectId(estoreid),
      })
        .limit(30)
        .exec();

      if (products.length < 31 && text) {
        products = await Product.find({
          title: { $regex: text, $options: "i" },
          estoreid: new ObjectId(estoreid),
          ...noResultSearch,
        }).exec();
      }

      products = await populateProduct(products, estoreid);
    } else {
      products = await Product.find({
        estoreid: new ObjectId(estoreid),
      })
        .limit(30)
        .exec();
    }
    res.json(products);
  } catch (error) {
    res.json({ err: "Searching products failed. " + error.message });
  }
};

exports.submitRating = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const prodid = req.body.prodid;
  const rate = req.body.rate;
  const rateDefault = req.body.rateDefault;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    const checkRatingExist = await Rating.findOne({
      userid: new ObjectId(user._id),
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    if (checkRatingExist) {
      await Rating.findOneAndUpdate(
        {
          userid: new ObjectId(user._id),
          prodid: new ObjectId(prodid),
          estoreid: new ObjectId(estoreid),
        },
        { rate },
        { new: true }
      );
    } else {
      const newRating = new Rating({
        userid: new ObjectId(user._id),
        prodid: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
        rate,
      });
      await newRating.save();
    }
    console.log(prodid);
    const ratings = await Rating.find({
      prodid: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();

    const finalRatings =
      ratings.reduce((partialSum, a) => partialSum + a.rate, 0) +
      parseFloat(rateDefault.ratings);
    const finalRatingCount =
      parseFloat(ratings.length) + parseFloat(rateDefault.ratingCount);
    const finalRating = finalRatings / finalRatingCount;

    await Product.findOneAndUpdate(
      {
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      },
      {
        rateGroup: {
          ratings: finalRating,
          ratingCount: finalRatingCount,
          rateDefault,
        },
      },
      { new: true }
    );

    res.json({ ratings: finalRating, ratingCount: finalRatingCount });
  } catch (error) {
    res.json({ err: "Updating product failed. " + error.message });
  }
};

exports.updateProduct = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;
  let values = req.body;
  const title = req.body.title;

  if (title) {
    values = {
      ...values,
      slug: slugify(title.toString().toLowerCase()),
    };
  }

  try {
    let product = await Product.findOneAndUpdate(
      {
        _id: new ObjectId(prodid),
        estoreid: new ObjectId(estoreid),
      },
      values,
      { new: true }
    );

    product = await populateProduct([product], estoreid);

    res.json(product[0]);
  } catch (error) {
    res.json({ err: "Updating product failed. " + error.message });
  }
};

exports.receiveProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const products = req.body;

  try {
    for (let i = 0; i < products.length; i++) {
      if (products[i].supplierPrice === products[i].newSupplierPrice) {
        await Product.findOneAndUpdate(
          {
            _id: new ObjectId(products[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          { $inc: { quantity: products[i].newQuantity } },
          { new: true }
        );
      } else {
        await Product.findOneAndUpdate(
          {
            _id: new ObjectId(products[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          { waiting: products[i] },
          { new: true }
        );
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
  }
};

exports.updateProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const products = req.body.products;
    for (let i = 0; i < products.length; i++) {
      await Product.findOneAndUpdate(
        {
          _id: new ObjectId(products[i]._id),
          estoreid: new ObjectId(estoreid),
        },
        products[i],
        { new: true }
      );
    }
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  const prodid = req.params.prodid;
  const estoreid = req.headers.estoreid;
  try {
    let product = await Product.findOneAndDelete({
      _id: new ObjectId(prodid),
      estoreid: new ObjectId(estoreid),
    }).exec();
    if (product) {
      product = await populateProduct([product], estoreid);
      res.json(product[0]);
    } else {
      res.json({ err: "Product does not exist in the system." });
    }
  } catch (error) {
    res.json({ err: "Deleting product failed. " + error.message });
  }
};

exports.checkImageUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const publicid = req.params.publicid;
  const defaultestore = req.params.defaultestore;

  try {
    let product = await Product.findOne({
      images: {
        $elemMatch: { public_id: publicid },
      },
      estoreid: new ObjectId(defaultestore),
    }).exec();

    if (product) {
      if (estoreid === defaultestore) {
        res.json({ delete: true });
      } else {
        res.json({ delete: false });
      }
    } else {
      product = await Product.findOne({
        images: {
          $elemMatch: { public_id: publicid },
        },
        estoreid: new ObjectId(estoreid),
      }).exec();

      if (product && product.images[0] && product.images[0].fromid) {
        if (product.images[0].fromid === estoreid) {
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
