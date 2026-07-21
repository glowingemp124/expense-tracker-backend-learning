const Categories = require("../../models/Categories");
const Stories = require("../../models/Stories");
const { parsePaginationParams, generateMeta } = require("../responseUtil");

const getStoriesHelper = async (req) => {
  const { page, limit } = parsePaginationParams(req);
  const language =
    req.query.language || (req.user && req.user.language) || "en";
  let categories = null;
  if (req.body.categories) {
    if (typeof req.body.categories === "string") {
      categories = req.body.categories.split(",");
    } else if (Array.isArray(req.body.categories)) {
      categories = req.body.categories;
    }
  }

  try {
    let matchStage = { "story.lang": language };
    let sortStage = { createdAt: -1 };

    let categoryFilter = [];
    if (categories && categories.length > 0) {
      categoryFilter = await Categories.find({
        _id: { $in: categories },
      }).select("key _id");
      categoryFilter = categoryFilter.map((category) => ({
        key: category.key,
        _id: category._id,
      }));
    }

    if (categoryFilter.length > 0) {
      matchStage["categories"] = { $in: categoryFilter.map((cat) => cat._id) };
    }

    const categoryKeys = categoryFilter.map((cat) => cat.key);
    if (categoryKeys.includes("all")) {
      matchStage = { "story.lang": language };
    } else if (categoryKeys.includes("recent")) {
      matchStage = { "story.lang": language };
      sortStage = { createdAt: -1 };
    } else if (categoryKeys.includes("popular")) {
      matchStage = { "story.lang": language };
      sortStage = { viewedByCount: -1 };
    } else if (categoryFilter.length > 0) {
      matchStage = {
        "story.lang": language,
        categories: { $in: categoryFilter.map((cat) => cat._id) },
      };
    }

    console.log("matchStage:", matchStage);

    let pipeline = [{ $match: matchStage }];
    pipeline.push({ $sort: sortStage });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    const [storiesDocs, total] = await Promise.all([
      Stories.aggregate(pipeline),
      Stories.countDocuments(matchStage),
    ]);

    const BASE_URL = `${process.env.S3_BASE_URL}/`;

    let filteredStories = [];
    storiesDocs.forEach((doc) => {
      if (Array.isArray(doc.story)) {
        filteredStories.push(
          ...doc.story
            .filter((item) => {
              if (item.lang !== language) return false;
              if (
                !categories ||
                categoryKeys.some((key) =>
                  ["all", "recent", "popular"].includes(key)
                )
              ) {
                return true;
              }
              return (
                !categoryFilter.length ||
                doc.categories.some((catId) =>
                  categoryFilter
                    .map((cat) => String(cat._id))
                    .includes(String(catId))
                )
              );
            })
            .map((entry) => {
              let media = doc.media || null;
              if (media && media.url && !media.url.startsWith("http")) {
                media = {
                  ...media,
                  url: `${BASE_URL}${media.url}`,
                };
              }

              let image = doc.image || null;
              if (image) {
                if (typeof image === "string") {
                  if (!image.startsWith("http")) {
                    image = `${BASE_URL}${image}`;
                  }
                } else if (typeof image === "object" && image.url) {
                  if (!image.url.startsWith("http")) {
                    image = `${BASE_URL}${image.url}`;
                  } else {
                    image = image.url;
                  }
                }
              }else{
                //attach noimage.png
                image = `${BASE_URL}noimage.png`;
              }

              return {
                  _id: doc._id,
                title: entry.title || "",
                description: entry.description || "",
                image,
                media,
                lang: entry.lang,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
              };
            })
        );
      }
    });

    const meta = generateMeta(page, limit, total);

    return {
      statusCode: 200,
      translationKey: "stories_found",
      data: filteredStories,
      meta,
    };
  } catch (error) {
    return {
      statusCode: 500,
      translationKey: error.message,
      error,
    };
  }
};

module.exports = { getStoriesHelper };
