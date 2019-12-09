import React from '../node_modules/react';
import ReactDOM from '../node_modules/react-dom';
import App from './App';

const { Firebase } = require("./controllers/firebaseController");
const { FirebaseContext } = require("./contexts/firebaseContext");
const { Grommet } = require("grommet");

const theme = {
    global: {
        font: {
            family: 'Roboto',
            // size: '14px',
            // height: '20px',
        },
    },
};

ReactDOM.render(
    <FirebaseContext.Provider value={new Firebase()}>
        <Grommet theme={theme}>
            <App />
        </Grommet>
    </FirebaseContext.Provider>,
    document.getElementById("root")
);
