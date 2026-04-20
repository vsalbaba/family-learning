import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Něco se pokazilo</h2>
          <p className="error-boundary__message">
            {this.state.error?.message}
          </p>
          <div className="error-boundary__actions">
            <button className="btn btn-primary" onClick={this.handleReset}>
              Zkusit znovu
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Obnovit stránku
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
