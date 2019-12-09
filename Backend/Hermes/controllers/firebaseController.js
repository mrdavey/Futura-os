const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_DATABASEURL,
    storageBucket: process.env.FIREBASE_STORAGEBUCKET
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

exports.saveSentimentData = async (dateId, assetKey, data) => {
    await db
        .collection("sentiment")
        .doc(`${assetKey}`)
        .collection("scores")
        .doc(`${dateId}`)
        .set({ ...data, timeStamp: admin.firestore.Timestamp.fromDate(new Date(dateId)) })
        .catch(e => {
            throw Error(`firebase saveSentimentData: ${e.message}`)
        })
};

exports.savePriceData = async (id, data) => {
    await db.collection("prices")
		.doc(`${id}`)
        .set({ ...data, timeStamp: admin.firestore.Timestamp.fromDate(new Date(id)) })
        .catch(e => {
            throw Error(`firebase savePriceData: ${e.message}`)
        })
}

/**
* Gets the latest prices of a currency to be used in calculating moving averages
*/
exports.getMostRecentPrices = async (numberOfEntries) => {

    let snapshot = await db
        .collection("prices")
        .orderBy("timeStamp", "desc")
        .limit(numberOfEntries)
        .get()
        .catch((e) => {
            let message = `Error in firebase getMostRecentPrices: ${e.message}`;
            throw Error(message);
        });

    let docs = snapshot.docs
    if (docs.length === 0) {
        log({ message: "No valid price data returned! Something is wrong..." })
        return null
    }

    return docs.map(doc => doc.data())
}

exports.getExtraWords = async () => {
    return await _bucketDownload("Hermes/extraWords.json").catch(e => {
        throw Error(`getExtraWords: ${e.message}`)
    })
}

exports.saveExtraWords = async (newFile) => {
    return await _bucketUpload("Hermes/extraWords.json", newFile).catch(e => {
        throw Error(`saveExtraWords: ${e.message}`)
    })
}

async function _bucketDownload(fileName) {
    let file = bucket.file(fileName);
    let result = await file.download().catch((e) => {
        throw Error(`_bucketDownload: ${e.message}`)
    });
    return JSON.parse(result[0]);
}

async function _bucketUpload(fileName, data) {
    let file = bucket.file(fileName);
    let jsonData = JSON.stringify(data)

    await file.save(jsonData).catch(e => {
        throw Error(`_bucketUpload: ${e.message}`)
    })
}