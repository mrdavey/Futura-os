# Hermes

### Reguarly collects price and sentiment data

## Deployment to PRODUCTION
- From the `root` directory, run: 
    ```
    gcloud app deploy --project sentiment-aad7f Backend/Hermes/app.yaml
    ```

### To update HERMES cron jobs
 - From the `root` directory:
    ```
    gcloud app deploy Backend/cron.yaml --project sentiment-aad7f
    ```

## Notes:
 - App Engine standard environment has a 60 second timeout limit (!)
 - Remember to setup your custom words and scores in a Storage bucket. See [saveExtraWords()](controllers/firebaseController.js)