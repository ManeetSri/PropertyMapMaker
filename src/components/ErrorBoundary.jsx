import React from "react";
import { clearSaved } from "../model/storage.js";

/** Stops any single render error from leaving a blank page with no way back. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Map editor crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h2>The editor hit an error.</h2>
        <pre>{String(this.state.error && this.state.error.message)}</pre>
        <div className="btnRow">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button
            className="danger"
            onClick={() => {
              clearSaved();
              window.location.reload();
            }}
          >
            Clear saved map and reload
          </button>
        </div>
      </div>
    );
  }
}
