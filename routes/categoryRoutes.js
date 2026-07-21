const express = require("express");
const auth = require("../middlewares/authMiddleware");

const roleMiddleware = require("../middlewares/roleMiddleware");
const { getWallets, createWallet, updateWallet, deleteWallet, getAllWallets } = require("../controllers/walletsController");
const { createCategory, getAllCategories, updateCategory, deleteCategory } = require("../controllers/categoryController");
const router = express.Router();

router.use(auth);

// /wallets
router.post("/", roleMiddleware(["user", "admin"]), createCategory);
router.get("/", roleMiddleware(["user", "admin"]), getAllCategories);
router.put("/:id", roleMiddleware(["user", "admin"]), updateCategory);
router.delete("/:id", roleMiddleware(["user", "admin"]), deleteCategory);

module.exports = router;

