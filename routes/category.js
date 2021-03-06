const express = require("express");
const router = express.Router();
const Category = require("../models/categoryModel");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, files, cb) => {
    cb(null, "./uploads/category");
  },
  filename: (req, file, cb) => {
    // console.log(file);
    cb(null, file.originalname);
  },
});

const filefilter = (req, file, cb) => {
  if (file.mimetype == "image/jpeg" || file.mimetype == "image/png") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,

  filefilter,
});

router.post("/category", upload.single("image"), async (req, res) => {
  const { category } = req.body;
  const path = req.file.path.split("uploads")[1];

  const categoryData = new Category({
    category_name: category,
    category_image: path,
  });

  await categoryData
    .save()
    .then((response) => {
      // console.log(response);
      return res.json({ category: response });
    })
    .catch((err) => {
      console.log(err);
      if (Object.keys(err.keyPattern)[0] === "category_image")
        return res.status(403).json({ error: "Same image already exists" });
      else if (Object.keys(err.keyPattern)[0] === "category_name")
        return res.status(403).json({ error: "Same category already exists" });
      else {
        console.log(err);
        return res.status(404).json({ error: err });
      }
    });
});

router.get("/category", async (req, res) => {
  try {
    const categories = await Category.find(
      {},
      { category_name: 1, category_image: 1, _id: 0 }
    );
    if (!categories) throw "No Categories";
    // console.log(categories);
    return res.json({ categories });
  } catch (error) {
    return res.status(404).json({ error });
  }
});

module.exports = router;
