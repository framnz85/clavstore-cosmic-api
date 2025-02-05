const ObjectId = require("mongoose").Types.ObjectId;

const Order = require("../../models/order");
const User = require("../../models/user");
const Estore = require("../../models/estore");
const Product = require("../../models/product");
const {
  createRaffle,
  checkOrderedProd,
  updateOrderedProd,
} = require("./common");

exports.getPosOrders = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const page = req.body.page;
  const limit = req.body.page;
  const email = req.user.email;
  let orders = [];

  try {
    const user = await User.findOne({ email }).exec();
    if (user.role === "cashier") {
      orders = await Order.find({
        estoreid: new ObjectId(estoreid),
        orderType: "pos",
        createdBy: user._id,
      })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();
    } else {
      orders = await Order.find({
        estoreid: new ObjectId(estoreid),
        orderType: "pos",
      }).exec();
    }

    res.json(orders);
  } catch (error) {
    res.json({ err: "Getting all orders failed." + error.message });
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
      let waitingProduct = { title: "", quantity: 0 };
      for (let i = 0; i < cart.length; i++) {
        let object = {};

        object.product = cart[i].product;
        object.count = cart[i].count;
        object.excess = cart[i].excess ? true : false;

        const productFromDb = await Product.findOne({
          _id: new ObjectId(cart[i].product),
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

        if (
          productFromDb &&
          productFromDb.segregate &&
          productFromDb.quantity < object.count
        ) {
          object.excessCount =
            parseFloat(object.count) - parseFloat(productFromDb.quantity);
        }

        products.push(productFromDb);

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
        res.json({ cart, products });
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

exports.saveOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  const orderStatus = req.body.orderStatus;
  const cartTotal = req.body.cartTotal;
  const discount = req.body.discount;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const products = req.body.products;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;
  const orderNotes = req.body.orderNotes;

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

    const checkProdQty = await checkOrderedProd(products, estoreid);

    if (checkProdQty && checkProdQty.err) {
      res.json({ err: checkProdQty.err, backToCart: true });
    } else {
      const newOrder = new Order({
        orderType: "pos",
        orderStatus,
        statusHistory: [
          {
            status: orderStatus,
            remarks: "Order was created.",
            date: new Date(),
          },
        ],
        cartTotal,
        discount,
        addDiscount,
        cash,
        createdBy: user._id,
        orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
        orderedName: customerName || user.name,
        estoreid: new ObjectId(estoreid),
        orderNotes,
        products,
      });

      const order = await newOrder.save();

      if (order) {
        let newProducts = [];

        const updatedOrder = await Order.findOneAndUpdate(
          {
            _id: new ObjectId(order._id),
            estoreid: new ObjectId(estoreid),
          },
          { orderCode: order._id.toString().slice(-12) },
          { new: true }
        );

        await updateOrderedProd(order.products, estoreid, true);
        createRaffle(estoreid, user, order);

        const orderProducts = order.products;

        for (i = 0; i < orderProducts.length; i++) {
          const result = await Product.findOne({
            _id: new ObjectId(orderProducts[i].product),
            estoreid: Object(estoreid),
          }).exec();
          if (result && result._id) {
            newProducts.push(result);
          }
        }

        await Estore.findOneAndUpdate(
          {
            _id: new ObjectId(estoreid),
          },
          {
            productChange: new Date().valueOf(),
            orderChange: new Date().valueOf(),
          },
          { new: true }
        );

        res.json({ order: updatedOrder, newProducts });
      } else {
        res.json({ err: "Cannot save the order." });
      }
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.sendOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const email = req.user.email;

  const orderStatus = req.body.orderStatus;
  const cartTotal = req.body.cartTotal;
  const discount = req.body.discount;
  const addDiscount = req.body.addDiscount;
  const cash = req.body.cash;
  const products = req.body.products;

  const orderedBy = req.body.orderedBy;
  const customerName = req.body.customerName;
  const customerPhone = req.body.customerPhone;
  const customerEmail = req.body.customerEmail;
  const orderNotes = req.body.orderNotes;

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

    const newOrder = new Order({
      orderType: "pos",
      orderStatus,
      cartTotal,
      discount,
      addDiscount,
      cash,
      createdBy: user._id,
      orderedBy: checkUser && checkUser._id ? checkUser._id : user._id,
      orderedName: customerName || user.name,
      estoreid: new ObjectId(estoreid),
      orderNotes,
      products,
    });

    const order = await newOrder.save();

    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        orderCode: order._id.toString().slice(-12),
      }).exec();

      await Estore.findByIdAndUpdate(estoreid, {
        orderChange: new Date().valueOf(),
        productChange: new Date().valueOf(),
      }).exec();

      res.json(order);
    }
  } catch (error) {
    res.json({ err: "Saving cart to order fails. " + error.message });
  }
};

exports.updateOrder = async (req, res) => {
  const estoreid = req.headers.estoreid;

  const orderid = req.body.orderid;
  const orderStatus = req.body.orderStatus;

  try {
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: new ObjectId(orderid),
        estoreid: new ObjectId(estoreid),
      },
      { orderStatus },
      { new: true }
    );

    await Estore.findOneAndUpdate(
      {
        _id: new ObjectId(estoreid),
      },
      { orderChange: new Date().valueOf() },
      { new: true }
    );

    res.json(updatedOrder);
  } catch (error) {
    res.json({ err: "Updating order status fails. " + error.message });
  }
};
