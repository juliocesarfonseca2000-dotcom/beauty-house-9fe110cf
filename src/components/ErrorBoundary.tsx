import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode };
type State = { error: Error | null };

export function GlobalErrorFallback({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Erro inesperado";

  return (
    <div className="min-h-screen bg-bg2 flex items-center justify-center p-6">
      <div className="bh-card max-w-lg w-full p-8 text-center space-y-4">
        <div className="font-display text-2xl text-navy">Algo deu errado</div>
        <p className="text-sm text-text2">
          A tela encontrou um erro, mas o sistema continua protegido. Recarregue para tentar novamente.
        </p>
        <div className="rounded-lg bg-bg2 border border-border px-3 py-2 text-xs text-text3 break-words">
          {message}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportLovableError(error, { componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.error) return <GlobalErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}