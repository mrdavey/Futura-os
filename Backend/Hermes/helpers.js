exports.moment = require("moment");

exports.mapAsync = async (array, callback) => {
    let result = array.map(callback);
    let promises = await Promise.all(result);
    return promises;
}

/**
 * Takes an array and a promise, and resolves the promises in sequential order
 * @param {*} array An array contianing objects
 * @param {(entry)=>Promise} promiseCallback The promise to execute on each entry. 
 */
exports.sequentialPromisesResolution = async (array, promiseCallback) => {
	try {
		let result = array.reduce(async (previousPromise, entry, index) => {
			await previousPromise;
			console.log(`--- Evaluating ${index + 1}/${array.length} ----`)
			return promiseCallback(entry);
		}, Promise.resolve());
		await result;
		console.log(`--- Finished sequential promises! ----`)
	} catch (e) {
		throw e
	}
};

exports.getAssetKey = (searchKey) => {
    switch (searchKey) {
		case "ethereum":
			return "ETH";
		case "bitcoin":
			return "BTC";
		default:
			return "BTC";
	}
}