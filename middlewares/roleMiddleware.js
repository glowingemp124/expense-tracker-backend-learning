// middlewares/roleMiddleware.js
const { sendResponse } = require("../helperUtils/responseUtil");

const roleMiddleware = (allowedRoles) => (req, res, next) => {
  if (allowedRoles.includes(req.user.userType)) {
    next();
  } else {
    sendResponse({
      res,
      statusCode: 403,
      translationKey: `Access denied, ${allowedRoles.join(" or ")} only.`,
    });
  }
};

module.exports = roleMiddleware;

//e.g usage app.use("/shared-route", roleMiddleware(["admin", "trainer"]), (req, res) => {
