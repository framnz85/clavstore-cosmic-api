const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");

const Country = require("../models/country");
const User = require("../models/user");

const { redisClient } = require("../config/redis");

exports.getUserByEmail = async (email, estoreid) => {
  try {
    const cacheKey = `users:${estoreid}`;
    const cachedData = await redisClient.get(cacheKey);
    const parsedData = cachedData ? JSON.parse(cachedData) : [];

    if (cachedData) {
      const cachedUser = parsedData.find((u) => u.email === email);
      if (cachedUser) {
        return cachedUser;
      }
    }

    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    })
      .lean()
      .exec();

    if (user) {
      await redisClient.set(cacheKey, JSON.stringify(parsedData.concat(user)), {
        EX: 259200,
      });
    }

    return user;
  } catch (error) {
    throw new Error("Fetching user information fails. " + error.message);
  }
};

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
  const cacheKey = "countries:all";

  try {
    const cachedCountries = await redisClient.get(cacheKey);

    if (cachedCountries) {
      return res.json(JSON.parse(cachedCountries));
    }

    const countries = await Country.find({}).lean().exec();

    await redisClient.set(cacheKey, JSON.stringify(countries), {
      EX: 604800,
    });

    return res.json(countries);
  } catch (error) {
    return res.json({
      err: "Getting countries failed. " + error.message,
    });
  }
};
