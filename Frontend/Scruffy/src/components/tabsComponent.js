const React = require("react")

const { RedditComponent } = require("./redditComponent")
const { NewsComponent } = require("./newsComponent")
const { TwitterComponent } = require("./twitterComponent")
const { ToReviewComponent } = require("./toReviewComponent")

const { Tab, Tabs } = require("grommet")

class TabsComponent extends React.Component {
    render() {
        return (
            <Tabs>
                <Tab title="Reddit">
                    <RedditComponent toggleIsLoading={this.props.toggleIsLoading} selection={this.props.directorySelection} getSentimentFile={this.props.getSentimentFile} currency={this.props.currency} />
                </Tab>
                <Tab title="News">
                    <NewsComponent toggleIsLoading={this.props.toggleIsLoading} selection={this.props.directorySelection} getSentimentFile={this.props.getSentimentFile} currency={this.props.currency} />
                </Tab>
                <Tab title="Twitter">
                    <TwitterComponent toggleIsLoading={this.props.toggleIsLoading} selection={this.props.directorySelection} getSentimentFile={this.props.getSentimentFile} currency={this.props.currency} />
                </Tab>
                <Tab title="Twitter Premium">
                    <TwitterComponent toggleIsLoading={this.props.toggleIsLoading} selection={this.props.directorySelection} getSentimentFile={this.props.getSentimentFile} currency={this.props.currency} fromPremium={true}/>
                </Tab>
                <Tab title="To Review">
                    <ToReviewComponent toggleIsLoading={this.props.toggleIsLoading} firebase={this.props.firebase}/>
                </Tab>
            </Tabs>
        )
    }
}

export { TabsComponent }