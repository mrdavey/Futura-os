const express = require('express');
const cors = require("cors")
let router = express.Router();
let sentimentController = require('../controllers/sentimentController');
let schedulerController = require("../controllers/schedulerController");
// let twitterController = require('../controllers/twitterController');

// Admin
// router.get("/twitter/token", twitterController.getBearerToken);

let corsOptions = {
	origin: process.env.NODE_ENV === "production" ? "https://YOUR-FRONT-END-FOR-TESTING" : "http://localhost:3000",
	optionsSuccessStatus: 200
}

// Analyse sentiment
router.options("/analyse/", cors(corsOptions))
router.post("/analyse/", cors(corsOptions), sentimentController.analyseTextArray);
router.options("/analyse/getScore", cors(corsOptions))
router.post("/analyse/getScore", cors(corsOptions), sentimentController.getScore);
router.options("/analyse/saveScore", cors(corsOptions))
router.post("/analyse/saveScore", cors(corsOptions), sentimentController.saveScore);

router.get("/getSentimentData", schedulerController.getSentimentData);
router.get("/getPriceData", schedulerController.getPriceData);

module.exports = router;