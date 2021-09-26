const express = require("express");
const app = express();
const router = express.Router();
const Product = require("../models/productModel");
const Profile = require("../models/sellerModel");
const USERProfile = require("../models/profileModel");
const ShopProduct = require("../models/shoppingModel");
const auth = require("../middleware/auth");
const SellerNoti = require("../middleware/seller_noti");
const BuyerNoti = require("../middleware/buyer_noti");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const multiparty = require("connect-multiparty");
app.use(express.static("uploads"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // cb(null, "./noncompress");
    cb(null, "./uploads/products");
  },
  filename: (req, file, cb) => {
    cb(null, req.params.id + path.extname(file.originalname));
  },
});

// path.extname(file.originalname)
const upload = multer({
  storage: storage,
});

router.route("/").get(auth, (req, res) => {
  if (req.user.roll != "admin") {
    return res
      .status(404)
      .send({ msg: "You can't add profile create a seller account" });
  }
  res.send(req.user.username);
});

router
  .route("/add/coverImage/:id")
  .patch(auth, upload.single("coverImage"), async (req, res) => {
    console.log("upload image");
    // await compress(req.file.filename);

    Product.findOneAndUpdate(
      { _id: req.params.id },
      {
        $set: {
          coverImage: req.file.filename,
        },
      },
      { new: true },
      (err, result) => {
        if (err) {
          console.log(err);
        }
        return res.json(result);
      }
    );
  });

router.route("/Add").post(auth, (req, res) => {
  if (req.user.roll != "admin") {
    return res
      .status(404)
      .send({ msg: "You can't add profile create a seller account" });
  }
  // console.log(req.user);
  // console.log(req.body);
  const { username } = req.user;
  const {
    productname,
    productmetadescription,
    productdescription,
    price,
    sellprice,
    variation,
    inventory,
    Item_Returnable,
    category,
  } = req.body;
  const Item = Product({
    productname,
    username,
    productmetadescription,
    productdescription,
    price,
    sellprice,
    variation,
    inventory,
    Item_Returnable,
    category,
  });
  Item.save()
    .then((result) => {
      res.json({ data: result });
    })
    .catch((err) => {
      console.log(err), res.json({ err: err });
    });
});

router.route("/getOwnProducts").get(auth, (req, res) => {
  if (req.user.roll != "admin") {
    return res.status(404).send({ msg: "create a seller account to view" });
  }
  Product.find({ username: req.user.username }, (err, result) => {
    if (err) return res.json(err);
    return res.json(result);
  });
});

router.route("/getByLimit").get(async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);

  const startindex = (page - 1) * limit;
  const posts = await Product.find({ username: req.user.username })
    .limit(limit)
    .skip(startindex)
    .exec();
  res.send(posts);
});

router.route("/deleteSellerProduct/:id").delete(auth, (req, res) => {
  if (req.user.roll != "admin") {
    return res.status(404).send({ msg: "create a seller account to view" });
  }

  Product.findOneAndDelete(
    {
      $and: [{ username: req.user.username }, { _id: req.params.id }],
    },
    (err, result) => {
      if (err) return res.json(err);
      else if (result) {
        console.log(result);
        return res.json("Product deleted");
      }
      return res.json("Product not deleted");
    }
  );
});

router.route("/editProductDetails").post(auth, (req, res) => {
  if (req.user.roll != "admin") {
    return res
      .status(404)
      .send({ msg: "You can't add profile create a seller account" });
  }

  Product.findOneAndUpdate(
    { _id: req.body.id },
    {
      $set: {
        username: req.user.username,
        user_id: req.user._id,
        ...req.body,
      },
    },
    { new: true },
    (err, result) => {
      if (err) {
        console.log(err);
      }
      return res.json(result);
    }
  );
});

router.route("/active/").post(auth, (req, res) => {
  Product.findOneAndUpdate(
    { _id: req.body.id },
    {
      $set: {
        active: req.body.active,
      },
    },
    (err, result) => {
      if (err) return res.json(err);
      return res.json({ data: result });
    }
  );
});

router.post("/updateStatus", auth, async (req, res) => {
  if (req.user.roll != "admin") {
    return res.status(404).send({ msg: "Login to update order status" });
  }

  const { order_id, status } = req.body;
  await ShopProduct.findOneAndUpdate(
    {
      _id: order_id,
      $and: [{ status: { $ne: "cancelled" } }, { status: { $ne: "rejected" } }],
    },
    { status },
    { new: true, runValidators: true }
  )
    .then((updatedOrder) => {
      if (!updatedOrder)
        return res
          .status(402)
          .json({ error: "Order has been rejected/cancelled" });
      // var noti_to_seller = SellerNoti(
      //   req.user._id,
      //   "Product Status Has been updated to " + status
      // );
      // var noti_to_buyer = BuyerNoti(
      //   updatedOrder.buyerid,
      //   "Product has been " + status + " by the seller"
      // );
      return res.send({ updatedOrder });
    })
    .catch((error) => {
      if (error.errors) return res.status(403).json({ error: error.errors });
      else res.status(404).json({ error: "No order found" });
    });
});

router.get("/getBuyersList", auth, async (req, res) => {
  if (req.user.roll != "admin") {
    return res.status(404).send({ msg: "Login to see buyers' list" });
  }
  try {
    const { username } = req.user;
    const seller = await Profile.findOne({ username });
    // console.log(seller);
    const buyersList = await ShopProduct.find(
      { sellerid: seller._id },
      { buyerid: 1, buyername: 1, buyerphone: 1, date: 1, _id: 0 }
    );
    if (!buyersList || buyersList.length === 0) throw "No Buyers";
    // console.log(buyersList);
    return res.json({ buyersList });
  } catch (error) {
    return res.status(403).json({ error });
  }
});

module.exports = router;
