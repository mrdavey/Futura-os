import TableComponent from "./tableComponent"
const React = require("react")

const { redditColumns } = require("../controllers/redditController")
const { newsColumns } = require("../controllers/newsController")
const { twitterColumns } = require("../controllers/twitterController")

const { Box, Button, Heading } = require("grommet")

let defaultState = {
    news: [],
    twitterStandard: [],
    twitterPremium: [],
    reddit: [],
}

class ToReviewComponent extends React.Component {
    state = defaultState

    loadData = async () => {
        this.props.toggleIsLoading(true)
        this.setState(defaultState)
        let reviews = await this.props.firebase.getToReview()
        this.setState( { ...reviews })
        this.props.toggleIsLoading(false)
    }

    render() {
        return (
            <Box pad="small">
                <Box align="center"><Button primary label="load to review data" onClick={this.loadData} margin="medium" /></Box>
                {this.state.reddit.length > 0 &&
                    <>
                    <Heading level={2}>Reddit </Heading>
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={redditColumns} data={this.state.reddit} source="reddit" toReview={true}/>
                    </>
                }
                {this.state.news.length > 0 &&
                    <>
                    <Heading level={2}>News </Heading>
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={newsColumns} data={this.state.news} source="news" toReview={true}/>
                    </>
                }
                {this.state.twitterStandard.length > 0 &&
                    <>
                    <Heading level={2}>Twitter Standard </Heading>
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={twitterColumns} data={this.state.twitterStandard} source="twitterStandard" toReview={true}/>
                    </>
                }
                {this.state.twitterPremium.length > 0 &&
                    <>
                    <Heading level={2}>Twitter Premium </Heading>
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={twitterColumns} data={this.state.twitterPremium} source="twitterPremium" toReview={true}/>
                    </>
                }
            </Box>
        )
    }
}

export { ToReviewComponent }