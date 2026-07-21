const express = require("express");
const auth = require("../middlewares/authMiddleware");

const roleMiddleware = require("../middlewares/roleMiddleware");
const { createWallet, updateWallet, deleteWallet, getAllWallets } = require("../controllers/walletsController");
const router = express.Router();

router.use(auth);

// /wallets
router.post("/", roleMiddleware(["user", "admin"]), createWallet);
router.get("/", roleMiddleware(["user", "admin"]), getAllWallets);
router.put("/:id", roleMiddleware(["user", "admin"]), updateWallet);
router.delete("/:id", roleMiddleware(["user", "admin"]), deleteWallet);

module.exports = router;
