const mongoose = require("mongoose");
const Period = require("../models/Period");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
} = require("../helperUtils/responseUtil");
const { getOrCreateActivePeriod, computePeriodAggregates } = require("../helperUtils/periodUtil");

// GET /api/periods/current
const getCurrentPeriod = async (req, res) => {
  try {
    const activePeriod = await getOrCreateActivePeriod(req.user._id);
    const aggregates = await computePeriodAggregates(req.user._id, activePeriod.startDate, null);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "period_fetched",
      data: {
        _id: activePeriod._id,
        startDate: activePeriod.startDate,
        status: activePeriod.status,
        ...aggregates,
      },
    });
  } catch (error) {
    console.error("getCurrentPeriod error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  }
};

// POST /api/periods/new-month
const startNewMonth = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const activePeriod = await getOrCreateActivePeriod(req.user._id);
    const now = new Date();
    const aggregates = await computePeriodAggregates(req.user._id, activePeriod.startDate, now);

    activePeriod.endDate = now;
    activePeriod.status = "closed";
    activePeriod.snapshot = {
      ...aggregates,
      wallets: aggregates.wallets.map((w) => ({
        walletId: w._id,
        name: w.name,
        balance: w.balance,
        color: w.color,
      })),
    };
    await activePeriod.save({ session });

    const [newPeriod] = await Period.create(
      [{ userId: req.user._id, startDate: now, status: "active" }],
      { session }
    );

    await session.commitTransaction();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "period_closed_successfully",
      data: { closedPeriod: activePeriod, newPeriod },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("startNewMonth error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  } finally {
    session.endSession();
  }
};

// GET /api/periods
const listPeriods = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const filter = { userId: req.user._id, status: "closed" };

    const [periods, total] = await Promise.all([
      Period.find(filter)
        .sort({ startDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Period.countDocuments(filter),
    ]);

    const meta = generateMeta(page, limit, total);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "periods_fetched",
      data: periods,
      meta,
    });
  } catch (error) {
    console.error("listPeriods error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  }
};

// GET /api/periods/:id
const getPeriodById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_period_id" });
  }

  try {
    const period = await Period.findById(id);

    if (!period) {
      return sendResponse({ res, statusCode: 404, translationKey: "period_not_found" });
    }

    if (period.userId.toString() !== req.user._id.toString()) {
      return sendResponse({ res, statusCode: 403, translationKey: "not_authorized_period" });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "period_fetched",
      data: period,
    });
  } catch (error) {
    console.error("getPeriodById error:", error);
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  }
};

module.exports = { getCurrentPeriod, startNewMonth, listPeriods, getPeriodById };
