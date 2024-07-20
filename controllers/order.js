const ObjectId = require("mongoose").Types.ObjectId;
const md5 = require("md5");

const User = require("../models/user");
const Cart = require("../models/cart");
const Product = require("../models/product");
const Order = require("../models/order");
const Estore = require("../models/estore");
const { createRaffle } = require("./common");

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
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
        .exec();

      const countOrder = await Order.find(searchObj).exec();

      res.json({ orders, count: countOrder.length });
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

  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery, status } =
      req.body;

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
      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
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
      orders = await Order.find(searchObj)
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .populate("products.product")
        .populate("orderedBy")
        .populate("paymentOption")
        .exec();
    }

    const countOrder = await Order.find(searchObj).exec();

    res.json({ orders, count: countOrder.length });
  } catch (error) {
    res.json({ err: "Fetching orders failed. " + error.message });
  }
};

exports.adminSales = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const dates = req.body.dates;
  let capital = 0;
  const startDate = new Date(
    new Date(dates.dateStart).setHours(new Date(dates.dateStart).getHours() + 8)
  );
  const endDate = new Date(
    new Date(dates.endDate).setHours(new Date(dates.endDate).getHours() + 8)
  );

  startDate.setDate(startDate.getDate() - 1);

  try {
    const orders = await Order.find({
      estoreid: Object(estoreid),
      orderStatus: "Completed",
      createdAt: {
        $gte: new Date(new Date(startDate).setHours(16, 0o0, 0o0)),
        $lte: new Date(new Date(endDate).setHours(15, 59, 59)),
      },
    }).exec();

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
      await Cart.deleteMany({
        orderedBy: user._id,
        estoreid: new ObjectId(estoreid),
      }).exec();
      let excessQuantity = 0;
      let remainingQuantity = 0;
      let exceedProdTitle = "";
      for (let i = 0; i < cart.length; i++) {
        let object = {};

        object.product = cart[i]._id;
        object.count = cart[i].count;

        const productFromDb = await Product.findOne({
          _id: new ObjectId(cart[i]._id),
          estoreid: new ObjectId(estoreid),
        })
          .select("title supplierPrice price wprice wcount quantity segregate")
          .exec();
        object.supplierPrice = productFromDb.supplierPrice;
        let price = 0;
        if (cart[i].priceChange) {
          price = cart[i].price;
        } else {
          if (
            productFromDb.wprice &&
            productFromDb.wprice > 0 &&
            cart[i].count >= productFromDb.wcount
          ) {
            price = productFromDb.wprice;
          } else {
            price = productFromDb.price;
          }
        }
        object.price = price;
        cart[i] = { ...cart[i], price };

        products.push(object);

        remainingQuantity = productFromDb.quantity;

        if (
          !productFromDb.segregate &&
          (!productFromDb.quantity || productFromDb.quantity < object.count)
        ) {
          excessQuantity = productFromDb.quantity;
          exceedProdTitle = productFromDb.title;
        }
      }
      if (excessQuantity === 0 && remainingQuantity > 0) {
        let cartTotal = 0;
        for (let i = 0; i < products.length; i++) {
          products[i].product = new ObjectId(products[i].product);
          cartTotal = cartTotal + products[i].price * products[i].count;
        }

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
          err: exceedProdTitle + " has " + excessQuantity + " in stock only",
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
    });

    const order = await newOrder.save();

    if (order) {
      res.json(order);
      await Cart.deleteMany({
        orderedBy: user._id,
        estoreid: Object(estoreid),
      });
      if (orderType === "pos" && order.orderStatus === "Completed") {
        order.products.forEach(async (prod) => {
          const result = await Product.findOneAndUpdate(
            {
              _id: new ObjectId(prod.product),
              estoreid: Object(estoreid),
            },
            { $inc: { quantity: -prod.count, sold: prod.count } },
            { new: true }
          );
          if (result.quantity <= 0) {
            const newQuantity =
              result && result.waiting && result.waiting.newQuantity
                ? result.waiting.newQuantity
                : 0;

            const newSupplierPrice =
              result && result.waiting && result.waiting.newSupplierPrice
                ? result.waiting.newSupplierPrice
                : result.supplierPrice;

            const newPrice =
              newSupplierPrice + (newSupplierPrice * result.markup) / 100;

            await Product.findOneAndUpdate(
              {
                _id: new ObjectId(prod.product),
                estoreid: Object(estoreid),
              },
              {
                quantity: newQuantity,
                supplierPrice: newSupplierPrice,
                price: newPrice,
                waiting: {},
              },
              { new: true }
            );
          }
        });

        const estore = await Estore.findOne({
          _id: new ObjectId(estoreid),
        }).exec();

        const date1 = new Date(estore.raffleDate);
        const date2 = new Date();
        const timeDifference = date1.getTime() - date2.getTime();
        const daysDifference = Math.round(timeDifference / (1000 * 3600 * 24));

        if (
          user.role === "customer" &&
          estore.raffleActivation &&
          daysDifference > 0
        ) {
          createRaffle(
            estoreid,
            user._id,
            order._id,
            estore.raffleDate,
            estore.raffleEntryAmount,
            order.cartTotal
          );
        }
      }
    } else {
      res.json({ err: "Cannot save the order." });
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;
  const { orderid, orderStatus, orderPastStat, orderType, orderedBy } =
    req.body;

  try {
    const user = await User.findOne({ email }).exec();
    if (user) {
      const order = await Order.findOneAndUpdate(
        {
          _id: new ObjectId(orderid),
          orderedBy: new ObjectId(orderedBy),
          estoreid: Object(estoreid),
        },
        {
          orderStatus,
        },
        { new: true }
      );
      if (order) {
        res.json(order);
        if (orderType === "web" && orderStatus === "Delivering") {
          order.products.forEach(async (prod) => {
            const result = await Product.findOneAndUpdate(
              {
                _id: new ObjectId(prod.product),
                estoreid: Object(estoreid),
              },
              { $inc: { quantity: -prod.count, sold: prod.count } },
              { new: true }
            );
            if (result.quantity <= 0) {
              const newQuantity =
                result && result.waiting && result.waiting.newQuantity
                  ? result.waiting.newQuantity
                  : 0;

              const newSupplierPrice =
                result && result.waiting && result.waiting.newSupplierPrice
                  ? result.waiting.newSupplierPrice
                  : result.supplierPrice;

              const newPrice =
                newSupplierPrice + (newSupplierPrice * result.markup) / 100;

              await Product.findOneAndUpdate(
                {
                  _id: new ObjectId(prod.product),
                  estoreid: Object(estoreid),
                },
                {
                  quantity: newQuantity,
                  supplierPrice: newSupplierPrice,
                  price: newPrice,
                  waiting: {},
                },
                { new: true }
              );
            }
          });
        }
        if (orderType === "web" && order.orderStatus === "Completed") {
          const estore = await Estore.findOne({
            _id: new ObjectId(estoreid),
          }).exec();

          const date1 = new Date(estore.raffleDate);
          const date2 = new Date();
          const timeDifference = date1.getTime() - date2.getTime();
          const daysDifference = Math.round(
            timeDifference / (1000 * 3600 * 24)
          );

          if (estore.raffleActivation && daysDifference > 0) {
            createRaffle(
              estoreid,
              order.orderedBy,
              order._id,
              estore.raffleDate,
              estore.raffleEntryAmount,
              order.cartTotal
            );
          }
        }
        if (
          orderType === "web" &&
          orderStatus === "Cancelled" &&
          orderPastStat === "Delivering"
        ) {
          order.products.forEach(async (prod) => {
            await Product.findOneAndUpdate(
              {
                _id: new ObjectId(prod.product),
                estoreid: Object(estoreid),
              },
              { $inc: { quantity: prod.count, sold: -prod.count } },
              { new: true }
            );
          });
        }
      } else {
        res.json({ err: "Order does not exist." });
      }
    } else {
      res.json({ err: "Cannot update the order status." });
    }
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
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
      res.json({ err: "Cannot update the order status." });
    }
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
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

        for (let i = 0; i < products.length; i++) {
          await Product.findOneAndUpdate(
            {
              _id: new ObjectId(products[i]._id),
              estoreid: new ObjectId(estoreid),
            },
            {
              $inc: {
                quantity: products[i].quantity,
                sold: -products[i].quantity,
              },
            },
            { new: true }
          );
        }
      }
      res.json({ ok: true });
    }
  } catch (error) {
    res.json({ err: "Receiving product failed. " + error.message });
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
    if (
      order.orderStatus === "Delivering" ||
      order.orderStatus === "Completed" ||
      order.orderStatus === "Void"
    ) {
      order.products.forEach(async (prod) => {
        if (order.orderType === "void") {
          await Product.findOneAndUpdate(
            {
              _id: new ObjectId(prod.product),
              estoreid: Object(estoreid),
            },
            { $inc: { quantity: -prod.count, sold: prod.count } },
            { new: true }
          );
        } else {
          await Product.findOneAndUpdate(
            {
              _id: new ObjectId(prod.product),
              estoreid: Object(estoreid),
            },
            { $inc: { quantity: prod.count, sold: -prod.count } },
            { new: true }
          );
        }
      });
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
