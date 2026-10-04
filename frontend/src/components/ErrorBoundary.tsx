import { Component, type ErrorInfo, type ReactNode } from 'react';

import { errorToReport, reportClientError } from '@/lib/error-report';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Erro de renderização derruba a árvore React inteira (tela branca). Aqui ele
 * é reportado e a tela oferece recarregar, em vez de ficar em branco no meio
 * da competição.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const report = errorToReport(error, 'RenderError');
    reportClientError({ ...report, stack: report.stack ?? info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <p className="text-lg">Algo deu errado nesta tela. / Something went wrong.</p>
        <button
          type="button"
          className="rounded bg-white px-4 py-2 font-semibold text-black"
          onClick={() => window.location.reload()}
        >
          Recarregar / Reload
        </button>
      </div>
    );
  }
}
