const express = require("express");
const auth = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const {
  getCurrentPeriod,
  startNewMonth,
  listPeriods,
  getPeriodById,
} = require("../controllers/periodController");

const router = express.Router();

router.use(auth);

router.get("/current", roleMiddleware(["user", "admin"]), getCurrentPeriod);
router.post("/new-month", roleMiddleware(["user", "admin"]), startNewMonth);
router.get("/", roleMiddleware(["user", "admin"]), listPeriods);
router.get("/:id", roleMiddleware(["user", "admin"]), getPeriodById);

module.exports = router;
