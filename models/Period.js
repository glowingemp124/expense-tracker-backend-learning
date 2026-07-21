const mongoose = require("mongoose");

const periodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    snapshot: {
      totalIncome: { type: Number, default: 0 },
      totalExpense: { type: Number, default: 0 },
      netSavings: { type: Number, default: 0 },
      transactionCount: { type: Number, default: 0 },
      avgExpensePerDay: { type: Number, default: 0 },
      expenseByCategory: [
        {
          categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category" },
          name: String,
          amount: Number,
          percentage: Number,
        },
      ],
      incomeByCategory: [
        {
          categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category" },
          name: String,
          amount: Number,
          percentage: Number,
        },
      ],
      wallets: [
        {
          walletId: { type: mongoose.Schema.Types.ObjectId, ref: "wallets" },
          name: String,
          balance: Number,
          color: String,
        },
      ],
      totalBalance: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

periodSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
periodSchema.index({ userId: 1, startDate: -1 });

const Period = mongoose.model("period", periodSchema);

module.exports = Period;
