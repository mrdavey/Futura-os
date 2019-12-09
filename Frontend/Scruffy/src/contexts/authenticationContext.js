const React = require('react');

const { withFirebase } = require("./firebaseContext");

export const withAuthentication = Component => {
    class WithAuthentication extends React.Component {

        constructor(props) {
            super(props);
            this.state = {
                authUser: null
            }
        }

        componentDidMount() {
            // Check if the user has signed in
            this.listener = this.props.firebase.auth.onAuthStateChanged(authUser => {
                this.setState({ authUser })
            })
        }

        componentWillUnmount() {
            this.listener();
        }

        render() {
            return (
                <Component {...this.props} {...this.state}/>
            );
        }
    }
    return withFirebase(WithAuthentication);
}