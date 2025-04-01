import * as React from 'react';
import ErrorPage from './ErrorPage';

class ErrorBoundry extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(_error) {
        return { hasError: true };
    }

    componentDidCatch(error, _errorInfo) {
        this.setState({ errorMessage: error.message || 'Something went wrong!!!' });
    }

    resetError = () => {
        this.setState({ hasError: false, errorMessage: '' });
    };

    render() {
        if (this.state.hasError) {
            return <ErrorPage message={this.state.errorMessage} onReset={this.resetError}/>
        }
        return this.props.children;
    }
}
export default ErrorBoundry;