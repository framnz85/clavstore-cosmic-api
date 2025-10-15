const Cashflow = require("../models/cashflow");

// Create Cashflow
exports.createCashflow = async (req, res) => {
  try {
    const cashflow = new Cashflow({
      ...req.body,
      estoreid: req.headers.estoreid,
      createdBy: req.user._id,
    });
    await cashflow.save();
    res.json(cashflow);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get All Cashflows
exports.getCashflows = async (req, res) => {
  try {
    const cashflows = await Cashflow.find({
      estoreid: req.headers.estoreid,
    }).sort({ date: -1 });
    res.json(cashflows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Update Cashflow
exports.updateCashflow = async (req, res) => {
  try {
    const cashflow = await Cashflow.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(cashflow);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete Cashflow
exports.deleteCashflow = async (req, res) => {
  try {
    await Cashflow.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
