const React = require("react")
const { BarLoader } = require("react-spinners")

const { getScore, saveScore } = require("../controllers/sentimentController")

const { Anchor, Box, Button, Heading, Text, TextInput, Layer } = require("grommet")
const { Close } = require("grommet-icons")

class SideLayer extends React.Component {
    state = { isLoading: false, open: false, score: "", changeScore: "", newWord: "", newScore: "" }

    onOpen = () => this.setState({ open: true })

    onClose = () => { this.setState({ open: undefined })}

    renderScore = async () => {
        this.setState({ isLoading: true })
        let analysis = await getScore(this.props.label)
        this.setState({ score: analysis.score, isLoading: false })
    }

    saveScore = async (e) => {
        e.preventDefault()
        this.setState({ isLoading: true })
        let { newWord, newScore, changeScore } = this.state

        let word;
        let score;

        if (changeScore) {
            score = changeScore
            word = this.props.label
        }

        if (newScore) {
            score = newScore
            word = newWord
        }

        await saveScore(word, score)
        this.setState({ newWord: "", newScore: "", changeScore: "", score, isLoading: false })
    }

    render() {
        let { isLoading, open, score, changeScore, newWord, newScore } = this.state
        return (
            <Box fill align="start" justify="center">
                <Anchor label={this.props.label} onClick={this.onOpen}  />
                {open && (
                    <Layer
                        modal
                        onClickOutside={this.onClose}
                        onEsc={this.onClose}
                    >
                        <BarLoader widthUnit={"%"} width={100} heightUnit={"px"} height={5} color={"#777777"} loading={isLoading} />
                        <Box
                            as="form"
                            fill="vertical"
                            overflow="auto"
                            width="medium"
                            pad="medium"
                        >
                            <Box flex={false} direction="row" justify="between">
                                <Heading level={2} margin="none">
                                    Word: {this.props.label}
                                 </Heading>
                                <Button icon={<Close />} onClick={this.onClose} />
                            </Box>

                            <Box flex={false} direction="column" justify="between" pad={{ vertical: "medium"}} gap="medium">
                                <Text>{this.props.type} sentiment word with current score: {score} <Anchor label="(refersh score)" size="small" onClick={this.renderScore} /></Text>
                                <TextInput placeholder="Insert new score" value={changeScore} onChange={e => this.setState({ changeScore: e.target.value })} />
                            </Box>
                            
                            <Box flex={false} as="footer" align="start">
                                <Button
                                    type="submit"
                                    label="Change Score"
                                    onClick={e => this.saveScore(e)}
                                />
                            </Box>
                        </Box>
                        
                        <Box
                            as="form"
                            fill="vertical"
                            overflow="auto"
                            width="medium"
                            pad="medium"
                        >
                            <Box flex={false} direction="row" justify="between">
                                <Heading level={3} margin="none">
                                    Add new word
                                </Heading>
                            </Box>

                            <Box flex={false} direction="column" justify="between" pad={{ vertical: "medium" }} gap="medium">
                                <Text>Insert the new word to be used in sentiment analysis</Text>
                                <TextInput placeholder="New word" value={newWord} onChange={e => this.setState({ newWord: e.target.value })} />
                                <TextInput placeholder="Score" value={newScore} onChange={e => this.setState({ newScore: e.target.value })}/>
                            </Box>

                            <Box flex={false} as="footer" align="start">
                                <Button
                                    type="submit"
                                    label="Submit new word/score"
                                    onClick={e => this.saveScore(e)}
                                />
                            </Box>
                        </Box>
                    </Layer>
                )}
            </Box>
        )
    }
}

export { SideLayer }