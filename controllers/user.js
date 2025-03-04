const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const User = require("../models/user");
const Estore = require("../models/estore");
const Raffle = require("../models/raffle");
const Notification = require("../models/notification");
const Salesnotify = require("../models/salesnotify");

const {
  populateRaffle,
  populateWishlist,
  populateAddress,
} = require("./common");

exports.getUserDetails = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;
  const resellid = req.params.resellid;
  const resellslug = req.headers.resellslug;
  let wishlist = [];
  let addiv3 = {};

  try {
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
      resellid: new ObjectId(resellid),
    })
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass -verifyCode")
      .exec();
    if (user) {
      if (user.wishlist && user.wishlist.length > 0) {
        wishlist = await populateWishlist(user.wishlist, estoreid);
      }
      if (user.address && user.address.addiv3 && user.address.addiv3._id) {
        addiv3 = await populateAddress(user.address.addiv3, estoreid);
        res.json({
          ...user._doc,
          wishlist,
          address: { ...user.address, addiv3 },
        });
      } else {
        res.json({ ...user._doc, wishlist });
      }
    } else if (resellslug !== "branch") {
      let userWithReseller = await User.findOne({
        email,
        resellid: new ObjectId(resellid),
      })
        .populate({
          path: "estoreid",
          populate: {
            path: "country",
          },
        })
        .select("-password -showPass -verifyCode")
        .exec();

      if (
        userWithReseller &&
        !userWithReseller.estoreid &&
        process.env.ESTORE_TYPE === "dedicated"
      ) {
        const oldEstore = await Estore.findOne({
          _id: new ObjectId(resellid),
        }).exec();
        await User.updateOne(
          {
            email,
          },
          { $set: { estoreid: oldEstore._id } }
        ).exec();
        userWithReseller = { ...userWithReseller, estoreid: oldEstore };
      }

      if (userWithReseller) {
        if (userWithReseller.wishlist && userWithReseller.wishlist.length > 0) {
          wishlist = await populateWishlist(
            userWithReseller.wishlist,
            estoreid
          );
        }
        if (
          userWithReseller.address &&
          userWithReseller.address.addiv3 &&
          userWithReseller.address.addiv3._id
        ) {
          addiv3 = await populateAddress(
            userWithReseller.address.addiv3,
            estoreid
          );
          res.json({
            ...userWithReseller._doc,
            wishlist,
            address: { ...userWithReseller.address, addiv3 },
          });
        } else {
          res.json({ ...userWithReseller._doc, wishlist });
        }
      } else {
        const userWithEmail = await User.findOne({
          email,
          estoreid: new ObjectId(estoreid),
        })
          .populate({
            path: "estoreid",
            populate: {
              path: "country",
            },
          })
          .select("-password -showPass -verifyCode")
          .exec();
        if (userWithEmail) {
          if (userWithEmail.wishlist && userWithEmail.wishlist.length > 0) {
            wishlist = await populateWishlist(userWithEmail.wishlist, estoreid);
          }
          if (
            userWithEmail.address &&
            userWithEmail.address.addiv3 &&
            userWithEmail.address.addiv3._id
          ) {
            addiv3 = await populateAddress(
              userWithEmail.address.addiv3,
              estoreid
            );
            res.json({
              ...userWithEmail._doc,
              wishlist,
              address: { ...userWithEmail.address, addiv3 },
            });
          } else {
            res.json({ ...userWithEmail._doc, wishlist });
          }
        } else {
          res.json({
            err: "The email doesn't exist in this store.",
          });
        }
      }
    } else {
      res.json({ err: "User is not found on this site" });
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.getRaffleEntries = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();
    const raffles = await Raffle.find({
      owner: user._id,
      estoreid: new ObjectId(estoreid),
    })
      .populate("orderid")
      .exec();
    res.json(raffles);
  } catch (error) {
    res.json({ err: "Fetching raffle entries fails. " + error.message });
  }
};

exports.getTopEntries = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const count = req.params.count;

  try {
    let entries = await Raffle.aggregate([
      { $match: { estoreid: new ObjectId(estoreid) } },
      { $sample: { size: parseInt(count) } },
    ]).exec();
    entries = await populateRaffle(entries);
    res.json(entries);
  } catch (error) {
    res.json({ err: "Fetching top raffle entries fails. " + error.message });
  }
};

exports.getNotification = async (req, res) => {
  const day = req.params.day;

  try {
    const notify = await Notification.find({ day: { $lte: day - 1 } })
      .limit(2)
      .sort({ day: -1 })
      .exec();
    const sales = await Salesnotify.find({ day: { $lte: day - 1 } })
      .limit(2)
      .sort({ day: -1 })
      .exec();
    res.json([...notify, ...sales]);
  } catch (error) {
    res.json({ err: "Fetching notifications fails. " + error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;

    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    });

    let searchObj = searchQuery
      ? { $text: { $search: searchQuery }, estoreid: new ObjectId(estoreid) }
      : { estoreid: new ObjectId(estoreid) };

    const admins =
      checkUser && checkUser.superAdmin
        ? await User.find({
            role: "admin",
          }).exec()
        : await User.find({
            estoreid: new ObjectId(estoreid),
            role: "admin",
          }).exec();
    const moderators = await User.find({
      estoreid: new ObjectId(estoreid),
      role: "moderator",
    }).exec();
    const cashiers = await User.find({
      estoreid: new ObjectId(estoreid),
      role: "cashier",
    }).exec();

    let customers = await User.find({
      ...searchObj,
      role: "customer",
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    if (customers.length < 1 && searchQuery) {
      customers = await User.find({
        name: { $regex: searchQuery, $options: "i" },
        estoreid: new ObjectId(estoreid),
      })
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .exec();
    }

    const countCustomers = await User.find({
      ...searchObj,
      role: "customer",
    }).exec();

    res.json({
      admins,
      moderators,
      cashiers,
      customers,
      count: countCustomers.length,
    });
  } catch (error) {
    res.json({ err: "Fetching users fails. " + error.message });
  }
};

exports.createNewUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const resellid = req.params.resellid;

  try {
    const checkUser = await User.findOne({
      email: req.body.email,
      estoreid: new ObjectId(estoreid),
      resellid: new ObjectId(resellid),
    }).exec();

    if (checkUser) {
      res.json({ err: "The email address is already existing on this store" });
    } else {
      const user = new User(
        req.body.refid
          ? {
              refid: new ObjectId(req.body.refid),
              name: req.body.owner,
              phone: req.body.phone,
              email: req.body.email,
              password: md5(req.body.password),
              showPass: req.body.password,
              role: req.body.role,
              address: req.body.address,
              estoreid: new ObjectId(estoreid),
              resellid: new ObjectId(resellid),
            }
          : {
              name: req.body.owner,
              phone: req.body.phone,
              email: req.body.email,
              password: md5(req.body.password),
              showPass: req.body.password,
              role: req.body.role,
              address: req.body.address,
              estoreid: new ObjectId(estoreid),
              resellid: new ObjectId(resellid),
            }
      );
      await user.save();
      const token = jwt.sign(
        { email: req.body.email },
        process.env.JWT_PRIVATE_KEY
      );

      let refUser = {};
      if (req.body.refid) {
        refUser = await User.findOne({
          _id: new ObjectId(req.body.refid),
          role: "admin",
        }).exec();
      }

      res.json({ user, token, refUser });
    }
  } catch (error) {
    res.json({ err: "Creating new user fails. " + error.message });
  }
};

exports.sendEmail = async (req, res) => {
  const email = req.body.email;
  const name = req.body.name;
  const templateId = req.body.templateId;
  const defaultClient = SibApiV3Sdk.ApiClient.instance;

  let apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_APIKEY;

  let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail(); // SendSmtpEmail | Values to send a transactional email

  sendSmtpEmail = {
    to: [
      {
        email,
        name,
      },
    ],
    templateId,
    headers: {
      "X-Mailin-custom":
        "custom_header_1:custom_value_1|custom_header_2:custom_value_2",
    },
  };

  apiInstance.sendTransacEmail(sendSmtpEmail).then(
    function (data) {
      res.json({ ok: true });
    },
    function (error) {
      res.json({ err: "Sending welcome email fails. " + error.message });
    }
  );
};

exports.addToWishlist = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const prodid = req.body.prodid;
  const email = req.user.email;

  try {
    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid) },
      { $addToSet: { wishlist: prodid } },
      {
        new: true,
      }
    );

    const wishlist = await populateWishlist(user.wishlist, estoreid);

    res.json(wishlist);
  } catch (error) {
    res.json({ err: "Adding wishlist fails. " + error.message });
  }
};

exports.updateUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  let objValues = req.body;

  if (email !== req.body.email) {
    objValues = { ...req.body, emailConfirm: false };
  }

  try {
    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    });
    if (checkUser && checkUser.verifyCode && checkUser.verifyCode.length > 0) {
      objValues = { ...req.body, verifyCode: checkUser.verifyCode };
    }
    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid) },
      objValues,
      {
        new: true,
      }
    )
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass");
    res.json(user);
  } catch (error) {
    res.json({ err: "Updating user fails. " + error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const userid = req.params.userid;
  try {
    const checkUser = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    });
    if (checkUser && checkUser.superAdmin) {
      await User.findOneAndUpdate({ _id: new ObjectId(userid) }, req.body, {
        new: true,
      });
    } else {
      await User.findOneAndUpdate(
        { _id: new ObjectId(userid), estoreid: new ObjectId(estoreid) },
        req.body,
        {
          new: true,
        }
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Updating customer fails. " + error.message });
  }
};

exports.verifyUserEmail = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const code = req.body.code;

  try {
    const user = await User.findOneAndUpdate(
      { email, estoreid: new ObjectId(estoreid), verifyCode: code },
      { verifyCode: "", emailConfirm: true },
      {
        new: true,
      }
    )
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .select("-password -showPass -verifyCode");
    if (user) {
      if (user.role === "admin") {
        await Estore.findOneAndUpdate(
          { _id: new ObjectId(estoreid) },
          { status: "active" },
          {
            new: true,
          }
        );
      }
      res.json(user);
    } else {
      res.json({
        err: "Sorry, the verification code you submitted is either incorrect or expired!",
      });
    }
  } catch (error) {
    res.json({ err: "Verifying user email fails. " + error.message });
  }
};

exports.changePassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const oldpassword = req.body.oldpassword;
  const newpassword = req.body.newpassword;

  try {
    const user = await User.findOneAndUpdate(
      {
        email,
        estoreid: new ObjectId(estoreid),
        password: md5(oldpassword),
      },
      {
        password: md5(newpassword),
      },
      { new: true }
    );
    if (user) {
      res.json(user);
    } else {
      res.json({ err: "The old password you have entered is not correct" });
    }
  } catch (error) {
    res.json({ err: "Change password fails. " + error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const userid = req.params.userid;

  try {
    const user = await User.findOneAndUpdate(
      {
        _id: new ObjectId(userid),
        estoreid: new ObjectId(estoreid),
      },
      {
        password: md5("Grocery@2000"),
      },
      { new: true }
    );
    res.json(user);
  } catch (error) {
    res.json({ err: "Reseting password for a user fails. " + error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.body.email;
  const newpassword = req.body.newpassword;
  let user = {};

  try {
    if (estoreid) {
      user = await User.findOneAndUpdate(
        {
          email,
          estoreid: new ObjectId(estoreid),
        },
        {
          password: md5(newpassword),
        },
        { new: true }
      );
    } else {
      user = await User.findOneAndUpdate(
        {
          email,
          role: "admin",
        },
        {
          password: md5(newpassword),
        },
        { new: true }
      );
    }
    if (user._id) {
      res.json(user);
    } else {
      res.json({ err: "Change user password fails. No user was found" });
    }
  } catch (error) {
    res.json({ err: "Change user password fails. " + error.message });
  }
};

exports.deleteAccountRequest = async (req, res) => {
  const email = req.body.email;
  const reasons = req.body.reasons;
  try {
    const user = await User.findOneAndUpdate(
      {
        email,
      },
      { deleteAccount: { request: true, reasons } },
      { new: true }
    );
    if (user) {
      res.json(user);
    } else {
      res.json({
        err: "Sorry, there is no user registered under the email" + email,
      });
    }
  } catch (error) {
    res.json({ err: "Request for Account Deletion fails. " + error.message });
  }
};

exports.deleteUser = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const userid = req.params.userid;

  try {
    const user = await User.findOneAndDelete({
      _id: new ObjectId(userid),
      estoreid: new ObjectId(estoreid),
    });
    res.json(user);
  } catch (error) {
    res.json({ err: "Deleting user fails. " + error.message });
  }
};

exports.deleteAllRaffles = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const raffles = await Raffle.remove({
      estoreid: new ObjectId(estoreid),
    });
    res.json(raffles);
  } catch (error) {
    res.json({ err: "Deleting all raffles fails. " + error.message });
  }
};
