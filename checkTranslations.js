const fs = require("fs");
const path = require("path");

// Path to base language file
const baseLangFile = path.join(__dirname, "assets", "locales", "en.json");

// Paths to output files
const missingFile = path.join(__dirname, "missingTranslations.json");
const extraFile = path.join(__dirname, "extraTranslations.json");

// Root folder to scan for translationKey usage (adjust if needed)
const rootDir = __dirname;

// Load base translations JSON (en.json)
let baseTranslations = {};
try {
  baseTranslations = JSON.parse(fs.readFileSync(baseLangFile, "utf-8"));
} catch (err) {
  console.error("Failed to read base language file:", err);
  process.exit(1);
}

// Helper: Recursively scan files in directory (js, ts, jsx, etc.)
function scanFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(scanFiles(fullPath));
    } else if (
      /\.(js|ts|jsx|tsx|json|mjs|cjs)$/.test(file.name) &&
      !fullPath.includes("node_modules")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// Extract translation keys used in a file from lines like: translationKey: "key_name"
function extractTranslationKeys(fileContent) {
  const regex = /translationKey\s*:\s*['"]([^'"]+)['"]/g;
  const keys = new Set();
  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

// Helper: Convert snake_case or dot.case keys to readable string for default translations
function keyToReadableText(key) {
  const withSpaces = key.replace(/[_\.]+/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

(async () => {
  // Scan all files under rootDir
  console.log("Scanning files...");
  const files = scanFiles(rootDir);

  // Collect all translation keys found in codebase
  const foundKeys = new Set();

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const keys = extractTranslationKeys(content);
      keys.forEach((k) => foundKeys.add(k));
    } catch (err) {
      console.warn("Could not read file", filePath);
    }
  }

  console.log(`Total translation keys found in code: ${foundKeys.size}`);

  // Check missing keys: keys used in code but not in en.json
  const missingKeys = {};
  foundKeys.forEach((key) => {
    if (!(key in baseTranslations)) {
      missingKeys[key] = keyToReadableText(key);
      // Add missing key to baseTranslations with default translation
      baseTranslations[key] = missingKeys[key];
    }
  });

  // Check extra keys: keys in en.json but not used in code
  const extraKeys = {};
  Object.keys(baseTranslations).forEach((key) => {
    if (!foundKeys.has(key)) {
      extraKeys[key] = baseTranslations[key];
      // Remove extra keys from baseTranslations
      delete baseTranslations[key];
    }
  });

  // Write updated en.json (with missing keys added, extra keys removed)
  fs.writeFileSync(baseLangFile, JSON.stringify(baseTranslations, null, 2), "utf-8");
  console.log("Updated en.json saved with missing keys added and extra keys removed.");

  // Write missing keys to missingTranslations.json
  fs.writeFileSync(missingFile, JSON.stringify(missingKeys, null, 2), "utf-8");
  console.log(`Missing keys saved to: ${missingFile}`);

  // Write extra keys to extraTranslations.json
  fs.writeFileSync(extraFile, JSON.stringify(extraKeys, null, 2), "utf-8");
  console.log(`Extra keys saved to: ${extraFile}`);

  console.log("Done.");
})();
