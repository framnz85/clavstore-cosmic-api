const ObjectId = require("mongoose").Types.ObjectId;
const Billing = require("../models/billing");
const Estore = require("../models/estore");

exports.getBillings = async (req, res) => {
  const resellid = req.headers.resellid;
  try {
    const filterObj =
      resellid === "613216389261e003d696cc65"
        ? {}
        : { resellid: new ObjectId(resellid) };
    const billings = await Billing.find(filterObj).exec();

    const countBillings = await Billing.estimatedDocumentCount({
      resellid: new ObjectId(resellid),
    });

    res.json({ billings, countBillings });
  } catch (error) {
    res.json({ err: "Fetching billings fails. " + error.message });
  }
};

exports.createBilling = async (req, res) => {
  const resellid = req.headers.resellid;
  const estoreList = req.body.estoreList;
  let updateObj = {};

  try {
    const billing = new Billing({ ...req.body, resellid });
    await billing.save();

    for (i = 0; i < estoreList.length; i++) {
      if (estoreList[i].product === "Package A") {
        updateObj = { approval: "For Approval" };
      }
      if (estoreList[i].product === "Package B") {
        updateObj = { approval2: "For Approval" };
      }
      if (estoreList[i].product === "Package C") {
        updateObj = { approval3: "For Approval" };
      }

      await Estore.findByIdAndUpdate(estoreList[i].estoreid, updateObj, {
        new: true,
      }).exec();
    }

    res.json(billing);
  } catch (error) {
    res.json({ err: "Creating billing fails. " + error.message });
  }
};

exports.updateBilling = async (req, res) => {
  const billingId = req.body.billingId;
  const resellid = req.body.resellid;

  try {
    const billing = await Billing.findOne({
      _id: Object(billingId),
      resellid: new ObjectId(resellid),
    }).exec();
    if (billing) {
      const estoreList = billing.estoreList ? billing.estoreList : [];
      for (i = 0; i < estoreList.length; i++) {
        if (estoreList[i].product === "Package A") {
          updateObj = { approval: "Approved" };
        }
        if (estoreList[i].product === "Package B") {
          updateObj = { approval2: "Approved" };
        }
        if (estoreList[i].product === "Package C") {
          updateObj = { approval3: "Approved" };
        }

        await Estore.findByIdAndUpdate(estoreList[i].estoreid, updateObj, {
          new: true,
        }).exec();
      }
      await Billing.findOneAndUpdate(
        {
          _id: Object(billingId),
          resellid: new ObjectId(resellid),
        },
        { status: "Approved" }
      ).exec();
      res.json(billing);
    } else {
      res.json({ err: "No billing exist under ID: " + billing });
    }
  } catch (error) {
    res.json({ err: "Fetching billing information fails. " + error.message });
  }
};
