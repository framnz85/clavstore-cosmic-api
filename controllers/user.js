const ObjectId = require("mongoose").Types.ObjectId;
const jwt = require("jsonwebtoken");
const md5 = require("md5");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const User = require("../models/user");
const Estore = require("../models/estore");
const Raffle = require("../models/raffle");

const { populateRaffle } = require("./common");

exports.getUserDetails = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;
  const resellid = req.params.resellid;

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
      res.json(user);
    } else {
      const userWithReseller = await User.findOne({
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
      if (userWithReseller) {
        res.json(userWithReseller);
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
          res.json(userWithEmail);
        } else {
          res.json({
            err: "Cannot fetch the user details or the user doesn't exist in this store.",
          });
        }
      }
    }
  } catch (error) {
    res.json({ err: "Fetching user information fails. " + error.message });
  }
};

exports.getUserToAffiliate = async (req, res) => {
  const email = req.user.email;
  const refEmail = req.params.email;

  try {
    const user = await User.findOne({
      email,
    }).exec();
    const referral = await User.findOne({
      email: refEmail,
      role: "admin",
    })
      .populate({
        path: "estoreid",
        populate: {
          path: "country",
        },
      })
      .exec();
    if (referral) {
      if (
        (referral && referral.refid) ||
        (referral.estoreid &&
          referral.estoreid.upStatus &&
          referral.estoreid &&
          referral.estoreid.upStatus === "Active")
      ) {
        res.json({
          err: "Sorry, the user under this email is already a referral of somebody else or is already a paid user.",
        });
      } else {
        delete referral.estoreid;
        await User.findOneAndUpdate(
          { _id: new ObjectId(referral._id) },
          { refid: user._id },
          {
            new: true,
          }
        );
        res.json(referral);
      }
    } else {
      res.json({ err: "No user found under this email" });
    }
  } catch (error) {
    res.json({
      err: "Fetching user information by email fails. " + error.message,
    });
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

exports.getAffiliates = async (req, res) => {
  const email = req.user.email;
  const estoreid = req.headers.estoreid;

  try {
    const { sortkey, sort, currentPage, pageSize } = req.body;

    const user = await User.findOne({
      email,
      estoreid: new ObjectId(estoreid),
    }).exec();
    const referrals = await User.find({
      refid: new ObjectId(user._id),
      role: "admin",
    })
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();
    const countReferral = await User.find({
      refid: new ObjectId(user._id),
      role: "admin",
    }).exec();
    const earnings = await User.aggregate([
      { $match: { refid: new ObjectId(user._id) } },
      { $group: { _id: null, amount: { $sum: "$refCommission" } } },
    ]);
    const withdraw = 0;
    res.json({ referrals, earnings, withdraw, count: countReferral.length });
  } catch (error) {
    res.json({ err: "Fetching top raffle entries fails. " + error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  const estoreid = req.headers.estoreid;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;

    let searchObj = searchQuery
      ? { $text: { $search: searchQuery }, estoreid: new ObjectId(estoreid) }
      : { estoreid: new ObjectId(estoreid) };

    const admins = await User.find({
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
  const reseller = req.body.reseller;

  try {
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
  } catch (error) {
    if (error.code === 11000) {
      if (reseller && reseller.resellerType) {
        res.json({ ok: true });
      } else {
        res.json({
          err: `The email ${req.body.email} or phone ${req.body.phone} is already existing`,
        });
      }
    } else {
      res.json({ err: "Creating new user fails. " + error.message });
    }
  }
};

exports.getResellerUsers = async (req, res) => {
  const resellid = req.params.resellid;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery, masterUser } =
      req.body;

    let searchObj = searchQuery
      ? masterUser
        ? {
            $text: { $search: searchQuery },
            role: "admin",
          }
        : {
            $text: { $search: searchQuery },
            role: "admin",
            resellid: new ObjectId(resellid),
          }
      : masterUser
      ? { role: "admin" }
      : { role: "admin", resellid: new ObjectId(resellid) };

    let owners = await User.find(searchObj)
      .populate("estoreid")
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    let countOwners = {};

    if (owners.length === 0 && searchQuery) {
      owners = await User.find(
        masterUser
          ? {
              email: searchQuery,
              role: "admin",
            }
          : {
              email: searchQuery,
              role: "admin",
              resellid: new ObjectId(resellid),
            }
      )
        .populate("estoreid")
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .exec();
      countOwners = await User.find(
        masterUser
          ? {
              email: searchQuery,
              role: "admin",
            }
          : {
              email: searchQuery,
              role: "admin",
              resellid: new ObjectId(resellid),
            }
      ).exec();
    } else {
      countOwners = await User.find(searchObj).exec();
    }

    res.json({ owners, count: countOwners.length });
  } catch (error) {
    res.json({ err: "Fetching users fails. " + error.message });
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
    if (checkUser.verifyCode && checkUser.verifyCode.length > 0) {
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
    res.json({ err: "Creating new user fails. " + error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const userid = req.params.userid;

  try {
    await User.findOneAndUpdate(
      { _id: new ObjectId(userid), estoreid: new ObjectId(estoreid) },
      req.body,
      {
        new: true,
      }
    );

    res.json({ ok: true });
  } catch (error) {
    res.json({ err: "Creating new user fails. " + error.message });
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
    res.json({ err: "Creating new user fails. " + error.message });
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
    res.json({ err: "Deleting user fails. " + error.message });
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
