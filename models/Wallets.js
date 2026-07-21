const mongoose = require("mongoose");

const walletsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      required: false,
      trim: true,
    },
    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "transactions",
      },
    ],
  },
  { timestamps: true }
);

walletsSchema.index({ userId: 1, name: 1 }, { unique: true });

const Wallets = mongoose.model("wallets", walletsSchema);

module.exports = Wallets;
