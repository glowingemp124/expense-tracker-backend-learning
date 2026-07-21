const mongoose = require("mongoose");

const languageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      unique: true,
    },
    transliteration: {
      type: String,
      default: "",
      trim: true,
    },
    flag: {
      type: String,
      default: "",
    },
    code: {
      type: String,
      unique: true,
    },
    country: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);



// use .toJSON and add base url with flag
languageSchema.methods.toJSON = function () {
  const language = this;
  const languageObject = language.toObject();

  const baseUrl = `${process.env.S3_BASE_URL}/`;
  // Attach base URL to flag only if it doesn't already start with http
  if (languageObject.flag && !languageObject.flag.startsWith("http")) {
    languageObject.flag = baseUrl + languageObject.flag;
  } else if (!languageObject.flag) {
    languageObject.flag = baseUrl + "noimage.png";
  }

  return languageObject;
};

module.exports = mongoose.model("Language", languageSchema);
