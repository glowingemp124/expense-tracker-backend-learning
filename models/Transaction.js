const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "wallets",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "category",
    },
    categoryType: {
      type: String,
      enum: ["income", "expense", "transfer"],
      required: true,
    },
    transferId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      sparse: true,
    },
    transferDirection: {
      type: String,
      enum: ["in", "out"],
    },
    record: [
      {
        title: String,
        quantity: Number,
        rate: Number,
        amount: Number,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Transaction = mongoose.model("transaction", transactionSchema);

module.exports = Transaction;
