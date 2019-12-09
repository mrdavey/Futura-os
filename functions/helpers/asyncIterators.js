const { log } = require("../helpers/log");

exports.mapAsync = async (array, callback) => {
	try {
		let result = array.map((value, index) => callback(value, index));
		let promises = await Promise.all(result);
		return promises;
	} catch (e) {
		throw Error(`Error in mapAsync: ${e.message}`);
	}
};

/**
 * Takes an array and a promise, and resolves the promises in sequential order
 * @param {*} array An array contianing objects
 * @param {(entry)=>Promise} promiseCallback The promise to execute on each entry. 
 */
exports.sequentialPromisesResolution = async (array, promiseCallback) => {
	try {
		let result = array.reduce(async (previousPromise, entry, index) => {
			await previousPromise;
			log({ message: `--- Evaluating ${index + 1}/${array.length} ----`});
			return promiseCallback(entry);
		}, Promise.resolve());
		await result;
		log({ message: `--- Finished sequential promises! ----`});
	} catch (e) {
		throw e
	}
};

/**
 * Temporarily 'sleeps' the app
 * @param {Number} ms THe amount of milliseconds to 'sleep'
 */
exports.sleep = (ms) => {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}