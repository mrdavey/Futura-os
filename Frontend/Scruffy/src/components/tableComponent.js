const React = require("react")
const m = require("moment")

const { withAuthentication } = require("../contexts/authenticationContext");
const { SideLayer } = require("./sideLayer")
const { round } = require("../helpers/numbers")

const { Anchor, Box, Button, CheckBox, DataTable } = require("grommet")

class TableComponent extends React.Component {

    state = {
        columnData: null,
        isLoading: true,
        checked: []
    }

    async componentDidUpdate(prevProps, prevState) {
        if (!this.props.columns) return
        
        if (!prevState.columnData && !this.state.columnData) {
            this.props.toggleIsLoading(true)
            console.log(`Entries to show: ${this.props.data.length}`)
            let columnData = this.renderColumns(this.props.columns)
            let checkMarkColumn = {
                property: "checkbox",
                render: datum => (
                    <CheckBox
                        key={datum.text}
                        checked={this.state.checked.indexOf(datum) !== -1}
                        onChange={e => this.onCheck(e, datum)}
                    />
                ),
                sortable: false
            }
            this.setState({ columnData: [checkMarkColumn, ...columnData] })            
            this.props.toggleIsLoading(false)
            this.setState({ isLoading: false})
        }
    }

    sendForReview = async () => {
        this.props.toggleIsLoading(true)
        let toReview = this.state.checked
        await this.props.firebase.saveForReview(this.props.source, toReview)
        this.setState({ checked: [] })
        this.props.toggleIsLoading(false)
        console.log("Successfully recorded for further review!")
    }

    sendForDeletion = async () => {
        this.props.toggleIsLoading(true)
        let toReview = this.state.checked
        await this.props.firebase.deleteReview(toReview)
        this.setState({ checked: [] })
        this.props.toggleIsLoading(false)
        console.log("Successfully deleted items!")
    }

    onCheck = (event, value) => {
        const { checked } = this.state;
        if (event.target.checked) {
            checked.push(value);
            this.setState({ checked });
        } else {
            this.setState({ checked: checked.filter(item => item !== value) });
        }
    };

    renderColumns = (columnData) => {        
        return columnData.map((data, index) => {
            let column = {
                property: data.name.toLowerCase(),
                header: data.name,
            }

            if (data.primary) column["primary"] = true
            if (data.footer) column["footer"] = data.footer
            if (data.search) column["search"] = true

            if (data.sentiment) {
                column["render"] = (datum) => {
                    if (data.name === "Score") return round(datum.score)
                    if (data.name === "Comparative") return round(datum.comparative)

                    if (data.name === "Positive") {
                        return datum.positive.map(word => <SideLayer key={Math.random()} type="Postive" label={word} />)
                    }

                    if (data.name === "Negative") {
                        return datum.negative.map(word => <SideLayer key={Math.random()} type="Negative" label={word} />)
                    }
                }
            }

            if (data.parseFromTime) {
                column["render"] = (datum) => {
                    return m(datum.created).fromNow()
                }
            }

            if (data.parseTime) {
                column["render"] = (datum) => {
                    return m(datum.timestamp).format("MMM Do, h:mm a").toString()
                }
            }

            if (data.link) {
                column["render"] = (datum) => {
                    if (datum.link) {
                        return <Anchor href={datum.link} target="_blank" primary label={datum.text} />
                    }

                    return ""
                }
            }

            if (data.contentLink) {
                column["render"] = (datum) => {
                    if (datum.contentLink) {
                        return <Anchor href={datum.contentLink} target="_blank" primary label={datum.domain} />
                    }
                    return "test"
                }
            }

            return column
        })
    }

    render() {
        if (!this.state.isLoading) {
            let currentlyReviewing = this.props.toReview
            return (
                <>
                {this.state.checked.length > 0 &&
                    <Box align="center" pad="xsmall">
                        <Button label={currentlyReviewing ? "Delete checked" : "Send for review"} onClick={currentlyReviewing ? this.sendForDeletion : this.sendForReview} margin="xsmall" />
                    </Box>
                }
                <DataTable
                    columns={this.state.columnData}
                    data={this.props.data}
                    sortable
                    resizeable
                    groupBy={this.props.groupBy}
                />
                </>
            )
        } else {
            return (<></>)
        }
    }
}

export default withAuthentication(TableComponent)