const mongoose = require("mongoose");
const { MediaSchema } = require("./common/CommonModelsUtility");

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
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const homePageInsightsSchema = new mongoose.Schema(
  {
    insights: {
      type: [localizedTextSchema],
      default: [],
    },
    media: {
      type: MediaSchema,
    },
  },
  { timestamps: true }
);

const HomePageInsights = mongoose.model("HomePageInsights", homePageInsightsSchema);

module.exports = HomePageInsights;
