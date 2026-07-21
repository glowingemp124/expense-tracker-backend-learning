const HomePageInsights = require("../models/HomePageInsights");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getDuplicateErrorMessage,
} = require("../helperUtils/responseUtil");

// Get Home Page Insights (by language, with pagination)
const getHomePageInsights = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const language =
    req.query.language ||
    (req.user && req.user.language) ||
    "en";

  try {
    // Find all insights, not just one
    const [insightsDocs, total] = await Promise.all([
      HomePageInsights.find()
        .sort({ createdAt: -1 }) // Sort by creation date, most recent first
        .skip((page - 1) * limit)
        .limit(limit),
      HomePageInsights.countDocuments(),
    ]);

    // Flatten and filter insights by language
    let filteredInsights = [];
    let media = [];
    insightsDocs.forEach(doc => {
      if (Array.isArray(doc.insights)) {
        filteredInsights.push(
          ...doc.insights
            .filter(item => item.lang === language)
            .map(entry => ({
              title: entry.title || "",
              description: entry.description || "",
              lang: entry.lang,
              _id: doc._id, // Include the document ID for reference
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              media: doc.media || null,
            }))
        );
      }
      if (Array.isArray(doc.media)) {
        media = media.concat(doc.media);
      }
    });

    const meta = generateMeta(page, limit, total);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "home_page_insights_found",
      data: filteredInsights,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Create Home Page Insights
const createHomePageInsights = async (req, res) => {
  const { insights, media } = req.body;

  try {
    const newSettings = new HomePageInsights({
      insights: Array.isArray(insights) ? insights : [],
      media: media || {},
    });

    const savedSettings = await newSettings.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "home_page_insights_created",
      data: savedSettings,
    });
  } catch (error) {
    const duplicateError = getDuplicateErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error: error,
    });
  }
};

// Update Home Page Insights
const updateHomePageInsights = async (req, res) => {
  const { id } = req.params;
  const { insights, media } = req.body;

  try {
    const homePageInsights = await HomePageInsights.findById(id);
    if (!homePageInsights) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "home_page_insights_not_found",
      });
    }

    function updateLocalizedField(fieldArray, newEntries) {
      if (!Array.isArray(fieldArray)) fieldArray = [];
      if (!Array.isArray(newEntries)) return fieldArray;

      newEntries.forEach((newEntry) => {
        if (!newEntry || !newEntry.lang) return;

        const idx = fieldArray.findIndex((item) => item.lang === newEntry.lang);
        if (idx >= 0) {
          fieldArray[idx].title = newEntry.title ?? fieldArray[idx].title;
          fieldArray[idx].description =
            newEntry.description ?? fieldArray[idx].description;
        } else {
          fieldArray.push(newEntry);
        }
      });
      return fieldArray;
    }

    if (insights) {
      homePageInsights.insights = updateLocalizedField(
        homePageInsights.insights,
        insights
      );
      homePageInsights.markModified("insights");
    }
    if (media) {
      homePageInsights.media = media;
      homePageInsights.markModified("media");
    }

    const updatedSettings = await homePageInsights.save();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "home_page_insights_updated",
      data: updatedSettings,
    });
  } catch (error) {
    const duplicateError = getDuplicateErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error: error,
    });
  }
};


// Delete Home Page Insights
const deleteHomePageInsights = async (req, res) => {
  const { id } = req.params;
  try {
    const homePageInsights = await HomePageInsights.findByIdAndDelete(id);
    if (!homePageInsights) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "home_page_insights_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "home_page_insights_deleted",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getHomePageInsights,
  createHomePageInsights,
  updateHomePageInsights,
  deleteHomePageInsights,
};
