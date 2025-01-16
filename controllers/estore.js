const ObjectId = require("mongoose").Types.ObjectId;
const slugify = require("slugify");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const Estore = require("../models/estore");
const Package = require("../models/package");
const User = require("../models/user");
const Payment = require("../models/payment");
const Product = require("../models/product");
const Category = require("../models/category");
const Brand = require("../models/brand");
const Cart = require("../models/cart");
const Order = require("../models/order");
const Raffle = require("../models/raffle");
const Rating = require("../models/rating");

const MyCountry = require("../models/myCountry");
const MyAddiv1 = require("../models/myAddiv1");
const MyAddiv2 = require("../models/myAddiv2");
const MyAddiv3 = require("../models/myAddiv3");

const { populateEstore } = require("./common");

exports.getEstore = async (req, res) => {
  const resellid = req.headers.resellid;
  try {
    const estore = await Estore.findOne({
      slug: req.params.slug,
      resellid: new ObjectId(resellid),
    })
      .populate("country")
      .exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getDefaultEstore = async (req, res) => {
  const resellid = req.headers.resellid;
  try {
    const defaultEstore = await Estore.findOne({
      defaultEstore: true,
      resellid: new ObjectId(resellid),
    })
      .populate("country")
      .exec();
    if (defaultEstore) {
      res.json(defaultEstore);
    } else {
      res.json({ err: "Sorry, no default store found for this website." });
    }
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getReseller = async (req, res) => {
  try {
    const estore = await Estore.findOne({ _id: new ObjectId(req.params.id) })
      .populate("country")
      .exec();
    if (estore && estore.reseller) {
      const payments = await Payment.find({
        estoreid: new ObjectId(req.params.id),
      });
      res.json({
        reseller: estore.reseller,
        currency: estore.country.currency,
        estoreChange: estore.estoreChange,
        resellid: estore.resellid,
        payments,
      });
    } else {
      res.json({ err: "The website is temporarily offline." });
    }
  } catch (error) {
    res.json({ err: "Fetching reseller information fails. " + error.message });
  }
};

exports.getPackage = async (req, res) => {
  try {
    const package = await Package.findOne({
      defaultPackage: "basic",
      default: true,
    }).exec();
    if (package) {
      const estore = await Estore.findOne({
        _id: new ObjectId(req.params.id),
      })
        .populate("country")
        .exec();
      const payments = await Payment.find({
        estoreid: new ObjectId(req.params.id),
      }).exec();
      res.json({
        ...package._doc,
        currency: estore.country.currency,
        payments,
      });
    }
  } catch (error) {
    res.json({ err: "Fetching reseller information fails. " + error.message });
  }
};

exports.getPackages = async (req, res) => {
  try {
    const packages = await Package.find({
      defaultPackage: req.params.packDefault,
    }).exec();
    res.json(packages);
  } catch (error) {
    res.json({ err: "Getting packages fails. " + error.message });
  }
};

exports.getDedicatedEstores = async (req, res) => {
  try {
    let estores = await Estore.find({
      status: "active",
      $or: [
        { upgradeType: "2" },
        { upStatus2: "Active" },
        { showInApp: true, showInList: true },
      ],
    }).exec();

    estores = await populateEstore(estores);

    res.json(estores);
  } catch (error) {
    res.json({ err: "Fetching dedicated stores fails. " + error.message });
  }
};

exports.getEstoreCounters = async (req, res) => {
  try {
    const estore = await Estore.findOne({
      _id: new ObjectId(req.params.estoreid),
    })
      .populate("country")
      .select(
        "estoreChange userChange productChange categoryChange paymentChange orderChange locationChange"
      )
      .exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.getAllowedEstores = async (req, res) => {
  const { sortkey, sort, currentPage, pageSize } = req.body;

  try {
    let estores = await Estore.find({
      status: "active",
      $or: [
        { upgradeType: "2" },
        { upStatus2: "Active" },
        { showInApp: true, showInList: true },
      ],
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    estores = await populateEstore(estores);

    res.json(estores);
  } catch (error) {
    res.json({ err: "Fetching dedicated stores fails. " + error.message });
  }
};

exports.searchEstoreByText = async (req, res) => {
  const resellid = req.headers.resellid;
  const searchText = req.body.searchText;

  try {
    if (ObjectId.isValid(searchText)) {
      const estore = await Estore.find({
        _id: new ObjectId(searchText),
        status: "active",
        resellid: new ObjectId(resellid),
        $or: [
          { upgradeType: "2" },
          { upStatus2: "Active" },
          { showInApp: true },
        ],
      })
        .populate("country")
        .exec();
      res.json(estore);
    } else {
      const estore = await Estore.find({
        $text: { $search: searchText },
        status: "active",
        resellid: new ObjectId(resellid),
        $or: [
          { upgradeType: "2" },
          { upStatus2: "Active" },
          { showInApp: true },
        ],
      })
        .populate("country")
        .exec();
      res.json(estore);
    }
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.updateEstore = async (req, res) => {
  const estoreid = req.headers.estoreid;
  let values = req.body;
  const name = req.body.name;

  if (name) {
    values = {
      ...values,
      slug: slugify(name.toString().toLowerCase()),
    };
  }

  try {
    const estore = await Estore.findByIdAndUpdate(estoreid, values, {
      new: true,
    })
      .populate("country")
      .exec();
    if (!estore) {
      res.json({ err: "No eStore exist under ID: " + estoreid });
      return;
    }
    res.json(estore);
  } catch (error) {
    res.json({ err: "Fetching store information fails. " + error.message });
  }
};

exports.createEstore = async (req, res) => {
  const resellid = req.params.resellid;
  const refid = req.body.refid;
  const reseller = req.body.reseller;
  try {
    const checkStoreExist = await Estore.findOne({
      slug: slugify(req.body.name.toString().toLowerCase()),
    });
    if (!checkStoreExist) {
      const checkEmailExist = await Estore.findOne({
        email: req.body.email,
      });
      if (!checkEmailExist) {
        const estore = new Estore(
          reseller && reseller.type
            ? {
                name: req.body.name,
                email: req.body.email,
                slug: slugify(req.body.name.toString().toLowerCase()),
                country: new ObjectId(req.body.country),
                resellid: new ObjectId(resellid),
                reseller,
                upgradeType: "1",
                upStatus: "Pending",
              }
            : {
                name: req.body.name,
                email: req.body.email,
                slug: slugify(req.body.name.toString().toLowerCase()),
                country: new ObjectId(req.body.country),
                resellid: new ObjectId(resellid),
                upgradeType: "1",
                upStatus: "Pending",
              }
        );
        await estore.save();

        if (refid) {
          const user = await User.findOne({
            _id: new ObjectId(refid),
            role: "admin",
          }).exec();

          await Estore.findOneAndUpdate(
            { _id: user.estoreid },
            {
              $inc: {
                productLimit: 10,
                categoryLimit: 1,
                userLimit: 5,
                invites: 1,
              },
            }
          );
        }

        res.json(estore);
      } else if (checkEmailExist && reseller && reseller.resellerType) {
        if (checkEmailExist.reseller && checkEmailExist.reseller.status) {
          res.json({
            note: `Your email ${req.body.email} is already has an active reseller account. Login Now!`,
          });
        } else {
          await Estore.findOneAndUpdate(
            { _id: checkEmailExist._id },
            {
              reseller:
                checkEmailExist.reseller && checkEmailExist.reseller.status
                  ? {
                      ...checkEmailExist.reseller,
                      resellerType: reseller.resellerType,
                    }
                  : { resellerType: reseller.resellerType },
            }
          );
          res.json(checkEmailExist);
        }
      } else {
        res.json({
          err: `Store with an email ${req.body.email} is already existing. Please choose another Email Address.`,
        });
      }
    } else {
      res.json({
        err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
      });
    }
  } catch (error) {
    res.json({ err: "Creating store fails. " + error.message });
  }
};

exports.addNewEstore = async (req, res) => {
  const resellid = req.params.resellid;
  const email = req.user.email;
  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const checkStoreExist = await Estore.findOne({
        slug: slugify(req.body.name.toString().toLowerCase()),
      });
      if (!checkStoreExist) {
        const estore = new Estore({
          name: req.body.name,
          email: user.email,
          slug: slugify(req.body.name.toString().toLowerCase()),
          country: new ObjectId(req.body.country),
          resellid: new ObjectId(resellid),
          upgradeType: "2",
          upStatus: "Active",
          upStatus2: "Active",
        });
        await estore.save();

        res.json(estore);
      } else {
        res.json({
          err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
        });
      }
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    res.json({ err: "Creating store fails. " + error.message });
  }
};

exports.copyingEstore = async (req, res) => {
  const resellid = req.params.resellid;
  const fromid = req.body.fromid;
  const email = req.user.email;
  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const checkStoreExist = await Estore.findOne({
        slug: slugify(req.body.name.toString().toLowerCase()),
      });
      if (!checkStoreExist) {
        const estore = new Estore({
          name: req.body.name,
          email: user.email,
          slug: slugify(req.body.name.toString().toLowerCase()),
          country: new ObjectId(req.body.country),
          resellid: new ObjectId(resellid),
          upgradeType: "2",
          upStatus: "Active",
          upStatus2: "Active",
        });
        await estore.save();

        const products = await Product.find({
          estoreid: new ObjectId(fromid),
        }).select(
          "-_id -discounttype -quantity -sold -createdAt -updatedAt -__v"
        );

        const copyingProducts = products.map((product) => {
          const images = product.images.map((img) => {
            return {
              ...img,
              fromid: img.fromid ? img.fromid : new ObjectId(fromid),
            };
          });
          return { ...product._doc, images, estoreid: estore._id };
        });
        const newProducts = await Product.insertMany(copyingProducts);

        const categoryIds = copyingProducts.map((prod) => prod.category);
        const brandIds = copyingProducts.map((prod) => prod.brand);

        if (newProducts.length) {
          const categories = await Category.find({
            _id: { $in: categoryIds },
            estoreid: new ObjectId(fromid),
          });

          categories.forEach(async (category) => {
            const images = category.images.map((img) => {
              return {
                ...img,
                fromid: img.fromid ? img.fromid : new ObjectId(fromid),
              };
            });
            const newCategory = new Category({
              name: category.name,
              slug: category.slug,
              images,
              estoreid: estore._id,
            });
            await newCategory.save();
            await Product.updateMany(
              { category: new ObjectId(category._id), estoreid: estore._id },
              { category: new ObjectId(newCategory._id) },
              { new: true }
            );
          });

          const brands = await Brand.find({
            _id: { $in: brandIds },
            estoreid: new ObjectId(fromid),
          });

          brands.forEach(async (brand) => {
            const newBrand = new Brand({
              name: brand.name,
              slug: brand.slug,
              estoreid: estore._id,
            });
            await newBrand.save();
            await Product.updateMany(
              { brand: new ObjectId(brand._id), estoreid: estore._id },
              { brand: new ObjectId(newBrand._id) },
              { new: true }
            );
          });

          res.json({ ok: true });
        }
      } else {
        res.json({
          err: `Store or App with a name ${req.body.name} is already existing. Please choose another Store Name.`,
        });
      }
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    res.json({ err: "Creating store fails. " + error.message });
  }
};

exports.updateEstoreCounters = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderChange = req.body.orderChange;
  const paymentChange = req.body.paymentChange;
  const categoryChange = req.body.categoryChange;
  const productChange = req.body.productChange;
  const userChange = req.body.userChange;
  const estoreChange = req.body.estoreChange;

  try {
    const estore = await Estore.findByIdAndUpdate(
      estoreid,
      {
        orderChange,
        paymentChange,
        categoryChange,
        productChange,
        userChange,
        estoreChange,
      },
      {
        new: true,
      }
    ).exec();
    res.json(estore);
  } catch (error) {
    res.json({ err: "Updating estore counters fails. " + error.message });
  }
};

exports.updateEstoresDefault = async (req, res) => {
  const estoreid = req.body.estoreid;

  try {
    await Estore.updateMany({}, { $set: { defaultEstore: false } }).exec();
    await Estore.findByIdAndUpdate(
      estoreid,
      {
        defaultEstore: true,
      },
      {
        new: true,
      }
    ).exec();
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating estore default fails. " + error.message });
  }
};

exports.deletingEstore = async (req, res) => {
  const deleteid = req.params.deleteid;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      await Estore.findOneAndDelete({
        _id: new ObjectId(deleteid),
      }).exec();

      await Brand.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Cart.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Category.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Order.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Payment.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Product.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Raffle.deleteMany({ estoreid: new ObjectId(deleteid) });
      await Rating.deleteMany({ estoreid: new ObjectId(deleteid) });
      await User.deleteMany({
        estoreid: new ObjectId(deleteid),
        role: { $ne: "admin" },
      });

      const oldEstore = await Estore.findOne().exec();
      await User.updateMany(
        {
          estoreid: new ObjectId(deleteid),
          role: "admin",
        },
        { $set: { estoreid: new ObjectId(oldEstore._id) } }
      ).exec();

      await MyCountry.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv1.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv2.deleteMany({ estoreid: new ObjectId(deleteid) });
      await MyAddiv3.deleteMany({ estoreid: new ObjectId(deleteid) });

      const newEstore = await Estore.findOne({}).exec();

      await User.findByIdAndUpdate(user._id, {
        estoreid: newEstore._id,
      }).exec();

      res.json({ ok: true });
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    res.json({ err: "Deleting an estore failed. " + error.message });
  }
};
