import TableComponent from "./tableComponent"
const React = require("react")
const { twitterColumns, processTwitterData } = require("../controllers/twitterController")

const { Box, Button } = require("grommet")

class TwitterComponent extends React.Component {
    state = {
        columns: twitterColumns,
        data: []
    }

    loadData = async () => {
        this.props.toggleIsLoading(true)
        let file = await this.props.getSentimentFile(this.props.currency, this.props.selection, this.props.fromPremium ? "twitterPremium" : "twitterStandard")
        let data = await processTwitterData(file).catch(e => {
            console.log(e.message)
            return []
        })
        this.setState({ data })
        this.props.toggleIsLoading(false)
    }

    render() {
        return (
            <>
            <Box pad="small">
                <Box align="center"><Button primary label={`load twitter ${this.props.fromPremium ? "premium" : "standard"} data`} onClick={this.loadData} margin="medium"/></Box>
                {this.state.data.length > 0 &&
                        <TableComponent toggleIsLoading={this.props.toggleIsLoading} columns={this.state.columns} data={this.state.data} source={this.props.fromPremium ? "twitterPremium" : "twitterStandard"} />
                }
            </Box>
            </>
        )
    }
}

export { TwitterComponent }