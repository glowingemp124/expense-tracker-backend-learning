const express = require("express");
const {
  dashboard,
  getUserStatsByRegion,
  allUsers,
  getSupportRequests,
  updateSupportRequestStatus,
  deleteSupportRequest,
  getContactRequests,
  updateContactRequestStatus,
  deleteContactRequest,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  updateUserAccountState

} = require("../controllers/adminPanelController");
const auth = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();
router.use(auth);
router.use(roleMiddleware(["admin"]));
router.get("/dashboard", dashboard);
router.get("/user-stats-by-region", getUserStatsByRegion);
router.get("/all-users", allUsers);

// Route to update support request status (Admin)
router.get("/support-requests", getSupportRequests);
router.put("/support-requests/:id", updateSupportRequestStatus);
router.delete("/support-requests/:id", deleteSupportRequest);

// Route to get all contact requests (Admin)
router.get("/contact-us", getContactRequests);

// Route to update contact request status (Admin)
router.put("/contact-us/:id", updateContactRequestStatus);

router.delete("/contact-us/:id", deleteContactRequest);


//faqs
router.get("/faqs", getFaqs);
router.post("/faqs", createFaq);
router.put("/faqs/:id", updateFaq);
router.delete("/faqs/:id", deleteFaq);

router.patch("/users/:userId/account-state", updateUserAccountState);


module.exports = router;
