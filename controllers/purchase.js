const ObjectId = require("mongoose").Types.ObjectId;

const Purchase = require("../models/purchase");
const User = require("../models/user");
const Product = require("../models/product");
const Estore = require("../models/estore");

exports.createPurchase = async (req, res) => {
  try {
    const email = req.user.email;
    const user = await User.findOne({ email }).exec();
    if (!user) return res.json({ err: "Cannot find user" });

    const data = req.body;
    data.createdBy = user._id;

    const purchase = await Purchase.create(data);
    res.json(purchase);
  } catch (error) {
    res.json({ err: "Creating purchase failed. " + error.message });
  }
};

exports.getPurchase = async (req, res) => {
  try {
    const purchaseid = req.params.purchaseid;
    const purchase = await Purchase.findOne({ _id: new ObjectId(purchaseid) })
      .populate("supplier")
      .populate("items.product")
      .populate("paymentOption")
      .populate("createdBy", "_id email")
      .exec();

    if (purchase) res.json(purchase);
    else res.json({ err: "Sorry, there is no data on this purchase." });
  } catch (error) {
    res.json({ err: "Fetching purchase failed. " + error.message });
  }
};

exports.listPurchases = async (req, res) => {
  try {
    const {
      sortkey,
      sort,
      currentPage = 1,
      pageSize = 20,
      searchQuery,
      status,
      supplier,
    } = req.body;

    const searchObj = {};
    if (searchQuery) {
      searchObj.$or = [
        { orderCode: { $regex: searchQuery, $options: "i" } },
        { "items.description": { $regex: searchQuery, $options: "i" } },
      ];
    }

    if (status && status !== "All") searchObj.poStatus = status;
    if (supplier) searchObj.supplier = new ObjectId(supplier);

    const purchases = await Purchase.find(searchObj)
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey || "createdAt"]: sort || -1 })
      .limit(pageSize)
      .populate("supplier")
      .populate("items.product")
      .populate("createdBy", "_id email")
      .exec();

    const count = await Purchase.countDocuments(searchObj).exec();

    res.json({ purchases, count });
  } catch (error) {
    res.json({ err: "Fetching purchases failed. " + error.message });
  }
};

exports.updatePurchase = async (req, res) => {
  try {
    const purchaseid = req.params.purchaseid;
    const data = req.body;

    // If poStatus is changing, push to statusHistory
    if (data.poStatus) {
      const prev = await Purchase.findById(purchaseid)
        .select("poStatus statusHistory")
        .exec();
      if (prev && prev.poStatus !== data.poStatus) {
        const hist = {
          status: data.poStatus,
          remarks: data.remarks || "Status update",
          date: new Date(),
        };
        data.statusHistory = prev.statusHistory
          ? [...prev.statusHistory, hist]
          : [hist];
      }
    }

    const updated = await Purchase.findByIdAndUpdate(purchaseid, data, {
      new: true,
    })
      .populate("supplier")
      .populate("items.product")
      .populate("createdBy", "_id email")
      .exec();

    res.json(updated);
  } catch (error) {
    res.json({ err: "Updating purchase failed. " + error.message });
  }
};

exports.deletePurchase = async (req, res) => {
  try {
    const purchaseid = req.params.purchaseid;
    await Purchase.findByIdAndDelete(purchaseid).exec();
    res.json({ success: true });
  } catch (error) {
    res.json({ err: "Deleting purchase failed. " + error.message });
  }
};

// Mark received quantities for items. body: { items: [{ product, variant, qtyReceived }] }
exports.receivePurchase = async (req, res) => {
  try {
    const purchaseid = req.params.purchaseid;
    const { items: receivedItems, receivedDate } = req.body;

    const purchase = await Purchase.findById(purchaseid).exec();
    if (!purchase) return res.json({ err: "Purchase not found" });

    // Update each item
    for (let r of receivedItems) {
      const idx = purchase.items.findIndex((it) => {
        const sameProduct =
          it.product &&
          it.product.toString() === (r.product || r.productId).toString();
        const sameVariant =
          (it.variant ? it.variant.toString() : "") ===
          (r.variant ? r.variant.toString() : "");
        return sameProduct && sameVariant;
      });
      if (idx > -1) {
        purchase.items[idx].receivedQty =
          (purchase.items[idx].receivedQty || 0) +
          (r.qtyReceived || r.receivedQty || 0);
      }
    }

    // Determine status
    let allReceived = true;
    let anyReceived = false;
    for (let it of purchase.items) {
      if ((it.receivedQty || 0) < (it.qty || 0)) allReceived = false;
      if ((it.receivedQty || 0) > 0) anyReceived = true;
    }
    if (allReceived) purchase.poStatus = "Received";
    else if (anyReceived) purchase.poStatus = "Partially Received";

    if (receivedDate) purchase.receivedDate = new Date(receivedDate);

    // push history
    purchase.statusHistory = purchase.statusHistory || [];
    purchase.statusHistory.push({
      status: purchase.poStatus,
      remarks: "Items received",
      date: new Date(),
    });

    await purchase.save();

    const populated = await Purchase.findById(purchaseid)
      .populate("supplier")
      .populate("items.product")
      .populate("createdBy", "_id email")
      .exec();

    res.json(populated);
  } catch (error) {
    res.json({ err: "Receiving purchase failed. " + error.message });
  }
};
