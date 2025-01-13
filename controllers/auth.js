const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");

const Country = require("../models/country");
const User = require("../models/user");

exports.loginUser = async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  let tokenObj = { email };

  try {
    const user = await User.findOne({ email, password: md5(password) }).exec();
    if (user) {
      if (user && user.role === "admin" && user.emailConfirm) {
        tokenObj = {
          ...tokenObj,
          aud: "clavmall-estore",
          email_verified: true,
        };
      }
      token = jwt.sign(tokenObj, process.env.JWT_PRIVATE_KEY);
      res.json(token);
    } else {
      res.json({ err: "Invalid email or password." });
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.loginUserByMd5 = async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  let tokenObj = { email };

  try {
    const user = await User.findOne({ email, password }).exec();
    if (user) {
      if (user && user.role === "admin" && user.emailConfirm) {
        tokenObj = {
          ...tokenObj,
          aud: "clavmall-estore",
          email_verified: true,
        };
      }
      token = jwt.sign(tokenObj, process.env.JWT_PRIVATE_KEY);
      res.json(token);
    } else {
      res.json({ err: "Invalid email or password." });
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.checkEmailExist = async (req, res) => {
  const email = req.body.email;
  const slug = req.body.slug;
  const estoreid = req.headers.estoreid;
  let user = {};

  try {
    if (estoreid && slug) {
      user = await User.findOne({
        email,
        estoreid: new ObjectId(estoreid),
      }).exec();
      if (user && user._id) {
        res.json({ ok: true });
      } else {
        res.json({ err: "Email is not yet registered." });
      }
    } else {
      user = await User.findOne({ email, role: "admin" }).exec();
      if (user && user._id) {
        res.json({ ok: true });
      } else {
        res.json({ err: "Email is not yet registered." });
      }
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.getCountries = async (req, res) => {
  try {
    const countries = await Country.find().exec();
    res.json(countries);
  } catch (error) {
    res.json({ err: "Fetching countries fails. " + error.message });
  }
};
