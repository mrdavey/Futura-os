const React = require("react")
const { Box, Select } = require("grommet")

class SelectComponent extends React.Component {
    state = {
        options: null,
        defaultOptions: [],
        value: ""
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.options === prevProps.options) return null
        let options = this.props.options
        this.setState({ options, defaultOptions: options  })
        this.handleSelect(options[0])
    }

    handleSelect(option) {
        this.setState({ value: option })
        this.props.processSelection(option)
    }

    render() {
        let { defaultOptions, options, value } = this.state

        if (options) {
            return (
                <Select
                    size="medium"
                    placeholder="Select"
                    value={value}
                    options={options}
                    onChange={({ option }) => this.handleSelect(option)}
                    onClose={() => this.setState({ options: defaultOptions })}
                    onSearch={text => {
                        const exp = new RegExp(text, "i");
                        this.setState({
                            options: defaultOptions.filter(o => exp.test(o))
                        });
                    }}
                />
            )
        } else {
            return (<></>)
        }
    }
}

export { SelectComponent }