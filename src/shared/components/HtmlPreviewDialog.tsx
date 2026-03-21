import { useRef } from 'react';

type HtmlPreviewDialogProps = {
  title: string;
  subtitle?: string;
  html: string;
  variant?: 'compact' | 'wide';
  onClose: () => void;
};

export function HtmlPreviewDialog({
  title,
  subtitle,
  html,
  variant = 'wide',
  onClose,
}: HtmlPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3300,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: variant === 'compact' ? 'min(560px, 96vw)' : 'min(1100px, 96vw)',
          height: variant === 'compact' ? 'min(860px, 94vh)' : 'min(820px, 94vh)',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid #dbe4f0',
          borderRadius: '14px',
          boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid #e5e7eb',
            background: 'linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%)',
            color: '#fff',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.2px' }}>{title}</h4>
          {subtitle ? (
            <p style={{ margin: '4px 0 0', opacity: 0.86, fontSize: '0.85rem' }}>{subtitle}</p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f8fafc',
          }}
        >
          <small style={{ color: 'var(--color-muted)' }}>
            {variant === 'compact' ? 'Vista de ticket 80mm' : 'Vista previa A4 en pantalla'}
          </small>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                iframeRef.current?.contentWindow?.focus();
                iframeRef.current?.contentWindow?.print();
              }}
            >
              Imprimir
            </button>
            <button type="button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 12px 12px', background: '#eef2f7' }}>
          <iframe
            ref={iframeRef}
            title={title}
            srcDoc={html}
            style={{
              width: '100%',
              height: '100%',
              minHeight: variant === 'compact' ? '620px' : '540px',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              background: '#fff',
            }}
          />
        </div>
      </div>
    </div>
  );
}