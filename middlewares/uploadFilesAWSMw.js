const multer = require("multer");


// Memory storage for multer
const storage = multer.memoryStorage(); // Store files in memory as a buffer

// Multer middleware for file upload
const uploads3Mw = multer({
  storage: storage,
  // limits: { fileSize: 10 * 1024 * 1024 }, // Initial limit to handle larger uncompressed files
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb);
  },
}).array("files", 20);

// Function to check file type
function checkFileType(file, cb) {
  // Allow any file type
  cb(null, true);
}


module.exports = {
  uploads3Mw,
};
