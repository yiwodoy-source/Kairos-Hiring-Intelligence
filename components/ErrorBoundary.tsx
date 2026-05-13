import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          {this.props.fallbackLabel || 'Something went wrong'}
        </h2>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          An unexpected error occurred while rendering this page. You can try again or navigate to another section.
        </p>
        <button
          onClick={this.handleReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
