import { Component } from 'react'

// Catches render/runtime errors in a tab so one bad page doesn't crash the whole app.
export default class ErrorBoundary extends Component<any, any> {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[renderer] tab crashed:', error, info)
  }

  // Reset the error when the user navigates to a different tab.
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tab-error">
          <h3>Something went wrong on this tab.</h3>
          <p className="tab-error-msg">{this.state.error.message || String(this.state.error)}</p>
          <button className="tab-error-btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
