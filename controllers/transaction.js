const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  validateParams,
} = require("../helperUtils/responseUtil");
const Wallets = require("../models/Wallets");
const Category = require("../models/Category");
const Transaction = require("../models/Transaction");
const Period = require("../models/Period");
const { default: mongoose } = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// GET /transactions
// ─────────────────────────────────────────────────────────────────────────────
const getAllTransactions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const skip = (page - 1) * limit;
  const {
    type,
    search,
    categoryId,
    walletId,
    minAmount,
    maxAmount,
    startDate,
    endDate,
    date,
    periodId,
  } = req.query;

  if (periodId && !mongoose.isValidObjectId(periodId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid periodId" });
  }

  if (type && !["income", "expense", "transfer"].includes(type)) {
    return sendResponse({ res, statusCode: 400, translationKey: "type must be 'income', 'expense', or 'transfer'" });
  }

  if (categoryId && !mongoose.isValidObjectId(categoryId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid categoryId" });
  }

  if (walletId && !mongoose.isValidObjectId(walletId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid walletId" });
  }

  const parsedMin = minAmount !== undefined && minAmount !== "" ? Number(minAmount) : undefined;
  const parsedMax = maxAmount !== undefined && maxAmount !== "" ? Number(maxAmount) : undefined;

  if (parsedMin !== undefined && isNaN(parsedMin)) {
    return sendResponse({ res, statusCode: 400, translationKey: "minAmount must be a valid number" });
  }
  if (parsedMax !== undefined && isNaN(parsedMax)) {
    return sendResponse({ res, statusCode: 400, translationKey: "maxAmount must be a valid number" });
  }
  if (parsedMin !== undefined && parsedMax !== undefined && parsedMin > parsedMax) {
    return sendResponse({ res, statusCode: 400, translationKey: "minAmount cannot be greater than maxAmount" });
  }

  const parsedDate = date ? new Date(date) : null;
  const parsedStart = startDate ? new Date(startDate) : null;
  const parsedEnd = endDate ? new Date(endDate) : null;

  if (parsedDate && isNaN(parsedDate.getTime())) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid date format" });
  }
  if (parsedStart && isNaN(parsedStart.getTime())) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid startDate format" });
  }
  if (parsedEnd && isNaN(parsedEnd.getTime())) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid endDate format" });
  }
  if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
    return sendResponse({ res, statusCode: 400, translationKey: "startDate cannot be after endDate" });
  }

  const filter = { userId: new mongoose.Types.ObjectId(req.user._id) };

  if (type) filter.categoryType = type;
  if (search && search.trim()) filter.title = { $regex: search.trim(), $options: "i" };
  if (categoryId) filter.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (walletId) filter.walletId = new mongoose.Types.ObjectId(walletId);
  
  if (parsedMin !== undefined || parsedMax !== undefined) {
    filter.totalAmount = {};
    if (parsedMin !== undefined) filter.totalAmount.$gte = parsedMin;
    if (parsedMax !== undefined) filter.totalAmount.$lte = parsedMax;
  }

  if (parsedDate) {
    const dayStart = new Date(parsedDate); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(parsedDate); dayEnd.setUTCHours(23, 59, 59, 999);
    filter.createdAt = { $gte: dayStart, $lte: dayEnd };
  } else if (parsedStart || parsedEnd) {
    filter.createdAt = {};
    if (parsedStart) filter.createdAt.$gte = parsedStart;
    if (parsedEnd) {
      parsedEnd.setUTCHours(23, 59, 59, 999);
      filter.createdAt.$lte = parsedEnd;
    }
  }

  try {
    // periodId is a convenience filter: resolve it to a createdAt range so
    // the frontend can drill into a past salary-cycle period without
    // recomputing its dates client-side. Explicit date/startDate/endDate
    // params (handled above) take precedence if also provided.
    if (periodId && !filter.createdAt) {
      const period = await Period.findById(periodId);

      if (!period) {
        return sendResponse({ res, statusCode: 404, translationKey: "period_not_found" });
      }
      if (period.userId.toString() !== req.user._id.toString()) {
        return sendResponse({ res, statusCode: 403, translationKey: "not_authorized_period" });
      }

      filter.createdAt = { $gte: period.startDate, $lte: period.endDate || new Date() };
    }

    const [result, total, wallets] = await Promise.all([
      Transaction.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "wallets",
            localField: "walletId",
            foreignField: "_id",
            as: "wallet",
          },
        },
        { $unwind: { path: "$wallet", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            categoryType: 1,
            totalAmount: 1,
            record: 1,
            balanceAfter: 1,
            transferId: 1,
            transferDirection: 1,
            createdAt: 1,
            updatedAt: 1,
            "wallet._id": 1,
            "wallet.name": 1,
            "category._id": 1,
            "category.name": 1,
            "category.type": 1,
          },
        },
      ]),
      Transaction.countDocuments(filter),
      Wallets.find(
        { userId: req.user._id, status: "active" },
        { _id: 1, name: 1, balance: 1, openingBalance: 1, color: 1, status: 1 }
      ).sort({ balance: -1 }),
    ]);

    const meta = generateMeta(page, limit, total);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Transactions fetched successfully",
      data: result,
      meta,
      extras: { wallets },
    });
  } catch (error) {
    console.error("getAllTransactions error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: "Error fetching transactions", error });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /transactions
// ─────────────────────────────────────────────────────────────────────────────
const createTransaction = async (req, res) => {
  const { title, walletId, categoryId, categoryType, record, totalAmount } = req.body;

  if (!validateParams(req, res, {
    rawData: ["title", "walletId", "categoryId", "categoryType", "record", "totalAmount"],
  })) return;

  if (typeof totalAmount !== "number" || totalAmount <= 0) {
    return sendResponse({ res, statusCode: 400, translationKey: "Amount must be a positive number" });
  }

  if (!["income", "expense"].includes(categoryType)) {
    return sendResponse({ res, statusCode: 400, translationKey: "categoryType must be 'income' or 'expense'" });
  }

  if (!mongoose.isValidObjectId(walletId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid walletId" });
  }

  if (!mongoose.isValidObjectId(categoryId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid categoryId" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const wallet = await Wallets.findOne({ _id: walletId, userId: req.user._id }).session(session);
    const category = await Category.findOne({ _id: categoryId, userId: req.user._id }).session(session);

    if (!wallet) throw { statusCode: 404, message: "Wallet not found" };
    if (!category) throw { statusCode: 404, message: "Category not found" };
    if (categoryType !== category.type) throw { statusCode: 400, message: "Transaction type does not match category type" };
    if (categoryType === "expense" && wallet.balance < totalAmount) throw { statusCode: 400, message: "Insufficient wallet balance" };

    wallet.balance = categoryType === "income"
      ? wallet.balance + totalAmount
      : wallet.balance - totalAmount;

    await wallet.save({ session });

    const [transaction] = await Transaction.create(
      [{ userId: req.user._id, title, walletId, categoryId, categoryType, record, totalAmount, balanceAfter: wallet.balance }],
      { session }
    );

    await session.commitTransaction();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Transaction created successfully",
      data: {
        transaction: {
          _id: transaction._id,
          userId: transaction.userId,
          title: transaction.title,
          categoryType: transaction.categoryType,
          totalAmount: transaction.totalAmount,
          record: transaction.record,
          balanceAfter: transaction.balanceAfter,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          wallet: { _id: wallet._id, name: wallet.name },
          category: { _id: category._id, name: category.name, type: category.type },
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.statusCode) {
      return sendResponse({ res, statusCode: error.statusCode, translationKey: error.message });
    }

    console.error("createTransaction error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: "Error creating transaction", error });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /transactions/transfer
// ─────────────────────────────────────────────────────────────────────────────
const createTransfer = async (req, res) => {
  const { title, fromWalletId, toWalletId, amount } = req.body;

  if (!title || (typeof title === "string" && title.trim() === "")) {
    return sendResponse({ res, statusCode: 400, translationKey: "title is required" });
  }
  if (!fromWalletId) {
    return sendResponse({ res, statusCode: 400, translationKey: "fromWalletId is required" });
  }
  if (!toWalletId) {
    return sendResponse({ res, statusCode: 400, translationKey: "toWalletId is required" });
  }
  if (amount === undefined || amount === null) {
    return sendResponse({ res, statusCode: 400, translationKey: "amount is required" });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return sendResponse({ res, statusCode: 400, translationKey: "amount must be a positive number" });
  }
  if (!mongoose.isValidObjectId(fromWalletId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid fromWalletId" });
  }
  if (!mongoose.isValidObjectId(toWalletId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid toWalletId" });
  }
  if (String(fromWalletId) === String(toWalletId)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Source and destination wallets must be different" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const fromWallet = await Wallets.findOne({ _id: fromWalletId, userId: req.user._id }).session(session);
    const toWallet = await Wallets.findOne({ _id: toWalletId, userId: req.user._id }).session(session);

    if (!fromWallet) throw { statusCode: 404, message: "Source wallet not found" };
    if (!toWallet) throw { statusCode: 404, message: "Destination wallet not found" };
    if (fromWallet.status !== "active") throw { statusCode: 400, message: "Source wallet is inactive" };
    if (toWallet.status !== "active") throw { statusCode: 400, message: "Destination wallet is inactive" };
    if (fromWallet.balance < amount) throw { statusCode: 400, message: "Insufficient balance in source wallet" };

    const transferId = new mongoose.Types.ObjectId();
    const trimmedTitle = title.trim();

    fromWallet.balance -= amount;
    toWallet.balance += amount;

    await fromWallet.save({ session });
    await toWallet.save({ session });

    const [debitTx, creditTx] = await Transaction.create(
      [
        {
          userId: req.user._id,
          title: trimmedTitle,
          walletId: fromWalletId,
          categoryType: "transfer",
          transferId,
          transferDirection: "out",
          totalAmount: amount,
          balanceAfter: fromWallet.balance,
        },
        {
          userId: req.user._id,
          title: trimmedTitle,
          walletId: toWalletId,
          categoryType: "transfer",
          transferId,
          transferDirection: "in",
          totalAmount: amount,
          balanceAfter: toWallet.balance,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Transfer completed successfully",
      data: {
        transferId,
        title: trimmedTitle,
        amount,
        createdAt: debitTx.createdAt,
        debit: {
          _id: debitTx._id,
          wallet: { _id: fromWallet._id, name: fromWallet.name },
          balanceAfter: fromWallet.balance,
        },
        credit: {
          _id: creditTx._id,
          wallet: { _id: toWallet._id, name: toWallet.name },
          balanceAfter: toWallet.balance,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.statusCode) {
      return sendResponse({ res, statusCode: error.statusCode, translationKey: error.message });
    }

    console.error("createTransfer error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: "Error processing transfer", error });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /transactions/:id
// Only title and record are mutable. Amount/wallet/category changes require
// delete + recreate to keep wallet balances consistent.
// ─────────────────────────────────────────────────────────────────────────────
const updateTransaction = async (req, res) => {
  const { id } = req.params;
  const { title, record } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid transaction ID" });
  }

  const payload = {};
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim() === "") {
      return sendResponse({ res, statusCode: 400, translationKey: "title must be a non-empty string" });
    }
    payload.title = title.trim();
  }
  if (record !== undefined) {
    if (!Array.isArray(record)) {
      return sendResponse({ res, statusCode: 400, translationKey: "record must be an array" });
    }
    payload.record = record;
  }

  if (Object.keys(payload).length === 0) {
    return sendResponse({ res, statusCode: 400, translationKey: "Nothing to update. Provide title or record." });
  }

  try {
    const transaction = await Transaction.findOne({ _id: id, userId: req.user._id });

    if (!transaction) {
      return sendResponse({ res, statusCode: 404, translationKey: "Transaction not found" });
    }

    if (transaction.categoryType === "transfer" && transaction.transferId) {
      // Keep both sides of the transfer in sync
      await Transaction.updateMany(
        { transferId: transaction.transferId, userId: req.user._id },
        { $set: payload }
      );
    } else {
      await Transaction.updateOne({ _id: id }, { $set: payload });
    }

    const updated = await Transaction.findById(id).lean();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Transaction updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateTransaction error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: "Error updating transaction", error });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /transactions/:id
// Reverses the wallet balance change atomically. For transfers, both legs and
// both wallets are handled in a single session.
// ─────────────────────────────────────────────────────────────────────────────
const deleteTransaction = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return sendResponse({ res, statusCode: 400, translationKey: "Invalid transaction ID" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const transaction = await Transaction.findOne({ _id: id, userId: req.user._id }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return sendResponse({ res, statusCode: 404, translationKey: "Transaction not found" });
    }

    if (transaction.categoryType === "transfer") {
      const legs = await Transaction.find(
        { transferId: transaction.transferId, userId: req.user._id }
      ).session(session);

      for (const leg of legs) {
        const wallet = await Wallets.findById(leg.walletId).session(session);
        if (wallet) {
          // Reverse: out → add back, in → subtract back
          wallet.balance = leg.transferDirection === "out"
            ? wallet.balance + leg.totalAmount
            : wallet.balance - leg.totalAmount;
          await wallet.save({ session });
        }
      }

      await Transaction.deleteMany(
        { transferId: transaction.transferId, userId: req.user._id }
      ).session(session);
    } else {
      const wallet = await Wallets.findOne({ _id: transaction.walletId, userId: req.user._id }).session(session);

      if (!wallet) throw { statusCode: 404, message: "Associated wallet not found" };

      // Reverse: income → subtract, expense → add back
      wallet.balance = transaction.categoryType === "income"
        ? wallet.balance - transaction.totalAmount
        : wallet.balance + transaction.totalAmount;

      await wallet.save({ session });
      await Transaction.deleteOne({ _id: id }).session(session);
    }

    await session.commitTransaction();

    return sendResponse({ res, statusCode: 200, translationKey: "Transaction deleted successfully" });
  } catch (error) {
    await session.abortTransaction();

    if (error.statusCode) {
      return sendResponse({ res, statusCode: error.statusCode, translationKey: error.message });
    }

    console.error("deleteTransaction error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: "Error deleting transaction", error });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createTransaction,
  getAllTransactions,
  createTransfer,
  updateTransaction,
  deleteTransaction,
};
 