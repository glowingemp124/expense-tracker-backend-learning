const mongoose = require("mongoose");

const localizedTextSchema = new mongoose.Schema(
  {
    lang: {
      type: String,
      required: true,
      trim: true,
      // Example: 'en', 'ar'
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const categoriesSchema = new mongoose.Schema(
  {
    category: {
      type: [localizedTextSchema],
      default: [],
    },
    key: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Categories = mongoose.model("categories", categoriesSchema);

module.exports = Categories;
