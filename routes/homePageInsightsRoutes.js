const express = require("express");
const {
  getHomePageInsights,
  createHomePageInsights,
  updateHomePageInsights,
  deleteHomePageInsights
} = require("../controllers/homePageInsightsController");
const auth = require("../middlewares/authMiddleware");
const createRateLimiter = require("../helperUtils/rateLimiter");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();
router.use(auth);
// Create a rate limiter for Home Page Insights
const apiRateLimiter = createRateLimiter("HomePageInsights");

// Get Home Page Insights (user or admin)
router.get(
  "/",
  apiRateLimiter,
  getHomePageInsights
);

// Create Home Page Insights (admin only)
router.post("/", roleMiddleware(["admin"]), createHomePageInsights);

// Update Home Page Insights (admin only)
router.put("/:id", roleMiddleware(["admin"]), updateHomePageInsights);

// delete Home Page Insights (admin only)
router.delete("/:id", roleMiddleware(["admin"]), deleteHomePageInsights);

module.exports = router;
