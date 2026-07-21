const mongoose = require("mongoose");
const Period = require("../models/Period");
const Transaction = require("../models/Transaction");
const Wallets = require("../models/Wallets");
const { User } = require("../models/UserModel");

// Finds the user's active (open) period, lazily creating one backdated to
// their account creation date if this is their first time hitting a
// period-aware endpoint.
const getOrCreateActivePeriod = async (userId) => {
  let activePeriod = await Period.findOne({ userId, status: "active" });

  if (!activePeriod) {
    const user = await User.findById(userId).select("createdAt");
    activePeriod = await Period.create({
      userId,
      startDate: user?.createdAt || new Date(),
      status: "active",
    });
  }

  return activePeriod;
};

// Computes income/expense totals, category breakdowns, and current wallet
// balances for transactions between startDate and endDate (endDate = null
// means "through now"). Shared by the dashboard's current-period summary and
// the snapshot saved when a period is closed via "New Month".
const computePeriodAggregates = async (userId, startDate, endDate) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);
  const rangeEnd = endDate || new Date();

  const dateMatch = { userId: objectUserId, createdAt: { $gte: startDate, $lte: rangeEnd } };

  const [summary, expenseByCategoryRaw, incomeByCategoryRaw, wallets] = await Promise.all([
    Transaction.aggregate([
      { $match: dateMatch },
      { $group: { _id: "$categoryType", total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),

    Transaction.aggregate([
      { $match: { ...dateMatch, categoryType: "expense" } },
      { $group: { _id: "$categoryId", total: { $sum: "$totalAmount" } } },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, total: 1, "category._id": 1, "category.name": 1 } },
    ]),

    Transaction.aggregate([
      { $match: { ...dateMatch, categoryType: "income" } },
      { $group: { _id: "$categoryId", total: { $sum: "$totalAmount" } } },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, total: 1, "category._id": 1, "category.name": 1 } },
    ]),

    Wallets.find({ userId, status: "active" })
      .sort({ balance: -1 })
      .select("_id name balance openingBalance color status")
      .lean(),
  ]);

  const totalIncome = summary.find((s) => s._id === "income")?.total ?? 0;
  const totalExpense = summary.find((s) => s._id === "expense")?.total ?? 0;
  const transactionCount = summary.reduce((sum, s) => sum + s.count, 0);

  const daysElapsed = Math.max(1, Math.ceil((rangeEnd - startDate) / (1000 * 60 * 60 * 24)));
  const avgExpensePerDay = Math.round(totalExpense / daysElapsed);

  const mapCategoryBreakdown = (rows) => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    return rows.map((r) => ({
      categoryId: r._id,
      name: r.category?.name ?? "Unknown",
      amount: r.total,
      percentage: total > 0 ? parseFloat(((r.total / total) * 100).toFixed(1)) : 0,
    }));
  };

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  return {
    totalIncome,
    totalExpense,
    netSavings: totalIncome - totalExpense,
    transactionCount,
    avgExpensePerDay,
    expenseByCategory: mapCategoryBreakdown(expenseByCategoryRaw),
    incomeByCategory: mapCategoryBreakdown(incomeByCategoryRaw),
    // Full wallet docs (matches the dashboard's original wallet list shape).
    // Callers that persist a Period snapshot should map this down to
    // { walletId, name, balance, color } themselves.
    wallets,
    totalBalance,
  };
};

module.exports = { getOrCreateActivePeriod, computePeriodAggregates };
