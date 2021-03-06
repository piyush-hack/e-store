const express = require("express");
const app = express();
const router = express.Router();
const Product = require("../models/productModel");
const Profile = require("../models/sellerModel");
const USERProfile = require("../models/profileModel");
const ShopProduct = require("../models/shoppingModel");
const SellerNoti = require("../middleware/seller_noti");
const BuyerNoti = require("../middleware/buyer_noti");
const Razorpay = require("razorpay");

const auth = require("../middleware/auth");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const multiparty = require("connect-multiparty");
const sellerModel = require("../models/sellerModel");
const productModel = require("../models/productModel");
app.use(express.static("uploads"));

router.get("/products", async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const startindex = (page - 1) * limit;
  const posts = await Product.find({ active: true }).exec();
  res.send(posts);
});

router.route("/getProductsByLimit").get(async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const startindex = (page - 1) * limit;
  const posts = await Product.find({ active: true })
    .limit(limit)
    .skip(startindex)
    .exec();
  res.send(posts);
});

router.route("/IdProduct/:id").get((req, res) => {
  Product.findOne({ _id: req.params.id, active: true }, (err, result) => {
    if (err) return res.status(403).send(err);
    return res.send(result);
  });
});

router.route("/getProdImg/:id").get((req, res) => {
  Product.findOne(
    { _id: req.params.id, active: true },
    "coverImage",
    (err, result) => {
      if (err) return res.status(403).send(err);
      return res.send(result);
    }
  );
});

router.route("/SellerProduct/:username").get((req, res) => {
  Product.find(
    { username: req.params.username, active: true },
    (err, result) => {
      if (err) return res.status(403).send(err);
      return res.json(result);
    }
  );
});

router.route("/SellerProductByLimit/:username").get(async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const startindex = (page - 1) * limit;

  try {
    var prods = await Product.find({
      username: req.params.username,
      active: true,
    })
      .limit(limit)
      .skip(startindex)
      .exec();

    res.json({ productsByLimit: prods });
  } catch (error) {
    res.json({ err: error });
  }
});

router.route("/getOtherProduct").get(auth, (req, res) => {
  Product.find(
    { username: { $ne: req.user.username }, active: true },
    (err, result) => {
      if (err) return res.json(err);
      return res.json({ data: result });
    }
  );
});

router.route("/getOtherProductByLimit").get(auth, async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  const startindex = (page - 1) * limit;

  try {
    var prods = await Product.find({
      username: { $ne: req.user.username },
      active: true,
    })
      .limit(limit)
      .skip(startindex)
      .exec();
    res.json({ otherprodsByLimit: prods });
  } catch (error) {
    res.json({ err: error });
  }
});

router.route("/AddToCart").post(auth, async (req, res) => {
  if (req.user.role != "basic") {
    return res
      .status(404)
      .send({ msg: "Login as customer to add products to cart" });
  }

  try {
    const { product_id, count } = req.body;
    const product_details = await Product.findOne({
      _id: product_id,
      active: true,
    });
    // console.log(product_details);
    // return res.json({ product: product_details });
    const query = { username: req.user.username };
    const update = {
      $push: {
        cart: {
          product_id: product_id,
          seller_username: product_details.username,
          product_name: product_details.productname,
          product_count: count,
        },
      },
    };
    // const options = { upsert: true };
    const userProfile = await USERProfile.findOne(query);

    if (userProfile === null) {
      const user = await USERProfile({
        username: req.user.username,
        cart: [
          {
            product_id: product_id,
            seller_username: product_details.username,
            product_name: product_details.productname,
            product_count: count,
          },
        ],
      }).save();
      console.log(user);
      return res.json({
        msg: "Product Added to empty previously Empty Profile",
      });
    } else {
      if (
        userProfile.cart.length === 0 ||
        product_details.username === userProfile.cart[0].seller_username
      ) {
        await USERProfile.updateOne(query, update);
        return res.json({ msg: "Added to previously filled/empty Cart" });
      } else {
        const update = {
          $set: {
            cart: {
              product_id: product_id,
              seller_username: product_details.username,
              product_name: product_details.productname,
              product_count: count,
            },
          },
        };
        await USERProfile.updateOne(query, update);
        return res.json({ msg: "Removed previous items and updated to cart" });
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(402).send({ error });
  }
});

router.route("/RemoveFromCart").post(auth, async (req, res) => {
  if (req.user.role != "basic") {
    return res
      .status(404)
      .send({ msg: "Login as customer to remove products from cart" });
  }
  try {
    const { product_id, count } = req.body;
    const query = {
      username: req.user.username,
      "cart.product_id": product_id,
    };
    const update = {
      $set: {
        cart: {
          product_id: product_id,
          product_count: count,
        },
      },
    };
    const user = await USERProfile.findOne(query);

    if (!user) throw "Given Product is missing in the cart";
    else if (
      user.cart.filter((c) => c.product_id === product_id)[0].product_count <=
      count
    )
      throw "Removal count is greater than current count";
    await USERProfile.findOneAndUpdate(query, update);
    return res.json({ msg: "Cart Updated" });
  } catch (error) {
    console.log(error);
    return res.status(402).send({ error });
  }
});

//----------------------Pay For Product---------------------------
const razorpayInstance = new Razorpay({
  key_id: "rzp_test_O7q0EhSlhM8o2B", // your `KEY_ID`
  key_secret: "U4iA3CaZoEwZEP8lXa4OVid6", // your `KEY_SECRET`
});

router.post("/createOrder", (req, res) => {
  // STEP 1:
  params = req.body;
  razorpayInstance.orders
    .create(params)
    .then((data) => {
      res.send({ sub: data, status: "success" });
    })
    .catch((error) => {
      res.send({ sub: error, status: "failed" });
    });
});

router.post("/verifyOrder", auth, async (req, res) => {
  body =
    req.body.paymentmethod.razorpay_order_id +
    "|" +
    req.body.paymentmethod.razorpay_payment_id;
  var crypto = require("crypto");
  var expectedSignature = crypto
    .createHmac("sha256", "U4iA3CaZoEwZEP8lXa4OVid6")
    .update(body.toString())
    .digest("hex");
  console.log("sig" + req.body.paymentmethod.razorpay_signature);
  console.log("sig" + expectedSignature);
  var response = { status: "failure" };

  if (expectedSignature === req.body.paymentmethod.razorpay_signature) {
    response = { status: "success" };

    req.body.paymentmethod.rzr_pay_status = response;
    req.body.paymentmethod.pay_status = "pending";

    try {
      const Buy_Item = ShopProduct({
        buyerid: req.user._id,
        buyername: req.user.username,
        ...req.body,
      });

      Buy_Item.save().then(async (result) => {
        var noti_to_seller = await SellerNoti(
          req.body.sellername,
          "order",
          "Product Has Been Requested by " + req.user.username
        );
        var noti_to_buyer = await BuyerNoti(
          req.user.username,
          "order",
          "Product Requested waiting For Shop To Accept Your Order"
        );
        res.json({ data: result, res: response });
      });
    } catch (error) {
      console.log(error);
      return res.status(402).send({ error });
    }
  }
});

//---------------------------------------------------------------------

router.route("/buyProduct").post(auth, async (req, res) => {
  if (req.user.role != "basic") {
    return res
      .status(404)
      .send({ msg: "Login as customer to buy products to cart" });
  }

  try {
    const Buy_Item = ShopProduct({
      buyerid: req.user._id,
      buyername: req.user.username,
      ...req.body,
    });

    Buy_Item.save().then(async (result) => {
      var noti_to_seller = await SellerNoti(
        req.body.sellername,
        "order",
        "Product Has Been Requested by " + req.user.username
      );
      var noti_to_buyer = await BuyerNoti(
        req.user.username,
        "order",
        "Product Requested waiting For Shop To Accept Your Order"
      );
      res.json({ data: result });
    });
  } catch (error) {
    console.log(error);
    return res.status(402).send({ error });
  }
});

router.route("/filterProductByCategory").post(async (req, res) => {
  try {
    const { category } = req.body;
    const productsByCategory = await Product.find({ category, active: true });
    if (productsByCategory.length === 0) throw "No Products of this Category";
    return res.json({ productsByCategory });
  } catch (e) {
    return res.status(402).send({ error: e });
  }
});

router.post("/addProductReview", auth, async (req, res) => {
  if (req.user.role != "basic") {
    return res.status(404).send({ msg: "Login as customer to give a review" });
  }
  try {
    const { _id } = req.user;
    const { product_id, ratings, comments } = req.body;
    const query = { _id: product_id, active: true };
    const update = {
      $addToSet: {
        reviews: {
          customer_id: _id,
          ratings,
          comments,
        },
      },
    };
    const options = { new: true };
    await Product.findOneAndUpdate(query, update, options, (err, product) => {
      if (err) return res.status(500).send(err);
      const response = {
        message: "Product Review added",
        data: product,
      };
      return res.status(200).send(response);
    });
  } catch (error) {
    return res.status(402).json({ error });
  }
});

router.post("/getRatings", async (req, res) => {
  try {
    const { product_id } = req.body;
    const product = await Product.findOne({ _id: product_id, active: true });
    const length = product.reviews.length;
    if (length === 0) res.json({ msg: "No Reviews" });
    const avg_reviews =
      product.reviews.reduce((prev, curr) => prev + curr.ratings, 0) / length;
    res.json({ avg_reviews, length });
  } catch (error) {
    return res.status(402).json({ error });
  }
});

router.post("/updateProductReview", auth, async (req, res) => {
  if (req.user.role != "basic") {
    return res.status(404).send({ msg: "Login as customer to give a review" });
  }
  try {
    const { _id } = req.user;
    const { product_id, ratings, comments } = req.body;
    await SellerProfile.findOneAndUpdate(
      { _id: product_id, "reviews.customer_id": _id, active: true },
      {
        $set: { "reviews.$.ratings": ratings, "reviews.$.comments": comments },
      },
      { new: true },
      function (err, product) {
        if (err) return res.status(500).send(err);
        const response = {
          message: "Product Review Updated",
          data: product,
        };
        return res.status(200).send(response);
      }
    );
  } catch (error) {
    return res.send(401).json({ error });
  }
});

module.exports = router;
