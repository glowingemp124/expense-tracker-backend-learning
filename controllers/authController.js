const { User, generateResetToken } = require("../models/UserModel");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { sendResponse, validateParams } = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
const {
  registrationOtpEmailTemplate,
  forgotPasswordOtpEmailTemplate,
} = require("../helperUtils/emailTemplates");
const { createOrSkipDevice, Devices } = require("../models/Devices");
const validator = require("validator");

//register
const register = async (req, res) => {
  const {
    email,
    phoneNumber,
    deviceId,
    deviceType,
    userType,
    profileIcon,
    name,
    password,
    timezone,
    location,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const validationOptions = {
      rawData: [
        "name",
        "email",
        "password",
        "deviceId",
        "deviceType",
        "timezone",
        "userType",
      ],
      enumFields: {
        userType: ["user", "guest", "admin"], // Allowed values for userType
      },
      minLengthFields: {
        password: 6, // Password must be at least 6 characters long
      },
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Validate phone number format
    if (
      phoneNumber &&
      !validator.isMobilePhone(phoneNumber, "any", { strictMode: true })
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_phone",
      });
    }

    // Fetch existing user
    const existingEmail = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    const existingPhone = await User.findOne({
      phoneNumber: phoneNumber?.toLowerCase(),
      "verificationStatus.phoneNumber": "verified",
    });

    if (existingEmail) {
      if (
        (existingEmail.email === email.trim().toLowerCase(),
        existingEmail.verificationStatus.email === "verified")
      ) {
        return sendResponse({
          res,
          statusCode: 409,
          translationKey: "email_already",
        });
      }
    }

    if (existingPhone) {
      if (existingPhone.phoneNumber === phoneNumber.trim().toLowerCase()) {
        return sendResponse({
          res,
          statusCode: 409,
          translationKey: "phone_number_already",
        });
      }
    }

    let existingUser = existingEmail;

    // Restrict admin creation
    if (userType === "admin" || userType === "guest") {
      const adminCreationToken = req.header("x-admin-access-token");
      if (adminCreationToken != process.env.ADMIN_ACCESS_TOKEN) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to",
        });
      } 
    }

    let user;
    if (existingUser) {
      // Update existing user if email is not verified
      existingUser.verificationStatus.email = "pending";
      existingUser.verificationStatus.phoneNumber = "pending";
      user = existingUser;
      Object.assign(user, req.body);
      user.accountState.userType = userType;
    } else {
      // Create and save the user within the session
      user = new User({
        email,
        phoneNumber,
        deviceId,
        deviceType,
        profileIcon,
        name,
        password,
        timezone,
        location,
        accountState: { userType: userType },
        verificationStatus: {
          email: userType === "guest" ? "verified" : "pending",
        },
      });
    }

    const otp = user.generateOtp("email", user.timezone);

    await user.save({ session });

    // Send email within the transaction
    const subject = "Welcome! Verify Your Email";
    const mBody = registrationOtpEmailTemplate(otp);
    //await sendEmailViaBrevo([email], subject, mBody);

    // Commit the transaction
    await session.commitTransaction();

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = user.toJSON();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject);

    // Save device information (not part of the transaction)
    createOrSkipDevice(userObject._id, deviceId, deviceType);

    // Send successful response with token and user data
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "signup_successful",
      data: response,
    });
  } catch (error) {
    // Only abort the transaction if it hasn't been committed yet
    await session.abortTransaction();
    // Handle validation errors from Mongoose
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    const translationKey =
      error.name === "ValidationError"
        ? Object.values(error.errors)[0].message
        : error.message;

    return sendResponse({
      res,
      statusCode,
      translationKey,
      error,
    });
  } finally {
    session.endSession(); // Ensure the session is always ended
  }
};

//login

const login = async (req, res) => {
  try {
    const { email, password, deviceId, deviceType, timezone, userType } = req.body;

    const validationOptions = {
      rawData: ["email", "password", "deviceId", "deviceType", "timezone","userType"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    const user = await User.findByCredentials(email, password, userType);

    // Check if an error occurred
    if (user.error) {
      if (user.error === "user_not_found") {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "user_not_found",
        });
      } else if (user.error === "incorrect_password") {
        return sendResponse({
          res,
          statusCode: 401,
          translationKey: "incorrect_password",password
        });
      } else if (user.error === "user_type_mismatch") {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "user_type_mismatch", 
        });
      }
    }

    // Restrict admin login
    if (user.accountState.userType === "admin") {
      const adminCreationToken = req.header("x-admin-access-token");
      if (adminCreationToken === process.env.ADMIN_ACCESS_TOKEN) {
      } else {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to_1",
        });
      }
    }

    // Check the user's verification status
    const verificationStatus = user.verificationStatus["email"];
    if (verificationStatus === "pending") {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "your_account",
      });
    }

    if (verificationStatus === "rejected") {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "your_account_1",
      });
    }

    if (
      user.accountState.status === "restricted" ||
      user.accountState.status === "suspended"
    ) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "your_account_2",
      });
    }

    if (verificationStatus !== "verified") {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "your_account_3",
      });
    }

    // Update the user's timezone
    user.timezone = timezone;

    const token = user.generateAuthToken();

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = user.toJSON();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token, [], ["resetToken"]);

    // Save device information (not part of the transaction)
    createOrSkipDevice(userObject._id, deviceId, deviceType);

    // Send successful response with token and user data
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "login_success",
      data: response,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: error,
      error: error,
    });
  }
};

// Generate OTP
const generateOtp = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, phoneNumber, type } = req.body;
    const validationOptions = {
      rawData: [type === "email" ? "email" : "phoneNumber"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Validate phone number format
    if (
      type === "phoneNumber" &&
      phoneNumber &&
      !validator.isMobilePhone(phoneNumber, "any", { strictMode: true })
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_phone",
      });
    }

    let user;
    if (type === "email") {
      user = await User.findOne({ email: email.toLowerCase() }).select(
        "email accountState otpInfo"
      );
    } else if (type === "phoneNumber") {
      user = await User.findOne({ phoneNumber }).select(
        "phoneNumber accountState otpInfo"
      );
    }

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not",
      });
    }

    // Check if account is restricted
    if (["restricted", "suspended"].includes(user.accountState.status)) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "your_account_4",
      });
    }

    const otp = user.generateOtp(type, user.timezone);

    if (otp.error) {
      if (otp.error === "too_many_otp_requests") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "too_many_otp_requests",
        });
      }
    }

    await user.save({ session });

    // Send email or SMS within the transaction
    const subject = "Password Reset OTP";
    const mBody = forgotPasswordOtpEmailTemplate(otp);
    //await sendEmailViaBrevo([email], subject, mBody);

    await session.commitTransaction();
    session.endSession();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "otp_generated",
      data: { otp },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

//Verify otp
const verifyOtp = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, phoneNumber, type, otp } = req.body;
    const validationOptions = {
      rawData: [type === "email" ? "email" : "phoneNumber"],
    };
    if (type === "email") {
      validationOptions.rawData.push("otp");
    }
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Validate phone number format if the OTP is for phone
    if (
      type === "phoneNumber" &&
      phoneNumber &&
      !validator.isMobilePhone(phoneNumber, "any", { strictMode: true })
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_phone",
      });
    }

    let user;
    if (type === "email") {
      user = await User.findOne({ email: email.toLowerCase() }).select(
        "email accountState otpInfo verificationStatus timezone"
      );
    } else if (type === "phoneNumber") {
      user = await User.findOne({ phoneNumber }).select(
        "phoneNumber accountState otpInfo verificationStatus timezone"
      );
    }

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not",
      });
    }

    // Access the correct OTP based on the type (email or phone)
    const userOtpInfo =
      type === "email" ? user.otpInfo.emailOtp : user.otpInfo.phoneNumberOtp;

    if (type === "email") {
      // Check if the OTP matches
      if (userOtpInfo.otp !== otp.toString()) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_otp",
        });
      }

      // Check if the OTP has expired
      const currentTime = moment.tz(Date.now(), user.timezone).valueOf();
      if (userOtpInfo.otpExpires && userOtpInfo.otpExpires < currentTime) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "otp_has",
        });
      }
    }

    // Clear the OTP and OTP expiration after successful verification
    userOtpInfo.otp = "";
    userOtpInfo.otpExpires = "";
    userOtpInfo.otpUsed = true; // Mark OTP as used
    user.verificationStatus[type] = "verified"; // Mark verification as complete

    // Generate a password reset token (JWT or a UUID)
    const resetToken = generateResetToken(); // Function to generate a secure token
    user.resetToken = resetToken; // Save the token to the user model

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Fetch the updated user and profile icon simultaneously
    const updatedUser = await User.findById(user._id);

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = updatedUser.toJSON();

    // Generate a new auth token for the user
    const token = user.generateAuthToken();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "otp_verified",
      data: response,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error during OTP verification:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error",
      error: error,
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;

    const validationOptions = {
      rawData: ["email", "newPassword", "resetToken"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Find the user by email
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetToken: resetToken,
    });

    if (!user) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_valid",
      });
    }

    // Update the password and mark OTP as used
    user.password = newPassword;
    user.otpInfo.otpUsed = true; // Mark OTP as used
    user.otpInfo.otp = ""; // Clear OTP
    user.otpInfo.otpExpires = ""; // Clear OTP expiration
    user.resetToken = ""; // Clear OTP token

    await user.save();

    // Fetch the updated user with profile icon populated and generate a token simultaneously
    const [updatedUser, token] = await Promise.all([
      User.findById(user._id),
      user.generateAuthToken(),
    ]);

    // Apply toJSON method to strip out sensitive data
    const userObject = updatedUser.toJSON();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "password_has",
      data: response,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error_1",
      error: error,
    });
  }
};

const logout = async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user._id;

    // Use $pull to remove the specific device from the devices array
    await Devices.updateOne(
      { userId: userId }, // Find the user by userId
      { $pull: { devices: { deviceId: deviceId } } } // Remove the device with matching deviceId
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "logged_out",
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: err.message,
      error: err.message,
    });
  }
};
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const email = req.user.email;

    // Generate a random email using the userId and original email
    const randomEmail = `deleted_user_${userId}_${Date.now()}@example.com`;

    // Update the user's account state to hardDeleted and set the finalDeletionDate
    await User.findByIdAndUpdate(
      userId,
      {
      $set: {
        email: randomEmail, // replace with random email
        previousEmail: email, // store the original email
        "accountState.status": "hardDeleted", 
        "accountState.finalDeletionDate": new Date(), // set to now or your logic
      },
      },
      { new: true }
    );

    await Devices.updateOne(
      { userId: userId },
      { $set: { devices: [] } } // This will empty the array of devices for the user
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "account_deleted",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

const socialAuth = async (req, res) => {
  let { provider, socialId, email, name, deviceId, deviceType, timezone } =
    req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const validationOptions = {
      rawData: [
        "provider",
        "socialId",
        "name",
        "deviceId",
        "deviceType",
        "timezone",
      ],
      enumFields: {
        provider: ["google", "facebook", "apple"], // Allowed values for provider
      },
    };

    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    //if not email is provided, create a new emai with socialId and provider
    if (!email) {
      email = `${socialId}@${provider}.com`; // Create a temporary email
      // Note: This is just a placeholder. In a real application, you might want to handle this differently.
    } else {
      // Validate email format
      if (!validator.isEmail(email)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_email",
        });
      }
      // Normalize email to lowercase
      email = email.trim().toLowerCase();
    }


    // Check for existing user by email
    const existingUser = await User.findOne({ email });

    // If user exists, update or link the social provider
    if (existingUser) {
      let providerLinked = false;

      if (
        existingUser.accountState.status === "restricted" ||
        existingUser.accountState.status === "suspended"
      ) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "your_account_2",
        });
      }


      // Check if the social ID is already linked, if not, link it
      if (provider === "google" && !existingUser.googleId) {
        existingUser.googleId = socialId; // Link Google account
        providerLinked = true;
      } else if (provider === "facebook" && !existingUser.facebookId) {
        existingUser.facebookId = socialId; // Link Facebook account
        providerLinked = true;
      } else if (provider === "apple" && !existingUser.appleId) {
        existingUser.appleId = socialId; // Link Apple account
        providerLinked = true;
      }

      // Always update the provider and timezone, regardless of providerLinked status
      existingUser.provider = provider; // Update the provider field to reflect the latest social login
      existingUser.timezone = timezone; // Update the timezone to reflect the user's current login
      existingUser.accountState.status = "active"; // Ensure the account is active

      await existingUser.save({ session });
      const token = existingUser.generateAuthToken();

      // Ensure toJSON method is applied to strip out sensitive data
      const userObject = existingUser.toJSON();
      const response = formatUserResponse(userObject, token);

      // Save device information
      createOrSkipDevice(existingUser._id, deviceId, deviceType);

      await session.commitTransaction();
      session.endSession();

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "login_success",
        data: response,
      });
    } else {
      // If user does not exist, treat this as a signup
      const newUser = new User({
        email,
        name,
        provider, // Set the initial provider
        [`${provider}Id`]: socialId, // Dynamically store the provider ID
        timezone,
        verificationStatus: {
          email: "verified", // Mark email as verified
        },
      });

      await newUser.save({ session });

      // Generate a token for the new user
      const token = newUser.generateAuthToken();

      const jUser = newUser.toJSON();
      const response = formatUserResponse(jUser, token);

      // Save device information
      createOrSkipDevice(newUser._id, deviceId, deviceType);

      await session.commitTransaction();
      session.endSession();

      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "signup_successful",
        data: response,
      });
    }
  } catch (error) {
    // Rollback transaction in case of any error
    await session.abortTransaction();
    session.endSession();
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

module.exports = {
  register,
  login,
  generateOtp,
  verifyOtp,
  resetPassword,
  logout,
  deleteAccount,
  socialAuth,
};
