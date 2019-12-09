# Techincal Overview: Futura

The goal of Futura (named after [Futurama](https://www.youtube.com/watch?v=ussCHoQttyQ)) is to prove or disprove in the shortest amount of time the following:
 - a fully automated system can predict the best time to buy and sell bitcoin or ethereum,
 - it should be based soley on sentiment analysis of the industry's 'mood' (using no TA signals).

### A more general (less technical) and informative analysis can be found in this [blog post](https://medium.com/@mrdavey/an-experiment-in-sentiment-analysis-for-the-crypto-markets-e05df21beac6).

## Infrastructure and Design
Futura is designed to be deployed on Google Cloud Platform, utilising many of its products and services. It is also designed to be run as cheaply as possible, remaining within the 'free' tiers whenever possible.

The following diagram shows the services used and in their general functionality:
![Image of mindmap](/mindmap.png)

### Cloud/Firebase Functions
['Serverless' functions](/functions/) were used to isolate certain behaviours, modularise features, and increase reliability in scaling. Each function serves a specific purpose:
 - [Leela](/functions/Leela/index.js): When a new sentiment analysis entry has been added, determine whether a buy or sell signal should be made.
 - [Fry](/functions/Fry/index.js): Perform intermediate steps to make the buy / sell call. E.g. creating trade details, updating current status of the trade.
 - [Zapp]((/functions/Zapp/index.js)): Connects with exchange APIs to perform relevant buy / sells. Ensures completion or cancellation of orders.
 - [Farnsworth](/functions/Farnsworth/index.js): Independently creates an audit trail of trade details.
 - [Zoidberg](/functions/Zoidberg/index.js): Is the gatekeeper for all actions concering funds (i.e. kill switch, setting working capital, withdrawing profits)
 - [Bender]((/functions/Bender/index.js)): Manages long term storage of sentiment data (outside of the Firestore DB). This is also useful for staying within the free tiers as we don't need to read thousands of records from the DB.
 - [Fender](/functions/Fender/index.js): Updates the trade settings, which are used by Leela.

### App Engine
App Engine instances were used when sustained processing was required.
 - [Hermes](/Backend/Hermes/): Fetches the price of assets every 5 minutes, and calculates the sentiment score of 'the industry' every 30 minutes. It adds these records to the Firestore DB.

### Compute Engine
Compute Engine was used when a more custom VM was needed (when compared to App Engine instances), and a specific setup was required.
 - [Turanga](/Backend/Turanga/): On a set schedule (3-6 times daily), perform 50+ backtests with current and new trade settings. 
    - The best performing trade setting is immediately used in production. The duration of the backtest, how far back to correlate, and many other settings are randomised for each backtest. 
    - I think of it as a kind of evolutionary backtest, where the best performing settings for the most recent time period, wins, and continues the battle.
    - For more details, see [createRandomSettings()](/Backend/Turanga/controllers/randomGenerator.js)

### Firebase Hosting
Firebase hosting was used as it is nicely integrated, very easy to deploy and update, and works very well with React.js frontends.
 - [Scruffy](/Frontend/Scruffy/): This is a React.js frontend to view the most recent sentiment analysis entries and their scores. The associated sentiment score for a word can be changed easily via this interface. See below `Sentiment Analysis` section for more details.

## Sentiment Analysis
Instead of deploying a Natural Language Processing (NLP) based solution, I decided to use a more simple solution that would require much less training: AFINN and emoji word list scoring.

In this type of sentiment analysis, words (and emojis) are given a score ranging between +5 and -5. Based on the sum of the scores in a sentance or phrase, a simple number is returned signifying the magnitude of the positivity/negativity. This worked quite well, as long as the custom word list was also maintained, with new memes and meanings added as time progressed.

As the sentiment analysis is performed exclusively in [Hermes](/Backend/Hermes/controllers/sentimentController.js), it can be easily replaced with another sentiment analysis technique if needed.

## Running your own Futura
There are a few things you'll need in order to deploy everything in Futura:
 - Google Cloud Platform account (with billing enabled)
 - Advanced knowledge of Firebase
 - Intermediate knowledge of GCP
 - An account and API keys from Coinbase Pro
 - Intermediate knowledge of Javascript and Node.js

I've open sourced this repo so that others may get some ideas from how I designed this (since nothing else was publicly available when I started 6 months ago). If you're brave enough to deploy your own version of Futura, then you should review all the code carefully.

After you've reviewed the code:
1. Set up your Firebase project (this shouldn't be your first time!)
2. Change all instances of `sentiment-aad7f` to your project's ID.
3. In each folder with a `envTemplate` file, rename it to `.env` and add your own relevant values.
4. Follow the deploy instructions in each folder to deploy each individual service.
5. Make sure you setup your Firebase Firestore and Storage permissions correctly.

----

✌️ Feel free to reach out to me on Twitter: [@daveytea](https://twitter.com/daveytea)