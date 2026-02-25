import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SignalDesk render error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <h1>SignalDesk recovered from an unexpected UI error.</h1>
          <p>Please refresh the page. If this persists, clear local storage and retry.</p>
        </div>
      )
    }

    return this.props.children
  }
}
