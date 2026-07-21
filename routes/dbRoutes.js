// routes/bulkInsertRoutes.js
const express = require("express");
const { bulkInsertHandler, deleteCollectionHandler } = require("../controllers/dbController");
const roleMiddleware = require("../middlewares/roleMiddleware");
const router = express.Router();

// Route for bulk insertion
router.post("/bulkInsert", roleMiddleware(["admin"]), bulkInsertHandler);
router.post("/deleteCollection", roleMiddleware(["admin"]), deleteCollectionHandler);

module.exports = router;
