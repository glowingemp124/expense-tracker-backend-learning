const { sendResponse } = require("../helperUtils/responseUtil");
const HomePageInsights = require("../models/HomePageInsights");
const Categories = require("../models/Categories");
const Stories = require("../models/Stories");
const {
  getStoriesHelper,
} = require("../helperUtils/controllerHelpers/storiesHelper");
const getHome = async (req, res) => {
  try {
    const language =
      req.query.language || (req.user && req.user.language) || "en";

    // Get 1 random insight and first 10 categories in the requested language in parallel
    const [insightDoc, categoriesDocs] = await Promise.all([
      HomePageInsights.aggregate([
        { $unwind: "$insights" },
        { $match: { "insights.lang": language } },
        { $sample: { size: 1 } },
      ]),
      Categories.aggregate([
        {
          $addFields: {
            filteredCategory: {
              $filter: {
                input: "$category",
                as: "cat",
                cond: { $eq: ["$$cat.lang", language] },
              },
            },
            sortOrder: {
              $cond: [
                { $eq: ["$order", 0] },
                Number.MAX_SAFE_INTEGER,
                "$order",
              ],
            },
          },
        },
        { $match: { "filteredCategory.0": { $exists: true } } },
        { $sort: { sortOrder: 1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            updatedAt: 1,
            order: 1,
            category: "$filteredCategory",
          },
        },
      ]),
    ]);
    const BASE_URL = `${process.env.S3_BASE_URL}/`;

    let randomInsight = null;
    if (insightDoc.length > 0) {
      const entry = insightDoc[0].insights;
      let media = insightDoc[0].media || null;
      if (media && media.url && !media.url.startsWith("http")) {
        media = {
          ...media,
          url: BASE_URL + media.url,
        };
      }
      randomInsight = {
        title: entry.title || "",
        description: entry.description || "",
        lang: entry.lang,
        _id: insightDoc[0]._id,
        createdAt: insightDoc[0].createdAt,
        updatedAt: insightDoc[0].updatedAt,
        media: media,
      };
    }

    // Flatten categories
    let categories = [];
    categoriesDocs.forEach((doc) => {
      if (Array.isArray(doc.category)) {
        categories.push(
          ...doc.category.map((entry) => ({
            title: entry.title || "",
            lang: entry.lang,
            order: entry.order || 0,
            _id: doc._id,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          }))
        );
      }
    });

    // Get stories based on the categories
    const result = await getStoriesHelper(req);

    const homeData = {
      insight: randomInsight,
      categories,
      stories: result.data || [],
    };
    return sendResponse({
      res,
      statusCode: 200,
      data: homeData,
      translationKey: "data_fetched_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

module.exports = {
  getHome,
};
