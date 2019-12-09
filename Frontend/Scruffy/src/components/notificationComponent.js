const React = require("react")
const { FormClose } = require("grommet-icons")
const { Box, Button, Layer, Text } = require("grommet")
const { round } = require("../helpers/numbers")

const NotificationLayer = (props) => {
    const [open, setOpen] = React.useState(0)
    const onClose = () => {
        setOpen(undefined)
    }

    React.useEffect(() => {
        setOpen(o => !o)
    }, [props.toggle])

    return (
        <>
        {open && (
            <Layer
                position="bottom"
                modal={false}
                margin={{ vertical: "medium", horizontal: "small" }}
                onEsc={onClose}
                responsive={false}
                plain
            >
                <Box
                    align="start"
                    direction="row"
                    gap="small"
                    justify="between"
                    round="medium"
                    elevation="medium"
                    pad={{ vertical: "xsmall", horizontal: "small" }}
                    background="light-4"
                >
                    <Box align="center" direction="column" gap="xsmall" pad="small">
                        {props.scores.averageScore ? (
                            <>
                            <Text size="small">Average score: {round(props.scores.averageScore)}</Text>
                            <Text size="small">Reddit score: {round(props.scores.reddit_cumulativeScore)}</Text>
                            <Text size="small">News score: {round(props.scores.news_cumulativeScore)}</Text>
                            <Text size="small">Twitter score: {round(props.scores.twitter_standard_cumulativeScore)}</Text>
                            <Text size="small">Twitter Prem score: {round(props.scores.twitter_premium_cumulativeScore)}</Text>
                            </>
                        ) : (
                            <Text size="small">Loading scores...</Text>
                        )}
                    </Box>
                    <Button icon={<FormClose />} onClick={onClose} plain />
                </Box>
            </Layer>
        )}
        </>
    )
}

export { NotificationLayer }