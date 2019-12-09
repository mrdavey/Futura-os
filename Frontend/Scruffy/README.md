# Scruffy

Scruffy is a front end where you can view the recent scores and their associated content, and modify the sentiment score if appropriate.

Hermes reguarly analyses and scores sentiment, however we sometimes want to see _how_ Hermes is scoring each 'story' and what score is given to each associated word. Scruffy enables certain words to have certain scores when Hermes analyses them.

## To deploy
The following will build the React project, then upload the build folder contents to the relevant Firebase Hosting area.

    ```
    firebase deploy --only hosting:scruffy
    ```

## Note
 - If running locally via `npm run start`, then an instance of Hermes should also be running locally. See `/controllers/sentimentController.js` and modify the endpoint values (`hermesLocalEndpoint`, `hermesRemoteEndpoint`).
 - Remember to add your Firebase config object to `controllers/firebaseController.js`