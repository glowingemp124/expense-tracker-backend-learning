const Stories = require("../models/Stories");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getDuplicateErrorMessage,
  validateParams,
} = require("../helperUtils/responseUtil");
const Categories = require("../models/Categories");
const {
  getStoriesHelper,
} = require("../helperUtils/controllerHelpers/storiesHelper");

// Get Stories (by language, with pagination, and optional tag filtering)
const getStories = async (req, res) => {
  const result = await getStoriesHelper(req);
  return sendResponse({
    res,
    statusCode: result.statusCode,
    translationKey: result.translationKey,
    data: result.data,
    meta: result.meta,
    error: result.error,
  });
};

// Create Story

const createStory = async (req, res) => {
  const { story, media, categories, image = "" } = req.body;

  try {
    // Populate categories if provided
    const populatedCategories = await Categories.find({
      _id: { $in: categories },
    });

    const newStory = new Stories({
      story: Array.isArray(story) ? story : [],
      media,
      image,
      categories: populatedCategories.map((category) => category._id),
    });

    const savedStory = await newStory.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "story_created",
      data: savedStory,
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
// Update Story
const updateStory = async (req, res) => {
  const { id } = req.params;
  const { story, media, categories, image } = req.body;

  try {
    const storyDoc = await Stories.findById(id);
    if (!storyDoc) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "story_not_found",
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

    if (story) {
      storyDoc.story = updateLocalizedField(storyDoc.story, story);
      storyDoc.markModified("story");
    }
    if (media !== undefined) {
      storyDoc.media = media;
    }
    if (image !== undefined) {
      storyDoc.image = image;
    }
    if (categories !== undefined) {
      // Ensure categories is an array and remove duplicates
      const uniqueCategories = Array.isArray(categories)
        ? [...new Set(categories.map(String))]
        : [];
      storyDoc.categories = uniqueCategories;
    }

    const updatedStory = await storyDoc.save();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "story_updated",
      data: updatedStory,
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

// Add Views to Story
const addViewsToStory = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const validationOptions = {
    pathParams: ["id"],
    objectIdFields: ["id"],
  };

  if (!validateParams(req, res, validationOptions)) return;

  try {
    const updatedStory = await Stories.findOneAndUpdate(
      { _id: id, viewedBy: { $ne: userId } },
      { $addToSet: { viewedBy: userId } }
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "story_viewed",
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

// Delete Story
const deleteStory = async (req, res) => {
  const { id } = req.params;
  try {
    const storyDoc = await Stories.findByIdAndDelete(id);
    if (!storyDoc) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "story_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "story_deleted",
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
  getStories,
  createStory,
  updateStory,
  addViewsToStory,
  deleteStory,
};
