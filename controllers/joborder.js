const ObjectId = require("mongoose").Types.ObjectId;
const JobOrder = require("../models/joborder");

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
      notes,
      orderStatus,
    } = req.body;

    if (!customerId || !jobs || jobs.length === 0) {
      return res.status(400).json({
        message: "Customer and at least one job are required",
      });
    }

    // Normalize jobs array
    const normalizedJobs = jobs.map((job) => ({
      jobId: job.jobId,
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
      createdBy,
      estoreid,
      notes,
    });

    const saved = await jobOrder.save();
    const populated = await JobOrder.findById(saved._id)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
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
    const { search, orderStatus, customerId, jobId } = req.query;
    const filter = {};

    if (estoreid) filter.estoreid = new ObjectId(estoreid);
    if (orderStatus) filter.orderStatus = orderStatus;
    if (customerId) filter.customerId = new ObjectId(customerId);
    if (jobId) {
      filter["jobs.jobId"] = new ObjectId(jobId);
    }

    let query = JobOrder.find(filter);

    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const jobOrders = await query
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
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

    const query = estoreid
      ? { _id: new ObjectId(id), estoreid: new ObjectId(estoreid) }
      : { _id: new ObjectId(id) };

    const jobOrder = await JobOrder.findOne(query)
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
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
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // If jobs array is provided, normalize it and recalculate total
    if (updates.jobs && Array.isArray(updates.jobs)) {
      updates.jobs = updates.jobs.map((job) => ({
        jobId: job.jobId,
        jobTitle: job.jobTitle || "",
        quantity: normalizeQuantity(job.quantity),
        price: normalizePrice(job.price),
        status: job.status || "Not Processed",
        notes: job.notes || "",
      }));
      updates.totalAmount = calculateTotalAmount(updates.jobs);
    }

    const jobOrder = await JobOrder.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("customerId", "name email phone")
      .populate("jobs.jobId", "title uom price")
      .populate("createdBy", "name email");

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
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
  try {
    const { id } = req.params;
    const jobOrder = await JobOrder.findByIdAndDelete(id);

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
  try {
    const { id } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const newJob = {
      jobId,
      jobTitle: jobTitle || "",
      quantity: normalizeQuantity(quantity),
      price: normalizePrice(price),
      status: status || "Not Processed",
      notes: notes || "",
    };

    const jobOrder = await JobOrder.findByIdAndUpdate(
      id,
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
  try {
    const { id, jobIndex } = req.params;

    const jobOrder = await JobOrder.findById(id);

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
  try {
    const { id, jobIndex } = req.params;
    const { jobId, jobTitle, quantity, price, status, notes } = req.body;

    const jobOrder = await JobOrder.findById(id);

    if (!jobOrder) {
      return res.status(404).json({ message: "Job order not found" });
    }

    const index = parseInt(jobIndex);
    if (isNaN(index) || index < 0 || index >= jobOrder.jobs.length) {
      return res.status(400).json({ message: "Invalid job index" });
    }

    // Update only provided fields
    if (jobId !== undefined) jobOrder.jobs[index].jobId = jobId;
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
