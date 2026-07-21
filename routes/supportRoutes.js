// routes/supportRoutes.js
const express = require("express");
const {
  createSupportRequest
} = require("../controllers/supportController");
const createRateLimiter = require("../helperUtils/rateLimiter");

const router = express.Router();
const supportRateLimiter = createRateLimiter("support", 10, 50);

// Route to create a support request
router.post("/", supportRateLimiter, createSupportRequest);


module.exports = router;
