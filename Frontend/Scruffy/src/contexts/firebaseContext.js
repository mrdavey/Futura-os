const React = require("react");

export const FirebaseContext = React.createContext(null);

export const withFirebase = (Component) => (props) => (
	<FirebaseContext.Consumer>{(firebase) => <Component {...props} firebase={firebase} />}</FirebaseContext.Consumer>
);
