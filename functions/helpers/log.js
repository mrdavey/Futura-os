const functions = require("firebase-functions");

const { postMessage } = require("./slack");
const { quietMode } = require("../constants")

exports.log = ({ title, message, details, postToSlack=false, overrideQuietMode=false, logDuringBacktest=false }) => {
    let shouldBeQuiet = overrideQuietMode ? !quietMode : quietMode
    if (!shouldBeQuiet && postToSlack) {
        postMessage({ title, message, details, type: "status" })
    }

    let mode = functions.config().env.mode
    if (mode !== "backtest" || (mode === "backtest" && logDuringBacktest)) {
        console.log(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
    }
}

exports.logNews = ({ title, message, details, postToSlack = true, overrideQuietMode = false }) => {
    let shouldBeQuiet = overrideQuietMode ? !quietMode : quietMode
    if (!shouldBeQuiet && postToSlack) {
        postMessage({ title, message, details, type: "news" })
    }
    console.log(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
}

exports.logError = async ({ title, message, details, postToSlack=true }) => {
    if (!quietMode && postToSlack) {
		await postMessage({ title, message, details, type: "error" });
	}
    console.error(`${title ? title + ": " : ""}${message ? message + "." : ""}${details ? details + "." : ""}`);
};
