const React = require("react")
const { BarLoader } = require("react-spinners")

const { withAuthentication } = require("./contexts/authenticationContext");
const { TabsComponent } = require("./components/tabsComponent")
const { SelectComponent } = require("./components/selectComponent")
const { NotificationLayer } = require("./components/notificationComponent")

const { Box, Button, Text } = require("grommet")


class App extends React.Component {

  state = {
    directories: null,
    currencies: null,
    directorySelection: "",
    currencySelection: "bitcoin",
    isLoading: true,
    notificationToggle: false,
    scores: {}
  }

  async componentDidUpdate(prevProps, prevState) {
    if (!this.props.authUser) return 

    if (!prevState.directories && !this.state.directories) {
      let directories = await this.props.firebase.getRootDirectories()
      // SelectComponent needs the values to be updated to return the component
      this.setState({ directories, currencies: ["bitcoin", "ethereum"], isLoading: false })
    }
  }

  processDirectorySelection = (option) => {
    this.setState({ directorySelection: option })
  }

  processCurrencySelection = async (option) => {
    this.toggleNotification()
    this.setState({ currencySelection: option })

    // Get the latest sentiment scores from Firebase
    let { averageScore, scoreDetails } = await this.props.firebase.getLatestScore(option === "bitcoin" ? "BTC" : "ETH")
    let { news_cumulativeScore, reddit_cumulativeScore, twitter_premium_cumulativeScore, twitter_standard_cumulativeScore } = scoreDetails
    this.setState({ scores: { averageScore, news_cumulativeScore, reddit_cumulativeScore, twitter_premium_cumulativeScore, twitter_standard_cumulativeScore }})
    this.toggleNotification()
  }

  toggleIsLoading = (isLoading) => {
    this.setState({ isLoading })
  }

  toggleNotification = () => {
    this.setState({ notificationToggle: !this.state.notificationToggle })
  }

  render() {
    let currentUser = this.props.authUser
    let isLoading = this.state.isLoading
    return (
      <>
      <BarLoader widthUnit={"%"} width={100} heightUnit={"px"} height={5} color={"#777777"} loading={isLoading} />
      <NotificationLayer toggle={this.state.notificationToggle} scores={this.state.scores} />
      <Box margin="small">
        {!currentUser || currentUser.email !== "YOUR@EMAIL.COM" ? ( // For simple auth, add your email auth UID to your firestore DB rules
          <Box pad="small" fill={false} justify="center" alignContent="end" align="end">
            <Button primary label="Sign In" onClick={this.props.firebase.doSignIn} />
          </Box>
        ) : (
            <Box pad="small" fill={false} justify="center">
              <Text>Hi there David!</Text>
              <Box fill align="center" pad="large">
                <SelectComponent options={this.state.directories} processSelection={this.processDirectorySelection} />
                <SelectComponent options={this.state.currencies} processSelection={this.processCurrencySelection} />
              </Box>
              <TabsComponent directorySelection={this.state.directorySelection} getSentimentFile={this.props.firebase.getSentimentFile} currency={this.state.currencySelection} toggleIsLoading={this.toggleIsLoading} firebase={this.props.firebase} />
            </Box>
        )}
      </Box>
      </>
    );
  }
}

export default withAuthentication(App);