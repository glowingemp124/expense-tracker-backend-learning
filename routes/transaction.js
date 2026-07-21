const express = require("express");
const auth = require("../middlewares/authMiddleware");

const roleMiddleware = require("../middlewares/roleMiddleware");
const { createTransaction, getAllTransactions, createTransfer, updateTransaction, deleteTransaction } = require("../controllers/transaction");
const router = express.Router();

router.use(auth);

router.get("/", roleMiddleware(["user", "admin"]), getAllTransactions);
router.post("/", roleMiddleware(["user", "admin"]), createTransaction);
router.post("/transfer", roleMiddleware(["user", "admin"]), createTransfer);
router.put("/:id", roleMiddleware(["user", "admin"]), updateTransaction);
router.delete("/:id", roleMiddleware(["user", "admin"]), deleteTransaction);

module.exports = router;

