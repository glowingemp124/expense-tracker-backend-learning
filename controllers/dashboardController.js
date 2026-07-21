const { default: mongoose } = require("mongoose");
const Transaction = require("../models/Transaction");
const { sendResponse } = require("../helperUtils/responseUtil");
const { getOrCreateActivePeriod, computePeriodAggregates } = require("../helperUtils/periodUtil");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 1000 * 60 * 60 * 24;

const pctChange = (curr, prev) => {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return parseFloat(((curr - prev) / prev * 100).toFixed(1));
};

const getDashboardData = async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);
  const now = new Date();

  // ── Parse & validate calendar-year params (used only for the YoY / 12-month
  // trend charts below, which intentionally stay calendar-based) ─────────────
  let year = parseInt(req.query.year);
  if (isNaN(year) || year < 2000 || year > 2100) year = now.getUTCFullYear();

  const yearStart    = new Date(Date.UTC(year, 0, 1));
  const yearEnd      = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const lastYearStart = new Date(Date.UTC(year - 1, 0, 1));
  const lastYearEnd   = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999));

  // 7-day windows for trend badges (always relative to today)
  const todayEnd   = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const last7Start = new Date(todayEnd);
  last7Start.setUTCDate(last7Start.getUTCDate() - 6);
  last7Start.setUTCHours(0, 0, 0, 0);

  const prev7End   = new Date(last7Start.getTime() - 1);
  const prev7Start = new Date(prev7End);
  prev7Start.setUTCDate(prev7Start.getUTCDate() - 6);
  prev7Start.setUTCHours(0, 0, 0, 0);

  try {
    // The "current month" the user cares about is the open salary-cycle
    // period (since their last "New Month" click), not the calendar month.
    const activePeriod = await getOrCreateActivePeriod(req.user._id);
    const periodStart = activePeriod.startDate;
    const daysElapsed = Math.max(1, Math.ceil((now - periodStart) / DAY_MS));

    const [
      periodAggregates,
      last7Summary,
      prev7Summary,
      spendingPattern,
      monthlyTrend,
      lastYearSummary,
      recentTransactions,
    ] = await Promise.all([

      // 1. Current-period income/expense totals, category breakdowns, wallets
      computePeriodAggregates(req.user._id, periodStart, now),

      // 2. Last 7 days income & expense
      Transaction.aggregate([
        { $match: { userId, createdAt: { $gte: last7Start, $lte: todayEnd } } },
        { $group: { _id: "$categoryType", total: { $sum: "$totalAmount" } } },
      ]),

      // 3. Prior 7 days income & expense (comparison baseline)
      Transaction.aggregate([
        { $match: { userId, createdAt: { $gte: prev7Start, $lte: prev7End } } },
        { $group: { _id: "$categoryType", total: { $sum: "$totalAmount" } } },
      ]),

      // 4. Weekly expense buckets within the current period (spending pattern chart).
      // Periods vary in length (salary cycles aren't fixed-length), so weeks are
      // counted from the period's start date rather than the calendar day-of-month.
      Transaction.aggregate([
        { $match: { userId, categoryType: "expense", createdAt: { $gte: periodStart, $lte: now } } },
        {
          $group: {
            _id: {
              $ceil: {
                $divide: [
                  { $add: [{ $floor: { $divide: [{ $subtract: ["$createdAt", periodStart] }, DAY_MS] } }, 1] },
                  7,
                ],
              },
            },
            amount: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 5. Monthly income vs expense for the selected calendar year (bar chart)
      Transaction.aggregate([
        { $match: { userId, createdAt: { $gte: yearStart, $lte: yearEnd } } },
        {
          $group: {
            _id: { month: { $month: "$createdAt" }, type: "$categoryType" },
            total: { $sum: "$totalAmount" },
          },
        },
      ]),

      // 6. Last year income & expense totals (year-over-year badge)
      Transaction.aggregate([
        { $match: { userId, createdAt: { $gte: lastYearStart, $lte: lastYearEnd } } },
        { $group: { _id: "$categoryType", total: { $sum: "$totalAmount" } } },
      ]),

      // 7. Recent 5 transactions with wallet & category details
      Transaction.aggregate([
        { $match: { userId } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
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
            transferId: 1,
            transferDirection: 1,
            totalAmount: 1,
            balanceAfter: 1,
            createdAt: 1,
            "wallet._id": 1,
            "wallet.name": 1,
            "category._id": 1,
            "category.name": 1,
            "category.type": 1,
          },
        },
      ]),
    ]);

    const { totalIncome, totalExpense, totalBalance, wallets, expenseByCategory, incomeByCategory } = periodAggregates;

    // ── 7-day trend badges ───────────────────────────────────────────────────
    const l7Income  = last7Summary.find(s => s._id === "income")?.total  ?? 0;
    const l7Expense = last7Summary.find(s => s._id === "expense")?.total ?? 0;
    const p7Income  = prev7Summary.find(s => s._id === "income")?.total  ?? 0;
    const p7Expense = prev7Summary.find(s => s._id === "expense")?.total ?? 0;

    // Balance 7 days ago is inferred: subtract the net wallet movement from the last 7 days
    const balance7DaysAgo = totalBalance - (l7Income - l7Expense);

    // Average daily expense over the last 7 days
    const avgExpensePerDay7Days = Math.round(l7Expense / 7);

    // ── Year-over-year change (calendar-year trend, independent of periods) ──
    const thisYearIncome  = monthlyTrend.filter(m => m._id.type === "income").reduce((s, m) => s + m.total, 0);
    const thisYearExpense = monthlyTrend.filter(m => m._id.type === "expense").reduce((s, m) => s + m.total, 0);
    const lastYearIncome  = lastYearSummary.find(s => s._id === "income")?.total  ?? 0;
    const lastYearExpense = lastYearSummary.find(s => s._id === "expense")?.total ?? 0;

    const thisYearNet = thisYearIncome - thisYearExpense;
    const lastYearNet = lastYearIncome - lastYearExpense;

    // ── Spending pattern (weeks since period start) ──────────────────────────
    const weekCount = Math.max(1, Math.ceil(daysElapsed / 7));
    const spendingWeekly = Array.from({ length: weekCount }, (_, i) => {
      const w = i + 1;
      return {
        week: `Week ${w}`,
        amount: spendingPattern.find(s => s._id === w)?.amount ?? 0,
      };
    });

    // ── Monthly income vs expense (full selected calendar year) ──────────────
    const incomeVsExpenseMonthly = MONTH_NAMES.map((name, i) => {
      const m = i + 1;
      return {
        month: name,
        income:  monthlyTrend.find(t => t._id.month === m && t._id.type === "income")?.total  ?? 0,
        expense: monthlyTrend.find(t => t._id.month === m && t._id.type === "expense")?.total ?? 0,
      };
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Dashboard data fetched successfully",
      data: {
        currentPeriod: {
          _id: activePeriod._id,
          startDate: periodStart,
          daysElapsed,
        },

        summary: {
          totalBalance,
          thisMonthIncome: totalIncome,
          thisMonthExpense: totalExpense,
          avgExpensePerDay: periodAggregates.avgExpensePerDay,
          avgExpensePerDay7Days,
          changes: {
            totalBalance:      { percentage: pctChange(totalBalance, balance7DaysAgo), period: "last 7 days" },
            thisMonthIncome:   { percentage: pctChange(l7Income, p7Income),            period: "last 7 days" },
            thisMonthExpense:  { percentage: pctChange(l7Expense, p7Expense),          period: "last 7 days" },
          },
        },

        wallets,

        spendingPattern: {
          weekly: spendingWeekly,
        },

        expenseByCategory,
        incomeByCategory,

        incomeVsExpense: {
          yoyNetChange: pctChange(thisYearNet, lastYearNet),
          monthly: incomeVsExpenseMonthly,
        },

        recentTransactions,
      },
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = { getDashboardData };
