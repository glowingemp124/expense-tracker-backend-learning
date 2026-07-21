const Categories = require("../models/Categories");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getDuplicateErrorMessage,
} = require("../helperUtils/responseUtil");

// Get Categories (by language, with pagination)
const getCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const language =
    req.query.language || (req.user && req.user.language) || "en";

  try {
    const [categoriesDocs, total] = await Promise.all([
      Categories.aggregate([
        {
          $addFields: {
            sortOrder: {
              $cond: [
                { $eq: ["$order", 0] },
                Number.MAX_SAFE_INTEGER,
                "$order",
              ],
            },
          },
        },
        { $sort: { sortOrder: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      Categories.countDocuments(),
    ]);

    // Flatten and filter categories by language
    let filteredCategories = [];
    categoriesDocs.forEach((doc) => {
      console.log("doc:", doc);
      if (Array.isArray(doc.category)) {
        filteredCategories.push(
          ...doc.category
            .filter((item) => item.lang === language)
            .map((entry) => ({
              _id: doc._id,
              title: entry.title || "",
              lang: entry.lang,
              order: doc.order,
              key: doc.key || "",
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
            }))
        );
      }
    });

    const meta = generateMeta(page, limit, total);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_found",
      data: filteredCategories,
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

// Create Category
const createCategory = async (req, res) => {
  const { category, key, order } = req.body;

  try {
    const newCategory = new Categories({
      category: Array.isArray(category) ? category : [],
      key: key || "",
      order: order || 0,
    });

    const savedCategory = await newCategory.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "category_created",
      data: savedCategory,
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

// Update Category
const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { category, key, order } = req.body;

  try {
    const categoryDoc = await Categories.findById(id);
    if (!categoryDoc) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "category_not_found",
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
        } else {
          fieldArray.push(newEntry);
        }
      });
      return fieldArray;
    }

    if (category) {
      categoryDoc.category = updateLocalizedField(
        categoryDoc.category,
        category
      );
      categoryDoc.markModified("category");
    }

    if (key !== undefined) {
      categoryDoc.key = key;
    }
    if (order !== undefined) {
      categoryDoc.order = order;
    }

    const updatedCategory = await categoryDoc.save();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "category_updated",
      data: updatedCategory,
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

// Delete Category
const deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const categoryDoc = await Categories.findByIdAndDelete(id);
    if (!categoryDoc) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "category_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "category_deleted",
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
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
