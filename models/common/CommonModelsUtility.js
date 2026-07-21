const mongoose = require("mongoose");

//media schema
const MediaSchema = new mongoose.Schema({
  url: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    enum: ["audio"],
    required: true,
    default: "audio",
  },
  length: {
    type: String, // e.g. "4:00" minutes:seconds
    default: "",
  },
});

const LanguageSchema = new mongoose.Schema({
  value: {
    type: String,
    required: true,
    trim: true,
    default: "",
  },
  media: MediaSchema,
});

// attach base URL to media URL
MediaSchema.methods.toJSON = function () {
  const media = this;
  const mediaObject = media.toObject();
  const baseUrl = `${process.env.S3_BASE_URL}/`;
  // Attach base URL to media URL only if it doesn't already start with http
  if (mediaObject.url && !mediaObject.url.startsWith("http")) {
    mediaObject.url = baseUrl + mediaObject.url;
  } else if (!mediaObject.url) {
    mediaObject.url = null
  }
  return mediaObject;
};

module.exports = {
  MediaSchema,
  LanguageSchema,
};
