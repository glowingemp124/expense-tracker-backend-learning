const mongoose = require("mongoose");
const { MediaSchema } = require("./common/CommonModelsUtility");

const localizedTextSchema = new mongoose.Schema(
  {
    lang: {
      type: String,
      required: true,
      trim: true, // Example: 'en', 'ar'
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const storiesSchema = new mongoose.Schema(
  {
    story: {
      type: [localizedTextSchema],
      default: [],
    },
    media: MediaSchema,
    image: {
      type: String,
      default: "",
    },
    categories: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Categories",
      default: [],
    },
    viewedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
  },
  { timestamps: true }
);

const Stories = mongoose.model("stories", storiesSchema);

module.exports = Stories;
