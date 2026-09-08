import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  props!: Props;
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[AppErrorBoundary]', error);
  }

  private onReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#171614',
            color: '#f3ede4',
            fontFamily: 'system-ui, sans-serif',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Ocurrió un error inesperado</h1>
          <p style={{ margin: '0 0 20px', opacity: 0.8, fontSize: 14 }}>
            La pantalla se detuvo por un error de interfaz. Tus datos están guardados.
          </p>
          <button
            onClick={this.onReload}
            style={{
              background: '#342e2a',
              color: '#f3ede4',
              border: '1px solid #54433c',
              borderRadius: 10,
              padding: '10px 22px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Recargar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}