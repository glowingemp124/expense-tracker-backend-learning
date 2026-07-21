const Wallets = require("../models/Wallets");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getDuplicateErrorMessage,
  validateParams,
} = require("../helperUtils/responseUtil");

// Get Wallets
const getAllWallets = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { status, keyword } = req.query;

  try {
    // Build query dynamically
    const query = { userId: req.user._id };

    // Filter by status if provided
    if (status && ["active", "inactive"].includes(status)) {
      query.status = status;
    }

    // Apply keyword search if provided
    if (keyword) {
      query.$or = [
        { name: { $regex: keyword, $options: "i" } },
        { walletNumber: { $regex: keyword, $options: "i" } },
      ];
    }

    // Fetch wallets with pagination
    const [wallets, total, activeCount, inactiveCount] = await Promise.all([
      Wallets.find(query)
        .sort({ balance: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Wallets.countDocuments(query),
      Wallets.countDocuments({ userId: req.user._id, status: "active" }),
      Wallets.countDocuments({ userId: req.user._id, status: "inactive" }),
    ]);

    const meta = generateMeta(page, limit, total);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Wallets fetched successfully",
      data: wallets,
      meta: {
        ...meta,
        counts: {
          active: activeCount,
          inactive: inactiveCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching wallets:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};


// // Get Wallets
// const getAllWallets = async (req, res) => {
//   const { page, limit } = parsePaginationParams(req);

//   try {
//     const [wallets, total] = await Promise.all([
//       Wallets.find({ userId: req.user._id })
//         .sort({ createdAt: -1 })
//         .skip((page - 1) * limit)
//         .limit(limit),
//       Wallets.countDocuments({ userId: req.user._id }),
//     ]);

//     const meta = generateMeta(page, limit, total);

//     return sendResponse({
//       res,
//       statusCode: 200,
//       translationKey: "Wallets fetched successfully",
//       data: wallets,
//       meta,
//     });
//   } catch (error) {
//     console.error("Error fetching wallets:", error);
//     return sendResponse({
//       res,
//       statusCode: 500,
//       translationKey: error.message,
//       error,
//     });
//   }
// };

// Create Wallets
const createWallet = async (req, res) => {
  const { name, balance, color } = req.body;

  const validationOptions = {
    rawData: ["name", "balance"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  // Check if same name wallet exists for the user
  const existingWallet = await Wallets.findOne({
    userId: req.user._id,
    name: name,
  });

  if (existingWallet) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "Wallet with the same name already exists",
    });
  }

  try {
    // Validate balance
    if (isNaN(balance)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Invalid balance value",
      });
    }

    const newWallet = new Wallets({
      userId: req.user._id,
      name: name || "",
      openingBalance: balance || 0,
      balance: balance || 0,
      color: color || "#4DB6AC",
      status: "active",
    });

    const savedWallet = await newWallet.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Wallet created successfully",
      data: savedWallet,
    });
  } catch (error) {
    const duplicateError = getDuplicateErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error: error,
    });
  }
};

// Update Wallets
const updateWallet = async (req, res) => {
  const { id } = req.params;
  const { name, balance, color, status } = req.body;

  try {
    const wallet = await Wallets.findById(id);

    if (!wallet) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Wallet not found",
      });
    }

    if (wallet.userId.toString() !== req.user._id.toString()) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "Not authorized to update this wallet",
      });
    }

    const payload = {};

    if (name !== undefined) payload.name = name;
    if (color !== undefined) payload.color = color;
    if (status !== undefined) payload.status = status;

    if (balance !== undefined) {
      const parsedBalance = Number(balance);
      if (isNaN(parsedBalance)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Balance must be a valid number",
        });
      }
      payload.balance = parsedBalance;
    }

    const updatedWallet = await Wallets.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updatedWallet) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Wallet not found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Wallet updated successfully",
      data: updatedWallet,
    });

  } catch (error) {
    const duplicateError = getDuplicateErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error: error,
    });
  }
};

// Delete Wallets
const deleteWallet = async (req, res) => {
  const { id } = req.params;

  try {
    const wallet = await Wallets.findById(id);

    if (!wallet) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Wallet not found",
      });
    }

    if (wallet.userId.toString() !== req.user._id.toString()) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "Not authorized to delete this wallet",
      });
    }

    if (wallet.transactions.length > 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Cannot delete wallet with existing transactions",
      });
    }

    await wallet.deleteOne();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Wallet deleted successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getAllWallets,
  createWallet,
  updateWallet,
  deleteWallet,
};
