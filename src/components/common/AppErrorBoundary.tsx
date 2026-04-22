import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

/**
 * Prevents transient backend/runtime errors from blank-screening the app.
 * Shows a minimal recovery UI with reload.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    // Keep this as console.error to ensure it surfaces in monitoring.
    console.error("[AppErrorBoundary] Uncaught error:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This is usually a temporary backend cold-start (503/BOOT_ERROR). Try
            reloading; if it persists, wait ~30s and retry.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium"
            >
              Try again
            </button>
          </div>
          {this.state.error ? (
            <pre className="mt-8 max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              {String(this.state.error)}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
