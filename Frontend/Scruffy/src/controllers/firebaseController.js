// const fetch = require("node-fetch")
const firebase = require("firebase/app");
require("firebase/auth");
require("firebase/firestore");
require("firebase/storage")

const firebaseConfig = {
    // Find this in Firebase project settings
};

export class Firebase {
    constructor() {
        firebase.initializeApp(firebaseConfig);
        firebase.firestore()

        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.bucket = firebase.storage();
    }

    doSignIn = async () => {
        var provider = new firebase.auth.GoogleAuthProvider();
        let signin = await firebase
            .auth()
            .signInWithPopup(provider)
            .catch((e) => {
                console.log(e);
            });
        let user = signin.user;
        console.log(user.email);
    };

    //
    // Firestore
    //

    saveForReview = async (source, entries) => {
        let batch = this.db.batch()
        let ref = this.db
            .collection("scruffy")
            .doc('toReview')
            .collection('unprocessed')
        
        entries.map(entry => {
            batch.set(ref.doc(`${entry.timestamp}`), { ...entry, source })
            return null
        })

        await batch.commit()
    }

    getToReview = async () => {
        let snapshot = await this.db
            .collection("scruffy")
            .doc('toReview')
            .collection('unprocessed')
            .get()
        let docs = {}

        snapshot.docs.map(entries => {
            let data = entries.data()
            let source = data.source
            docs[source] = (docs[source] || []).concat(data)
            return null
        })

        console.log(docs)
        return docs
    }

    deleteReview = async (entries) => {
        let batch = this.db.batch()
        let ref = this.db
            .collection("scruffy")
            .doc('toReview')
            .collection('unprocessed')

        entries.map(entry => {
            batch.delete(ref.doc(`${entry.timestamp}`))
            return null
        })

        await batch.commit()
    }

    // Currency as in `BTC` or `ETH`
    getLatestScore = async (currency) => {
        let snapshot = await this.db
            .collection("sentiment")
            .doc(currency)
            .collection("scores")
            .orderBy("timeStamp", "desc")
            .limit(1)
            .get()

        return snapshot.docs[0].data()
    }

    //
    // Storage
    //

    getRootDirectories = async () => {
        let files = await this._listDirectories(`rawSentiment`)
        return files
    }

    getSentimentFile = async (currency, date, source) => {
        return await this._getDataFromBucket(`rawSentiment/${date}/${currency}/${source}`, "included.json")
    }

    _getDataFromBucket = async (folder, filename) => {
        let pathReference = await this.bucket.ref(`${folder}/${filename}`);
        let fileURL = await pathReference.getDownloadURL()

        let response = await fetch(fileURL)
        let result = await response.json()
        return result;
    }

    _listDirectories = async (folder, filter) => {
        let listRef = this.bucket.ref(`${folder}/`);
        let allFiles = await listRef.listAll()
        let paths = []
        allFiles.prefixes.map((path) => paths.unshift(path.name))

        if (filter) {
            return paths.filter(path => path.includes(filter))
        } else {
            return paths
        }
    }
}