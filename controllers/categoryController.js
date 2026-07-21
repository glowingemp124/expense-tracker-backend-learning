const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getDuplicateErrorMessage,
  validateParams,
} = require("../helperUtils/responseUtil");
const Category = require("../models/Category");

const getAllCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { type, status, keyword } = req.query; // optional filters

  try {
    const filter = { userId: req.user._id };

    if (type && ["income", "expense"].includes(type)) {
      filter.type = type;
    }

    if (status && ["active", "inactive"].includes(status)) {
      filter.status = status;
    }

    if (keyword) {
      // Case-insensitive partial match on name
      filter.name = { $regex: keyword, $options: "i" };
    }

    const [categories, total, activeCount, inactiveCount] = await Promise.all([
      Category.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Category.countDocuments(filter),
      Category.countDocuments({ userId: req.user._id, type, status: "active" }),
      Category.countDocuments({ userId: req.user._id, type, status: "inactive" }),
    ]);

    const meta = generateMeta(page, limit, total);

    const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);
    const responseMsg = type ? `${capitalize(type)} Categories fetched successfully` : "Categories fetched successfully";

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: responseMsg,
      data: categories,
      meta: {
        ...meta,
        counts: {
          active: activeCount,
          inactive: inactiveCount,
        }
      },
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};


// Create Categories
const createCategory = async (req, res) => {
  const { name, type } = req.body;

  const validationOptions = {
    rawData: ["name", "type"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  if (type && !["income", "expense"].includes(type)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid category type" });
  }

  try {
    const categoryExists = await Category.findOne({ userId: req.user._id, name });

    if (categoryExists) {
      return sendResponse({ res, statusCode: 400, translationKey: "Category already exists" });
    }

    const newCategory = new Category({
      userId: req.user._id,
      name,
      type,
      status: "active",
    });

    const savedCategory = await newCategory.save();

    return sendResponse({ res, statusCode: 201, translationKey: "Category created successfully", data: savedCategory });

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
  const { name, type, status } = req.body;

  try {
    const category = await Category.findById(id);

    if (!category) {
      return sendResponse({ res, statusCode: 404, translationKey: "Category not found" });
    }

    if (category.userId.toString() !== req.user._id.toString()) {
      return sendResponse({ res, statusCode: 403, translationKey: "Not authorized to update this category" });
    }

    if (!name && !type && !status) {
      return sendResponse({ res, statusCode: 400, translationKey: "No fields provided for update" });
    }

    if (type && !["income", "expense"].includes(type)) {
      return sendResponse({ res, statusCode: 400, translationKey: "Invalid category type" });
    }

    if (name) {
      const existingCategory = await Category.findOne({
        userId: req.user._id,
        name,
        _id: { $ne: id },
      });
      if (existingCategory) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Category with this name already exists",
        });
      }
    }

    const payload = {
      name: name ?? category.name,
      type: type ?? category.type,
      status: status ?? category.status,
    };

    const updatedCategory = await Category.findByIdAndUpdate(id, payload, { new: true });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Category updated successfully",
      data: updatedCategory,
    });

  } catch (error) {
    const duplicateError = getDuplicateErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode || 500,
      translationKey: duplicateError.message || "Something went wrong",
      error,
    });
  }
};


// Delete Categories
const deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const category = await Category.findById(id);

    if (!category) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Category not found",
      });
    }

    if (category.userId.toString() !== req.user._id.toString()) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "Not authorized to delete this category",
      });
    }

    await category.deleteOne();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Category deleted successfully",
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
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
};
