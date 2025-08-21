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
    const countProduct = await Product.countDocuments({
      brand: new ObjectId(brand._id),
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json({
      ...brand._doc,
      itemcount: countProduct,
    });
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

    res.json(brands);
  } catch (error) {
    res.json({ err: "Fetching brands fails. " + error.message });
  }
};

exports.checkImageUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const publicid = req.params.publicid;

  try {
    let brand = await Brand.findOne({
      images: {
        $elemMatch: { public_id: publicid },
      },
      estoreid: { $ne: new ObjectId(estoreid) },
    }).exec();

    if (brand) {
      res.json({ delete: false });
    } else {
      brand = await Brand.findOne({
        images: {
          $elemMatch: { public_id: publicid },
        },
        estoreid: new ObjectId(estoreid),
      }).exec();

      const theImage =
        brand && brand.images
          ? brand.images.filter((img) => img.public_id === publicid)
          : [];

      if (
        theImage &&
        theImage.length > 0 &&
        theImage[0] &&
        theImage[0].fromid
      ) {
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

exports.addBrand = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const name = req.body.name;
  const images = req.body.images;
  const slug = slugify(req.body.name.toString().toLowerCase());

  try {
    const brand = new Brand({ name, slug, images, estoreid });
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

exports.importBrands = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const brands = req.body.brands;
    for (let i = 0; i < brands.length; i++) {
      if (brands[i]._id && ObjectId.isValid(brands[i]._id)) {
        await Brand.findOneAndUpdate(
          {
            _id: new ObjectId(brands[i]._id),
            estoreid: new ObjectId(estoreid),
          },
          brands[i],
          { new: true }
        );
      } else {
        const checkExist = await Brand.findOne({
          slug: slugify(brands[i].name.toString().toLowerCase()),
          estoreid: new ObjectId(estoreid),
        });
        if (checkExist) {
          await Brand.findOneAndUpdate(
            {
              slug: slugify(brands[i].name.toString().toLowerCase()),
              estoreid: new ObjectId(estoreid),
            },
            brands[i],
            { new: true }
          );
        } else {
          const brand = new Brand({
            ...brands[i],
            slug: slugify(brands[i].name.toString().toLowerCase()),
            estoreid: new ObjectId(estoreid),
          });
          await brand.save();
        }
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Importing brands failed. " + error.message });
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
