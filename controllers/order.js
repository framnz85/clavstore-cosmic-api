const ObjectId = require("mongoose").Types.ObjectId;
const md5 = require("md5");
const jwt = require("jsonwebtoken");

const Estore = require("../models/estore");
const User = require("../models/user");
const Cart = require("../models/cart");
const Product = require("../models/product");
const Order = require("../models/order");
const {
  createRaffle,
  checkOrderedProd,
  updateOrderedProd,
} = require("./common");

exports.userOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.params.orderid;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOne({
        _id: new ObjectId(orderid),
        orderedBy: user._id,
        estoreid: Object(estoreid),
      })
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
        .exec();
      if (order) {
        res.json(order);
      } else {
        res.json({ err: "Sorry, there is no data on this order." });
      }
    } else {
      res.json({ err: "Cannot fetch this order." });
    }
  } catch (error) {
    res.json({ err: "Fetching an order failed. " + error.message });
  }
};

exports.userAppOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const order = await Order.findOne({
      _id: new ObjectId(orderid),
      estoreid: Object(estoreid),
    })
      .populate("products.product")
      .populate("orderedBy")
      .populate("paymentOption")
      .exec();
    const token = jwt.sign(
      { email: order.orderedBy.email },
      process.env.JWT_PRIVATE_KEY
    );
    if (order) {
      res.json({ order, token });
    } else {
      res.json({ err: "Sorry, there is no data on this order." });
    }
  } catch (error) {
    res.json({ err: "Fetching an order failed. " + error.message });
  }
};

exports.adminOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const order = await Order.findOne({
      _id: new ObjectId(orderid),
      estoreid: Object(estoreid),
    })
      .populate("products.product")
      .populate("orderedBy")
      .populate("paymentOption")
      .exec();
    if (order) {
      res.json(order);
    } else {
      res.json({ err: "Sorry, there is no data on this order." });
    }
  } catch (error) {
    res.json({ err: "Fetching an order failed. " + error.message });
  }
};

exports.userOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;

    const user = await User.findOne({ email }).exec();

    if (user) {
      const searchObj = searchQuery
        ? {
            $or: [
              { orderCode: searchQuery },
              { $text: { $search: searchQuery } },
            ],
            estoreid: new ObjectId(estoreid),
            orderedBy: user._id,
          }
        : { estoreid: new ObjectId(estoreid), orderedBy: user._id };

      const orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .populate("orderedBy", "_id")
        .populate("paymentOption", "bankName")
        .select(
          "_id orderCode orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid createdAt"
        )
        .exec();

      const countOrder = await Order.countDocuments(searchObj).exec();

      res.json({ orders, count: countOrder });
    } else {
      res.json({ err: "Cannot fetch user orders." });
    }
  } catch (error) {
    res.json({ err: "Fetching orders failed. " + error.message });
  }
};

exports.adminOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  let orders = [];
  let totalCredit = {};
  let collectibles = 0;

  try {
    const {
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery,
      status,
      orderedBy,
      sales,
    } = req.body;

    const user = await User.findOne({ email }).exec();

    let searchObj = {};

    if (user.role === "cashier") {
      searchObj = searchQuery
        ? {
            $or: [
              { orderCode: searchQuery },
              { $text: { $search: searchQuery } },
            ],
            estoreid: new ObjectId(estoreid),
            createdBy: user._id,
          }
        : { estoreid: new ObjectId(estoreid), createdBy: user._id };
      if (status !== "All Status") {
        searchObj = { ...searchObj, orderStatus: status };
      }
      if (orderedBy) {
        searchObj = { ...searchObj, orderedBy: new ObjectId(orderedBy) };
      }
      if (sales && sales.type && sales.type === "sales") {
        const startDate = new Date(
          new Date(sales.dateStart).setHours(
            new Date(sales.dateStart).getHours() + 8
          )
        );
        const endDate = new Date(
          new Date(sales.endDate).setHours(
            new Date(sales.endDate).getHours() + 8
          )
        );
        startDate.setDate(startDate.getDate() - 1);
        searchObj = {
          ...searchObj,
          createdAt: {
            $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
            $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
          },
        };
      }
      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .populate("paymentOption")
        .select(
          "_id orderCode orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid createdAt"
        )
        .exec();
    } else {
      searchObj = searchQuery
        ? {
            $or: [
              { orderCode: searchQuery },
              { $text: { $search: searchQuery } },
            ],
            estoreid: new ObjectId(estoreid),
          }
        : { estoreid: new ObjectId(estoreid) };
      if (status !== "All Status") {
        searchObj = { ...searchObj, orderStatus: status };
      }
      if (orderedBy) {
        searchObj = { ...searchObj, orderedBy: new ObjectId(orderedBy) };
      }
      if (sales && sales.type && sales.type === "sales") {
        const startDate = new Date(
          new Date(sales.dateStart).setHours(
            new Date(sales.dateStart).getHours() + 8
          )
        );
        const endDate = new Date(
          new Date(sales.endDate).setHours(
            new Date(sales.endDate).getHours() + 8
          )
        );
        startDate.setDate(startDate.getDate() - 1);
        searchObj = {
          ...searchObj,
          createdAt: {
            $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
            $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
          },
        };
      }
      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .select(
          "_id orderCode orderedName cartTotal delfee servefee discount addDiscount orderType orderStatus deliveryPrefer deliverInstruct estoreid createdAt"
        )
        .populate("paymentOption")
        .exec();
    }

    const countOrder = await Order.countDocuments(searchObj).exec();

    if (status === "Credit") {
      totalCredit = await Order.aggregate([
        { $match: searchObj },
        {
          $group: {
            _id: null,
            sum_cartTotal: { $sum: "$cartTotal" },
            sum_delfee: { $sum: "$delfee" },
            sum_discount: { $sum: "$discount" },
            sum_addDiscount: { $sum: "$addDiscount" },
          },
        },
      ]);
      if (totalCredit && totalCredit[0]) {
        collectibles =
          parseFloat(totalCredit[0].sum_cartTotal) +
          parseFloat(totalCredit[0].sum_delfee) +
          parseFloat(totalCredit[0].sum_discount) +
          parseFloat(totalCredit[0].sum_addDiscount);
      }
    }

    res.json({ orders, count: countOrder, collectibles });
  } catch (error) {
    res.json({ err: "Fetching orders failed. " + error.message });
  }
};

exports.adminSales = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const dates = req.body.dates;
  let capital = 0;
  let orders = [];

  const startDate = new Date(
    new Date(dates.dateStart).setHours(new Date(dates.dateStart).getHours() + 8)
  );
  const endDate = new Date(
    new Date(dates.endDate).setHours(new Date(dates.endDate).getHours() + 8)
  );

  startDate.setDate(startDate.getDate() - 1);

  try {
    const user = await User.findOne({ email }).exec();

    if (user.role === "cashier") {
      orders = await Order.find({
        estoreid: Object(estoreid),
        orderStatus: "Completed",
        createdBy: user._id,
        createdAt: {
          $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        },
      }).exec();
    } else {
      orders = await Order.find({
        estoreid: Object(estoreid),
        orderStatus: "Completed",
        createdAt: {
          $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
          $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
        },
      }).exec();
    }

    orders.forEach((order) => {
      capital =
        capital +
        order.products.reduce((accumulator, value) => {
          return value.supplierPrice
            ? accumulator + value.supplierPrice * value.count
            : 0;
        }, 0);
    });

    const cartTotals = orders.reduce((accumulator, value) => {
      const cartTotal = value.cartTotal ? value.cartTotal : 0;
      return accumulator + cartTotal;
    }, 0);

    const delfees = orders.reduce((accumulator, value) => {
      const delfee = value.delfee ? value.delfee : 0;
      return accumulator + delfee;
    }, 0);

    const discounts = orders.reduce((accumulator, value) => {
      const discount = value.discount ? value.discount : 0;
      const addDiscount = value.addDiscount ? value.addDiscount : 0;
      return accumulator + discount + addDiscount;
    }, 0);

    res.json({ capital, cartTotals, delfees, discounts });
  } catch (error) {
    res.json({ err: "Fetching orders failed. " + error.message });
  }
};

exports.updateCart = async (req, res) => {
  const { cart } = req.body;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  let products = [];

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      let showWaiting = false;
      let waitingProduct = { _id: "", title: "", quantity: 0 };
      for (let i = 0; i < cart.length; i++) {
        let object = {};

        object.product = cart[i]._id;
        object.count = cart[i].count;
        object.excess = cart[i].excess ? true : false;

        const productFromDb = await Product.findOne({
          _id: new ObjectId(cart[i]._id),
          estoreid: new ObjectId(estoreid),
        }).exec();
        object.supplierPrice = cart[i].excess
          ? cart[i].supplierPrice
          : productFromDb.supplierPrice;
        let price = 0;
        if (cart[i].priceChange || cart[i].excess) {
          price = cart[i].price;
        } else {
          if (
            (user.role === "admin" || user.wholesale) &&
            productFromDb.wholesale &&
            productFromDb.wholesale.length > 0
          ) {
            const wholesales = productFromDb.wholesale.filter(
              (wsale) => wsale.wcount <= cart[i].count
            );
            if (wholesales.length > 0) {
              const largestCount = Math.max(
                ...wholesales.map((large) => large.wcount)
              );
              const largestWholesale = wholesales.filter(
                (wsale) => wsale.wcount === largestCount
              );
              if (largestWholesale[0] && largestWholesale[0].wprice) {
                price = largestWholesale[0].wprice;
              } else {
                price = productFromDb.price;
              }
            } else {
              price = productFromDb.price;
            }
          } else {
            price = productFromDb.price;
          }
        }
        object.price = price;
        cart[i] = { ...cart[i], price };

        if (
          productFromDb &&
          productFromDb.segregate &&
          productFromDb.quantity < object.count
        ) {
          object.excessCount =
            parseFloat(object.count) - parseFloat(productFromDb.quantity);
        }

        products.push(object);

        if (
          !cart[i].excess &&
          !productFromDb.segregate &&
          (!productFromDb.quantity || productFromDb.quantity < object.count)
        ) {
          waitingProduct = {
            ...productFromDb._doc,
            excessCount:
              parseFloat(object.count) - parseFloat(productFromDb.quantity),
          };
          showWaiting = true;
        }

        if (
          !cart[i].excess &&
          productFromDb.segregate &&
          productFromDb &&
          productFromDb.waiting &&
          productFromDb.waiting._id &&
          (!productFromDb.quantity || productFromDb.quantity < object.count)
        ) {
          waitingProduct = {
            ...productFromDb._doc,
            excessCount:
              parseFloat(object.count) - parseFloat(productFromDb.quantity),
          };
          showWaiting = true;
        }

        const newQuantity =
          productFromDb &&
          productFromDb.waiting &&
          productFromDb.waiting.newQuantity
            ? productFromDb.waiting.newQuantity
            : 0;

        if (
          cart[i].excess &&
          !productFromDb.segregate &&
          newQuantity < object.count
        ) {
          waitingProduct = {
            ...cart[i],
            quantity: newQuantity,
          };
          showWaiting = false;
        }
      }

      if (!waitingProduct._id) {
        let cartTotal = 0;
        for (let i = 0; i < products.length; i++) {
          products[i].product = new ObjectId(products[i].product);
          cartTotal = cartTotal + products[i].price * products[i].count;
        }

        await Cart.deleteMany({
          orderedBy: user._id,
          estoreid: new ObjectId(estoreid),
        }).exec();

        Cart.collection.insertOne({
          estoreid: new ObjectId(estoreid),
          products,
          cartTotal,
          orderedBy: user._id,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        });

        res.json({ cart });
      } else {
        res.json({
          err:
            waitingProduct.title +
            " with price @ " +
            waitingProduct.price +
            " has " +
            waitingProduct.quantity +
            " in stock only",
          waitingProduct: showWaiting ? waitingProduct : {},
        });
      }
    } else {
      res.json({ err: "Cannot fetch the cart details." });
    }
  } catch (error) {
    res.json({ err: "Fetching cart fails. " + error.message });
  }
};

exports.saveCartOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  const orderType = req.body.orderType;
  const delfee = req.body.delfee;
  const discount = req.body.discount;
  const servefee = req.body.servefee;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const paymentOption = req.body.paymentOption;
  const delAddress = req.body.delAddress;
  const orderNotes = req.body.orderNotes;
  const orderStatus = req.body.orderStatus;
  const deliveryPrefer = req.body.deliveryPrefer;
  const deliverInstruct = req.body.deliverInstruct;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;

  try {
    let user = await User.findOne({ email }).exec();
    let checkUser = {};

    if (customerName) {
      if (customerPhone) {
        checkUser = await User.findOne({
          phone: customerPhone,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (customerEmail) {
        checkUser = await User.findOne({
          email: customerEmail,
          estoreid: new ObjectId(estoreid),
        });
      }
      if (orderedBy) {
        checkUser = await User.findOne({
          _id: new ObjectId(orderedBy),
          estoreid: new ObjectId(estoreid),
        });
      }
      if (!checkUser && (customerPhone || customerEmail)) {
        const newUser = new User({
          name: customerName,
          phone: customerPhone ? customerPhone : "09100000001",
          email: customerEmail ? customerEmail : "abc@xyz.com",
          password: md5("Grocery@2000"),
          showPass: "Grocery@2000",
          role: "customer",
          estoreid: new ObjectId(estoreid),
        });
        checkUser = await newUser.save();
      }
    }

    const cart = await Cart.findOne({
      orderedBy: user._id,
      estoreid: Object(estoreid),
    });

    const checkProdQty = await checkOrderedProd(cart.products, estoreid);

    if (checkProdQty && checkProdQty.err) {
      res.json({ err: checkProdQty.err, backToCart: true });
    } else {
      const newOrder = new Order({
        orderCode: cart._id.toString().slice(-12),
        orderType,
        products: cart.products,
        paymentOption: new ObjectId(paymentOption),
        orderStatus:
          orderType === "pos"
            ? orderStatus === "Credit"
              ? "Credit"
              : "Completed"
            : "Not Processed",
        statusHistory: [
          {
            status:
              orderStatus === "Completed" || orderStatus === "Credit"
                ? orderStatus
                : "Not Processed",
            remarks: "Order was created.",
            date: new Date(),
          },
        ],
        cartTotal: cart.cartTotal,
        delfee,
        discount,
        servefee,
        addDiscount,
        cash,
        createdBy: user._id,
        orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
        orderedName: customerName || user.name,
        estoreid: new ObjectId(estoreid),
        delAddress,
        orderNotes,
        deliveryPrefer,
        deliverInstruct,
      });

      const order = await newOrder.save();

      if (order) {
        res.json(order);

        await Cart.deleteMany({
          orderedBy: user._id,
          estoreid: Object(estoreid),
        });

        const estore = await Estore.findOne({
          _id: Object(estoreid),
        });
        if (
          orderType === "pos" &&
          (order.orderStatus === "Credit" || order.orderStatus === "Completed")
        ) {
          await updateOrderedProd(order.products, estoreid, true);

          createRaffle(estoreid, user, order);
        }
        if (
          orderType === "web" &&
          estore &&
          estore.orderStatus &&
          estore.orderStatus === "Not Processed"
        ) {
          await updateOrderedProd(order.products, estoreid, true);
        }
      } else {
        res.json({ err: "Cannot save the order." });
      }
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

const removeUpdates = async (
  estoreid,
  statusEstore,
  orderType,
  orderStatus,
  products
) => {
  if (statusEstore === "Not Processed") {
    if (orderType === "void") {
      await updateOrderedProd(products, estoreid, true);
    } else {
      await updateOrderedProd(products, estoreid, false);
    }
  } else if (statusEstore === "Waiting Payment") {
    if (orderStatus !== "Not Processed") {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  } else if (statusEstore === "Processing") {
    if (orderStatus !== "Not Processed" && orderStatus !== "Waiting Payment") {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  } else {
    if (
      orderStatus === "Delivering" ||
      orderStatus === "Completed" ||
      orderStatus === "Void"
    ) {
      if (orderType === "void") {
        await updateOrderedProd(products, estoreid, true);
      } else {
        await updateOrderedProd(products, estoreid, false);
      }
    }
  }
};

exports.updateOrderStatus = async (req, res) => {
  let checkProdQty = {};
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, orderStatus, statusHistory, orderType, orderedBy } =
    req.body;

  try {
    const user = await User.findOne({ email }).exec();
    const orderedUser = await User.findOne({
      _id: new ObjectId(orderedBy),
    }).exec();
    if (user) {
      const orderForChecking = await Order.findOne({
        _id: new ObjectId(orderid),
        orderedBy: new ObjectId(orderedBy),
        estoreid: Object(estoreid),
      });

      const estore = await Estore.findOne({
        _id: Object(estoreid),
      });

      const statusEstore =
        estore && estore.orderStatus ? estore.orderStatus : "Delivering";

      if (statusEstore === "Not Processed") {
        if (
          orderType === "web" &&
          orderStatus !== "Cancelled" &&
          orderStatus !== "Completed" &&
          orderStatus !== "Delivering" &&
          orderStatus !== "Processing" &&
          orderStatus !== "Waiting Payment" &&
          orderStatus !== "Not Processed"
        ) {
          checkProdQty = await checkOrderedProd(
            orderForChecking.products,
            estoreid
          );
        }
      } else if (statusEstore === "Waiting Payment") {
        if (
          orderType === "web" &&
          orderStatus !== "Cancelled" &&
          orderStatus !== "Completed" &&
          orderStatus !== "Delivering" &&
          orderStatus !== "Processing" &&
          orderStatus !== "Waiting Payment"
        ) {
          checkProdQty = await checkOrderedProd(
            orderForChecking.products,
            estoreid
          );
        }
      } else if (statusEstore === "Processing") {
        if (
          orderType === "web" &&
          orderStatus !== "Cancelled" &&
          orderStatus !== "Completed" &&
          orderStatus !== "Delivering" &&
          orderStatus !== "Processing"
        ) {
          checkProdQty = await checkOrderedProd(
            orderForChecking.products,
            estoreid
          );
        }
      } else if (statusEstore === "Delivering") {
        if (
          orderType === "web" &&
          orderStatus !== "Cancelled" &&
          orderStatus !== "Completed" &&
          orderStatus !== "Delivering"
        ) {
          checkProdQty = await checkOrderedProd(
            orderForChecking.products,
            estoreid
          );
        }
      } else {
        if (
          orderType === "web" &&
          orderStatus !== "Cancelled" &&
          orderStatus !== "Completed"
        ) {
          checkProdQty = await checkOrderedProd(
            orderForChecking.products,
            estoreid
          );
        }
      }

      if (checkProdQty && checkProdQty.err) {
        res.json({ err: checkProdQty.err, backToCart: true });
      } else {
        const order = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(orderid),
            orderedBy: new ObjectId(orderedBy),
            estoreid: Object(estoreid),
          },
          {
            orderStatus,
            statusHistory,
          },
          { new: true }
        );
        if (order) {
          res.json(order);

          if (orderType === "web" && orderStatus === statusEstore) {
            await updateOrderedProd(order.products, estoreid, true);
          }
          if (orderType === "web" && order.orderStatus === "Completed") {
            createRaffle(estoreid, orderedUser, order);
          }
          if (orderStatus === "Cancelled") {
            removeUpdates(
              estoreid,
              statusEstore,
              orderType,
              orderStatus,
              order.products
            );
          }
        } else {
          res.json({ err: "Order does not exist." });
        }
      }
    } else {
      res.json({ err: "Cannot update the order status." });
    }
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
  }
};

exports.updatePaidOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, orderStatus, statusHistory } = req.body;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: Object(estoreid),
        },
        {
          orderStatus,
          statusHistory,
        },
        { new: true }
      );
      if (order) {
        res.json(order);
      } else {
        res.json({ err: "Order does not exist." });
      }
    }
  } catch (error) {
    res.json({ err: "Updating paid order status fails. " + error.message });
  }
};

exports.updateCustomDetails = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, customDetails, customDetails2 } = req.body;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: new Object(estoreid),
        },
        {
          customDetails,
          customDetails2,
        },
        { new: true }
      );
      if (order) {
        res.json(order);
      } else {
        res.json({ err: "Order does not exist." });
      }
    } else {
      res.json({ err: "Cannot update the order custom details." });
    }
  } catch (error) {
    res.json({ err: "Updating order custom details fails. " + error.message });
  }
};

exports.updateProductRating = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, products } = req.body;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          estoreid: new Object(estoreid),
        },
        {
          products,
        },
        { new: true }
      );
      if (order) {
        res.json(order);
      } else {
        res.json({ err: "Order does not exist." });
      }
    } else {
      res.json({ err: "Cannot update the order product details." });
    }
  } catch (error) {
    res.json({ err: "Updating order product details fails. " + error.message });
  }
};

exports.voidProducts = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const customer = req.body.customer;
  const voidName = req.body.voidName;
  const products = req.body.products;
  const total = req.body.total;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const newOrder = new Order({
        orderType: "void",
        products: products.map((prod) => ({
          product: new ObjectId(prod._id),
          count: prod.quantity,
          supplierPrice: prod.supplierPrice,
          price: prod.price,
        })),
        orderStatus: "Void",
        cartTotal: total,
        createdBy: user._id,
        orderedBy: customer && customer._id ? customer._id : user._id,
        orderedName: customer.name || voidName || user.name,
        estoreid: new ObjectId(estoreid),
      });

      const order = await newOrder.save();
      if (order) {
        await Order.findByIdAndUpdate(order._id, {
          orderCode: order._id.toString().slice(-12),
        }).exec();

        await updateOrderedProd(order.products, estoreid, false);
      }
      res.json({ ok: true });
    }
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
  }
};

exports.editOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.body.orderid;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOne({
        _id: new ObjectId(orderid),
        estoreid: new ObjectId(estoreid),
      }).exec();
      if (order) {
        const productsForCart = order.products.map((prod) => ({
          product: prod.product,
          count: prod.count,
          excess: prod.excess,
          supplierPrice: prod.supplierPrice,
          price: prod.price,
        }));
        const productsForRes = [];
        for (i = 0; i < order.products.length; i++) {
          const result = await Product.findOne({
            _id: new ObjectId(order.products[i].product),
          })
            .populate("category")
            .populate("brand")
            .exec();
          productsForRes.push({
            ...result._doc,
            count: order.products[i].count,
          });
        }
        await Cart.deleteMany({
          orderedBy: user._id,
          estoreid: new ObjectId(estoreid),
        }).exec();

        Cart.collection.insertOne({
          estoreid: new ObjectId(estoreid),
          products: productsForCart,
          cartTotal: order.cartTotal,
          orderedBy: user._id,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        });
        res.json(productsForRes);
      } else {
        res.json({ err: "Cannot fetch the order." });
      }
    } else {
      res.json({ err: "Cannot fetch the user." });
    }
  } catch (error) {
    res.json({ err: "Editing order fails. " + error.message });
  }
};

exports.submitEditOrder = async (req, res) => {
  const orderid = req.body.orderid;
  const delfee = req.body.delfee;
  const discount = req.body.discount;
  const servefee = req.body.servefee;
  const paymentOption = req.body.paymentOption;
  const deliveryPrefer = req.body.deliveryPrefer;
  const deliverInstruct = req.body.deliverInstruct;
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const cart = await Cart.findOne({
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });
      const checkProdQty = await checkOrderedProd(cart.products, estoreid);

      if (checkProdQty && checkProdQty.err) {
        res.json({ err: checkProdQty.err, backToCart: true });
      } else {
        const order = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(orderid),
            estoreid: Object(estoreid),
          },
          {
            products: cart.products,
            cartTotal: cart.cartTotal,
            delfee,
            discount,
            servefee,
            paymentOption: new ObjectId(paymentOption),
            deliveryPrefer,
            deliverInstruct,
          },
          { new: true }
        );
        if (order) {
          await Cart.deleteMany({
            orderedBy: user._id,
            estoreid: Object(estoreid),
          });
        }
        res.json({ ok: true });
      }
    } else {
      res.json({ err: "Cannot fetch the cart details." });
    }
  } catch (error) {
    res.json({ err: "Updating order fails. " + error.message });
  }
};

exports.deleteAdminOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const orderid = req.params.orderid;

  try {
    const order = await Order.findOneAndDelete({
      _id: new ObjectId(orderid),
      estoreid: Object(estoreid),
    });
    if (order.orderStatus !== "Cancelled") {
      const estore = await Estore.findOne({
        _id: Object(estoreid),
      });
      const statusEstore =
        estore && estore.orderStatus ? estore.orderStatus : "Delivering";
      removeUpdates(
        estoreid,
        statusEstore,
        order.orderType,
        order.orderStatus,
        order.products
      );
    }
    res.json(order);
  } catch (error) {
    res.json({ err: "Deleting order fails. " + error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const orderid = req.params.orderid;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndDelete({
        _id: new ObjectId(orderid),
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });
      res.json(order);
    } else {
      res.json({ err: "Cannot delete the order." });
    }
  } catch (error) {
    res.json({ err: "Deleting order fails. " + error.message });
  }
};
