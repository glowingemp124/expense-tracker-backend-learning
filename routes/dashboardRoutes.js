const express = require("express");
const auth = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { getDashboardData } = require("../controllers/dashboardController");

const router = express.Router();

router.use(auth);

router.get("/", roleMiddleware(["user", "admin"]), getDashboardData);

module.exports = router;
