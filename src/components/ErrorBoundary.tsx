import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, LayoutDashboard, WifiOff } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. the page name) */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isAutoRetrying: boolean;
}

const MAX_AUTO_RETRIES = 1;
const AUTO_RETRY_DELAY_MS = 3000;

/**
 * ErrorBoundary — wraps page content and catches any unhandled React errors.
 * Prevents a single page crash from bringing down the entire application.
 *
 * Features:
 *  • Auto-retries once after 3 seconds (handles transient data-race errors)
 *  • Never shows raw error messages / stack traces to end-users
 *  • Provides manual retry + navigate-home as fallback
 */
export class ErrorBoundary extends Component<Props, State> {
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0, isAutoRetrying: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Only log in development — never expose to end-users
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught:', error, errorInfo);
    }

    // Auto-retry once after a brief delay (handles transient render failures)
    if (this.state.retryCount < MAX_AUTO_RETRIES) {
      this.setState({ isAutoRetrying: true });
      this.autoRetryTimer = setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
          isAutoRetrying: false,
        }));
      }, AUTO_RETRY_DELAY_MS);
    }
  }

  componentWillUnmount() {
    if (this.autoRetryTimer) clearTimeout(this.autoRetryTimer);
  }

  private handleManualRetry = () => {
    this.setState({ hasError: false, error: null, retryCount: 0, isAutoRetrying: false });
  };

  private handleGoHome = () => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
    this.setState({ hasError: false, error: null, retryCount: 0, isAutoRetrying: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Show a subtle spinner while auto-retrying
    if (this.state.isAutoRetrying) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto w-10 h-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600 mb-4" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Reconnecting…</p>
          </div>
        </div>
      );
    }

    const { pageName } = this.props;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-8 max-w-lg w-full text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-5">
            <WifiOff className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>

          {/* Heading — user-friendly, no technical jargon */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {pageName ? `${pageName} couldn't load` : 'Page temporarily unavailable'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This is usually caused by a brief connection issue. Please try again — the rest of the application is working fine.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleManualRetry}
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
