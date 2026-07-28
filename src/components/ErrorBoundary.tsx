import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. the page name) */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary — wraps page content and catches any unhandled React errors.
 * Prevents a single page crash from bringing down the entire application.
 *
 * Usage:
 *   <ErrorBoundary pageName="Patients">
 *     <Patients />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console in development; swap for Sentry / LogRocket in production
    console.error('[ErrorBoundary] Caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { pageName } = this.props;
    const { error } = this.state;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-2xl shadow-xl p-8 max-w-lg w-full text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-5">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          {/* Heading */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {pageName ? `"${pageName}" ran into a problem` : 'Something went wrong'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            An unexpected error occurred on this page. The rest of the application is unaffected.
          </p>

          {/* Error detail (collapsed, for developers) */}
          {error && (
            <details className="mb-6 text-left bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 cursor-pointer">
              <summary className="text-xs font-semibold text-gray-500 dark:text-gray-400 select-none">
                Technical details
              </summary>
              <pre className="mt-2 text-xs text-red-600 dark:text-red-400 overflow-auto whitespace-pre-wrap break-words">
                {error.toString()}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
