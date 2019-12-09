# Futura

### See individual README.MDs in relevant directories

## Notes
 - To deploy all functions: From the `root` directory, run: 
    ```
    firebase deploy --only functions
    ```
 - To deploy specific functions:
    ```
    firebase deploy --only functions:nameOfFunction,functions:nameOfFunction
    ```
 - To deploy frontends:
    ```
    firebase deploy --only hosting
    ```
 - To deploy specific frontends:
    ```
    firebase deploy --only hosting:nameOfHostingTarget
    ```

---

## Notes
remember: https://www.svds.com/avoiding-common-mistakes-with-time-series/