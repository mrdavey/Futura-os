import TableComponent from "./tableComponent"
const React = require("react")
const { newsColumns, processNewsData } = require("../controllers/newsController")

const { Box, Button } = require("grommet")

class NewsComponent extends React.Component {
    state = {
        columns: newsColumns,
        data: []
    }

    loadData = async () => {
        this.props.toggleIsLoading(true)
        let file = await this.props.getSentimentFile(this.props.currency, this.props.selection, "news")
        let data = await processNewsData(file)
        this.setState({ data })
        this.props.toggleIsLoading(false)
    }

    render() {
        return (
            <>
            <Box pad="small">
                <Box align="center"><Button primary label="load news data" onClick={this.loadData} margin="medium"/></Box>
                {this.state.data.length > 0 &&
                    <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={this.state.columns} data={this.state.data} source="news"/>
                }
            </Box>
            </>
        )
    }
}

export { NewsComponent }