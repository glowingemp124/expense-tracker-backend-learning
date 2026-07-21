require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const express = require("express");
const connectToDB = require("./helperUtils/server-setup");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const walletRoutes = require("./routes/walletRoutes.js");
const categoryRoutes = require("./routes/categoryRoutes.js");
const transactionRoutes = require("./routes/transaction.js");
const dashboardRoutes = require("./routes/dashboardRoutes.js");
const periodRoutes = require("./routes/periodRoutes.js");

const uploadRoutes = require("./routes/uploadRoutes");
const uploads3Routes = require("./routes/uploadAWSRoutes.js");
const { sendResponse } = require("./helperUtils/responseUtil");
const bulkInsertRoutes = require("./routes/dbRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes.js");
const communicationRoutes = require("./routes/communicationRoutes");
const notificationsRoutes = require("./routes/notificationsRoutes");
const supportRoutes = require("./routes/supportRoutes");
const contactUsRoutes = require("./routes/contactUsRoutes");
const { i18nConfig } = require("./config/i18nConfig");
const languagesRoutes = require("./routes/languageRoutes");
const homeRoutes = require("./routes/homeRoutes");
const adminsRoutes = require("./routes/adminRoutes");
const homePageInsightsRoutes = require("./routes/homePageInsightsRoutes");
const categories = require("./routes/categoriesRoutes");
const stories = require("./routes/storiesRoutes");
const errorHandler = require("./middlewares/error.js");

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Express app
const app = express();

// Enable CORS middleware
const corsOptions = {
  origin: "*", // Allow all origins
  methods: "*", // Allow all methods
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-access-token"],
};

app.use(cors(corsOptions)); // Apply CORS middleware

// i18n middleware initialization for language localization
app.use(i18nConfig.init); // Use i18n middleware for localization

// Create a write stream for logging in background (asynchronous, non-blocking)
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, `access-${new Date().toISOString().slice(0, 10)}.log`),
  { flags: "a", encoding: "utf8", mode: 0o666, autoClose: true }
);

// Auto-delete log files older than 1 week (run in background)
// 7 days in milliseconds
const ONE_WEEK_MS = 604800000; // 7 * 24 * 60 * 60 * 1000
setImmediate(() => {
  fs.readdir(logsDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      if (file.startsWith('access-') && file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (Date.now() - stats.mtimeMs > ONE_WEEK_MS) {
            fs.unlink(filePath, () => { });
          }
        });
      }
    });
  });
});

// Morgan middleware for request logging to file
app.use(morgan("combined", { stream: accessLogStream }));

// Morgan middleware for request logging to console
app.use(morgan("dev"));

// Middleware to parse JSON bodies
app.use(express.json());

connectToDB(app);


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/periods", periodRoutes);

app.use("/api/upload", uploadRoutes);
app.use("/api/upload/s3", uploads3Routes);
app.use("/api/settings", adminSettingsRoutes);
app.use("/api/communications", communicationRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/contact-us", contactUsRoutes);

app.use("/api/languages", languagesRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/admin", adminsRoutes);

app.use("/api/home-page-insights", homePageInsightsRoutes);
app.use("/api/categories", categories);
app.use("/api/stories", stories);
app.use(errorHandler);



//db utils routes
app.use("/api/util", bulkInsertRoutes);

// Global error handler
app.use((req, res, next) => {
  sendResponse({
    res,
    statusCode: 404,
    translationKey: "route_not_found",
  });
});


// Export your app for testing or other modules
module.exports = app;
