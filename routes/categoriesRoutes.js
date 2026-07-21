const express = require("express");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoriesController");
const auth = require("../middlewares/authMiddleware");
const createRateLimiter = require("../helperUtils/rateLimiter");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();
router.use(auth);
// Create a rate limiter for Categories
const apiRateLimiter = createRateLimiter("Categories");

// Get Categories (user or admin)
router.get("/", apiRateLimiter, getCategories);

// Create Category (admin only)
router.post("/", roleMiddleware(["admin"]), createCategory);

// Update Category (admin only)
router.put("/:id", roleMiddleware(["admin"]), updateCategory);

// Delete Category (admin only)
router.delete("/:id", roleMiddleware(["admin"]), deleteCategory);

module.exports = router;
