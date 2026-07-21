const express = require("express");
const {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  addViewsToStory,
} = require("../controllers/storiesController");
const auth = require("../middlewares/authMiddleware");
const createRateLimiter = require("../helperUtils/rateLimiter");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();
router.use(auth);
// Create a rate limiter for Stories
const apiRateLimiter = createRateLimiter("Stories");

// Get Stories (user or admin)
router.post(
  "/all",
  apiRateLimiter,
  getStories
);


// Add views to Story (user or admin)
router.put("/views/:id", addViewsToStory);

// Create Story (admin only)
router.post("/", roleMiddleware(["admin"]), createStory);

// Update Story (admin only)
router.put("/:id", roleMiddleware(["admin"]), updateStory);


// Delete Story (admin only)
router.delete("/:id", roleMiddleware(["admin"]), deleteStory);

module.exports = router;
