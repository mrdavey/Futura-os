import TableComponent from "./tableComponent"
const React = require("react")
const { redditColumns, processRedditData } = require("../controllers/redditController")

const { Box, Button } = require("grommet")

class RedditComponent extends React.Component {
    state = {
        columns: redditColumns,
        data: []
    }

    loadData = async () => {
        this.props.toggleIsLoading(true)

        let file = await this.props.getSentimentFile(this.props.currency, this.props.selection, "reddit")
        let data = await processRedditData(file)

        this.setState({ data })
        this.props.toggleIsLoading(false)
    }

    render() {
        return (
            <>
            <Box pad="small">
                <Box align="center"><Button primary label="load reddit data" onClick={this.loadData} margin="medium" /></Box>
                {this.state.data.length > 0 &&
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={this.state.columns} data={this.state.data} source="reddit" />
                }
            </Box>
            </>
        )
    }
}

export { RedditComponent }