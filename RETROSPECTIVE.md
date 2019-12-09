# Restrospective: Futura

### This is a personal retrospective. For a more general and informative analysis, see this [blog post](https://medium.com/@mrdavey/an-experiment-in-sentiment-analysis-for-the-crypto-markets-e05df21beac6).

**Goal**: Using continual sentiment analysis of social content (twitter, reddit, news, etc), perform profitable trades by following the sentiment/price correlations.

**Outcome**: Unprofitable, likely overfitting to previous sentiment data and occasionally being right due to 'being fooled by randomness'. Further testing needed in a non-bear market as social signals _may become_ more correlated.

### Detailed post-mortem
*Starting capital:* 1,759.62 EUR

*Total P/L:* -703.7356774379 EUR

*Timeline*:
 - Started collecting data price and sentiment data: 2019-04-25 16:43
 - Deployed sentiment analysis of BTC with real funds to production: 2019-07-23
 - Deployed sentiment analysis of ETH with real funds to production: 2019-09-19
 - Project killed: 2019-11-18
 - Total production running time: 4 months
 - Total project running time: < 7 months
 - Total capital recycled: 57,562.90 EUR

*Skills gained*:
 - Deployment of a very complex Node.js based application in production, using real crypto funds
 - Utilising many different parts of Google's Cloud Platform (App Engine, Compute Engine, Cloud Functions, Firebase, Firestore)
 - Deployment of functional (but basic) React.js front end
 - Application required minimal to no maintainence after 5 months of development
 - See [mind map for infrastructure design](./Futura.pdf)

*Lessons learned*:
 - Randomness could be interpreted as trends or correlations. Cf Nassim Taleb books.
 - Very complex systems can be built from the ground up, with a good plan.
 - I work efficiently if I have a strong vision of what the end application should 'do'.
 - I struggle to be effective when the 'result' of the application undermines my thesis (correlation == profit).

*Things to do differently next time*:
 - Get to production faster, with smaller EUR amounts.
 - Plan infrastructure more carefully, but continue building iteratively.
 - Create or keep in mind test scaffolding from day zero.

*Things to do the same next time*:
 - Deploying connector for Coinbase API, without any other exchanges, was a good idea. Prove out the idea before expanding to scalable vision.
 - Use a combination of serverless functions and VM instances to ensure reliability, modularity, and potential scalability.