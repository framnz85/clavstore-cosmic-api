const ObjectId = require("mongoose").Types.ObjectId;
const JobOrder = require("../models/joborder");
const Cashflow = require("../models/cashflow");
const Estore = require("../models/estore");
const { createCashflowEntry } = require("./cashflow");

const toObjectId = (value) =>
  value && ObjectId.isValid(value) ? new ObjectId(value) : undefined;

const normalizePrice = (price) => {
  if (price && typeof price === "object") return price.amount || 0;
  return typeof price === "number" ? price : 0;
};

const normalizeQuantity = (quantity) => {
  const q = Number(quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const calculateTotalAmount = (jobs) => {
  return jobs.reduce((total, job) => {
    const jobPrice = normalizePrice(job.price);
    const jobQuantity = normalizeQuantity(job.quantity);
    return total + jobPrice * jobQuantity;
  }, 0);
};

const isCompletedStatus = (status) =>
  status === "Complete" || status === "Completed";

const cashFlowEntry = async (jobOrder, estoreid, createdBy) => {
  try {
    const paymentOptionId =
      jobOrder && jobOrder.paymentOption ? jobOrder.paymentOption : null;

    const estore = await Estore.findById(estoreid)
      .select("upStatus2 upgradeType enableCashflow")
      .lean();

    if (!estore.enableCashflow) return;

    if (
      paymentOptionId &&
      ObjectId.isValid(paymentOptionId) &&
      (!estore ||
        String(estore.upStatus2 || "") !== "Active" ||
        String(estore.upgradeType || "") !== "2")
    ) {
      return;
    }

    const cashflowAmount =
      jobOrder && jobOrder.totalAmount ? Number(jobOrder.totalAmount) : 0;
    const orderCash = jobOrder && jobOrder.cash ? Number(jobOrder.cash) : 0;
    const posCashPaid = orderCash > 0;
    const inflowAmount = posCashPaid ? orderCash : cashflowAmount;
    const changeAmount = posCashPaid
      ? Math.max(orderCash - cashflowAmount, 0)
      : 0;

    let finalBalanceInflow = inflowAmount;
    let finalBalanceOutflow = 0;

    const latestCashflowQuery =
      jobOrder.paymentOption && ObjectId.isValid(jobOrder.paymentOption)
        ? {
            estoreid: new ObjectId(estoreid),
            createdBy: new ObjectId(createdBy),
            bankid: new ObjectId(jobOrder.paymentOption),
          }
        : {
            estoreid: new ObjectId(estoreid),
            createdBy: new ObjectId(createdBy),
            $or: [{ bankid: { $exists: false } }, { bankid: null }],
          };

    const latestCashflow = await Cashflow.findOne(latestCashflowQuery)
      .sort({ date: -1, createdAt: -1 })
      .select("balanceInflow balanceOutflow")
      .lean();

    const latestBalanceInflow = latestCashflow
      ? parseFloat(latestCashflow.balanceInflow) || 0
      : 0;
    const latestBalanceOutflow = latestCashflow
      ? parseFloat(latestCashflow.balanceOutflow) || 0
      : 0;

    finalBalanceInflow = latestBalanceInflow + inflowAmount;
    finalBalanceOutflow = latestBalanceOutflow + changeAmount;

    if (
      ObjectId.isValid(estoreid) &&
      ObjectId.isValid(jobOrder && jobOrder._id) &&
      ObjectId.isValid(createdBy)
    ) {
      const bankId =
        jobOrder && ObjectId.isValid(jobOrder.paymentOption)
          ? new ObjectId(jobOrder.paymentOption)
          : null;

      await createCashflowEntry({
        estoreid,
        createdBy,
        type: "jobs",
        amount: cashflowAmount,
        referenceid: jobOrder._id,
        date: new Date(),
        bankid: bankId,
        balanceInflow: finalBalanceInflow,
        balanceOutflow: finalBalanceOutflow,
      });
    }
  } catch (cashflowError) {
    console.log("Create cashflow failed:", cashflowError.message);
  }
};

exports.createJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const {
      code,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      jobs,
      date,
      dueDate,
      createdBy,
      paymentOption,
      notes,
      orderStatus,
    } = req.body;

    if ((!customerId && !customerName) || !jobs || jobs.length === 0) {
      return res.status(400).json({
        message: "Customer and at least one job are required",
      });
    }

    if (customerId && !ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customerId" });
    }
    if (createdBy && !ObjectId.isValid(createdBy)) {
      return res.status(400).json({ message: "Invalid createdBy" });
    }
    if (paymentOption && !ObjectId.isValid(paymentOption)) {
      return res.status(400).json({ message: "Invalid paymentOption" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    // Normalize jobs array
    const normalizedJobs = jobs.map((job) => ({
      jobId: toObjectId(job.jobId),
      jobTitle: job.jobTitle || "",
      quantity: normalizeQuantity(job.quantity),
      price: normalizePrice(job.price),
      status: job.status || "Not Processed",
      notes: job.notes || "",
    }));

    const totalAmount = calculateTotalAmount(normalizedJobs);

    const jobOrder = new JobOrder({
      code,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      jobs: normalizedJobs,
      totalAmount,
      orderStatus: orderStatus || "Not Processed",
      date,
      dueDate,
      createdBy: toObjectId(createdBy),
      paymentOption: toObjectId(paymentOption),
      customerId: toObjectId(customerId),
      estoreid: toObjectId(estoreid),
      notes,
    });

    const saved = await jobOrder.save();
    const populated = await JobOrder.findById(saved._id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    res.status(201).json({
      message: "Job order created successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating job order",
      error: error.message,
    });
  }
};

exports.getAllJobOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { search, orderStatus, customerId, jobId, paymentOption } = req.query;
    const filter = {};

    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }
    if (customerId && !ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customerId" });
    }
    if (jobId && !ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: "Invalid jobId" });
    }
    if (paymentOption && !ObjectId.isValid(paymentOption)) {
      return res.status(400).json({ message: "Invalid paymentOption" });
    }

    if (estoreid) filter.estoreid = new ObjectId(estoreid);
    if (orderStatus) filter.orderStatus = orderStatus;
    if (customerId) filter.customerId = new ObjectId(customerId);
    if (jobId) {
      filter["jobs.jobId"] = new ObjectId(jobId);
    }
    if (paymentOption) {
      filter.paymentOption = new ObjectId(paymentOption);
    }

    let query = JobOrder.find(filter);

    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const jobOrders = await query
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(jobOrders);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching job orders",
      error: error.message,
    });
  }
};

exports.getJobOrderById = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const query = estoreid
      ? { _id: new ObjectId(id), estoreid: new ObjectId(estoreid) }
      : { _id: new ObjectId(id) };

    const jobOrder = await JobOrder.findOne(query)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    res.status(200).json(jobOrder);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching job order", error: error.message });
  }
};

exports.updateJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    let shouldUnsetPaymentOption = false;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    if (updates.customerId !== undefined) {
      if (updates.customerId && !ObjectId.isValid(updates.customerId)) {
        return res.status(400).json({ message: "Invalid customerId" });
      }
      updates.customerId = toObjectId(updates.customerId);
    }

    if (updates.createdBy !== undefined) {
      if (updates.createdBy && !ObjectId.isValid(updates.createdBy)) {
        return res.status(400).json({ message: "Invalid createdBy" });
      }
      updates.createdBy = toObjectId(updates.createdBy);
    }

    if (updates.paymentOption !== undefined) {
      if (ObjectId.isValid(updates.paymentOption)) {
        updates.paymentOption = toObjectId(updates.paymentOption);
      } else {
        shouldUnsetPaymentOption = true;
        delete updates.paymentOption;
      }
    } else {
      shouldUnsetPaymentOption = true;
      delete updates.paymentOption;
    }

    // If jobs array is provided, normalize it and recalculate total
    if (updates.jobs && Array.isArray(updates.jobs)) {
      updates.jobs = updates.jobs.map((job) => ({
        jobId: toObjectId(job.jobId),
        jobTitle: job.jobTitle || "",
        quantity: normalizeQuantity(job.quantity),
        price: normalizePrice(job.price),
        status: job.status || "Not Processed",
        notes: job.notes || "",
      }));
      updates.totalAmount = calculateTotalAmount(updates.jobs);
    }

    const query = {
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    };

    const existingJobOrder = await JobOrder.findOne(query)
      .select("orderStatus createdBy estoreid")
      .lean();

    if (!existingJobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const updatePayload = {};
    if (Object.keys(updates).length > 0) {
      updatePayload.$set = updates;
    }
    if (shouldUnsetPaymentOption) {
      updatePayload.$unset = { paymentOption: "" };
    }

    const jobOrder = await JobOrder.findOneAndUpdate(query, updatePayload, {
      new: true,
      runValidators: true,
    })
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    const updatedStatus = updates.orderStatus || jobOrder.orderStatus;
    const wasCompleted = isCompletedStatus(existingJobOrder.orderStatus);
    const isNowCompleted = isCompletedStatus(updatedStatus);

    if (isNowCompleted && !wasCompleted) {
      await cashFlowEntry(
        jobOrder,
        estoreid || jobOrder.estoreid,
        updates.createdBy ||
          jobOrder.createdBy?._id ||
          existingJobOrder.createdBy,
      );
    }

    res.status(200).json(jobOrder);
  } catch (error) {
    res.status(500).json({
      message: "Error updating job order",
      error: error.message,
    });
  }
};

exports.deleteJobOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOneAndDelete({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    res.status(200).json(jobOrder);
  } catch (error) {
    res.status(500).json({
      message: "Error deleting job order",
      error: error.message,
    });
  }
};

// Add a job to existing job order
exports.addJobToOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const newJob = {
      jobId: toObjectId(jobId),
      jobTitle: jobTitle || "",
      quantity: normalizeQuantity(quantity),
      price: normalizePrice(price),
      status: status || "Not Processed",
      notes: notes || "",
    };

    const query = {
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    };

    const jobOrder = await JobOrder.findOneAndUpdate(
      query,
      {
        $push: { jobs: newJob },
      },
      { new: true, runValidators: true },
    );

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    // Recalculate total amount
    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    res.status(200).json({
      message: "Job added to order successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding job to order",
      error: error.message,
    });
  }
};

// Remove a job from job order
exports.removeJobFromOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id, jobIndex } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOne({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const index = parseInt(jobIndex);
    if (isNaN(index) || index < 0 || index >= jobOrder.jobs.length) {
      return res.status(400).json({ message: "Invalid job index" });
    }

    jobOrder.jobs.splice(index, 1);

    if (jobOrder.jobs.length === 0) {
      return res.status(400).json({
        message: "Cannot remove all jobs from order. Delete the order instead.",
      });
    }

    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    res.status(200).json({
      message: "Job removed from order successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error removing job from order",
      error: error.message,
    });
  }
};

// Update a specific job within an order
exports.updateJobInOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id, jobIndex } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (estoreid && !ObjectId.isValid(estoreid)) {
      return res.status(400).json({ message: "Invalid estoreid" });
    }

    const jobOrder = await JobOrder.findOne({
      _id: new ObjectId(id),
      ...(estoreid ? { estoreid: new ObjectId(estoreid) } : {}),
    });

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const index = parseInt(jobIndex);
    if (isNaN(index) || index < 0 || index >= jobOrder.jobs.length) {
      return res.status(400).json({ message: "Invalid job index" });
    }

    // Update only provided fields
    if (jobId !== undefined) jobOrder.jobs[index].jobId = toObjectId(jobId);
    if (jobTitle !== undefined) jobOrder.jobs[index].jobTitle = jobTitle;
    if (quantity !== undefined)
      jobOrder.jobs[index].quantity = normalizeQuantity(quantity);
    if (price !== undefined) jobOrder.jobs[index].price = normalizePrice(price);
    if (status !== undefined) jobOrder.jobs[index].status = status;
    if (notes !== undefined) jobOrder.jobs[index].notes = notes;

    jobOrder.totalAmount = calculateTotalAmount(jobOrder.jobs);
    await jobOrder.save();

    const populated = await JobOrder.findById(id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("paymentOption", "bankName")
      .populate("createdBy", "name email");

    res.status(200).json({
      message: "Job updated successfully",
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating job in order",
      error: error.message,
    });
  }
};
