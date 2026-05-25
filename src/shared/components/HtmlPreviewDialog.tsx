import { useRef } from 'react';

type HtmlPreviewDialogProps = {
  title: string;
  subtitle?: string;
  html: string;
  variant?: 'compact' | 'wide' | 'xwide';
  onClose: () => void;
};

function sanitizeFileName(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ');
  return clean || 'documento';
}

function resolvePdfFileName(doc: Document, fallbackTitle: string): string {
  const titleText = doc.querySelector('title')?.textContent?.trim() || fallbackTitle;
  const baseName = sanitizeFileName(titleText);
  return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
}

async function savePdfBlob(blob: Blob, fileName: string): Promise<void> {
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker === 'function') {
    const handle = await picker({
      suggestedName: fileName,
      types: [
        {
          description: 'PDF',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadAsPdf(
  iframe: HTMLIFrameElement | null,
  title: string,
  variant: 'compact' | 'wide' | 'xwide',
): Promise<void> {
  const sourceDoc = iframe?.contentDocument;
  if (!sourceDoc?.body) {
    throw new Error('No se pudo preparar el documento para exportar PDF.');
  }

  const module = await import('html2pdf.js');
  const html2pdf = (module as any).default ?? module;
  const fileName = resolvePdfFileName(sourceDoc, title);

  const sandbox = document.createElement('div');
  sandbox.style.position = 'fixed';
  sandbox.style.left = '-99999px';
  sandbox.style.top = '0';
  sandbox.style.background = '#fff';
  sandbox.style.zIndex = '-1';

  const sourceHtml = sourceDoc.documentElement.cloneNode(true) as HTMLElement;
  sandbox.appendChild(sourceHtml);
  document.body.appendChild(sandbox);

  try {
    const target = sourceHtml.querySelector('body') ?? sourceHtml;
    const worker = html2pdf().set({
      filename: fileName,
      margin: variant === 'compact' ? [2, 2, 2, 2] : [8, 8, 8, 8],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: variant === 'compact' ? 3 : 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: variant === 'compact'
        ? { unit: 'mm', format: [80, 297], orientation: 'portrait' }
        : { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(target);

    const blob = await worker.outputPdf('blob');
    await savePdfBlob(blob, fileName);
  } finally {
    sandbox.remove();
  }
}

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
          width:
            variant === 'compact'
              ? 'min(560px, 96vw)'
              : variant === 'xwide'
                ? 'min(1320px, 98vw)'
                : 'min(1100px, 96vw)',
          height: variant === 'compact' ? 'min(860px, 94vh)' : variant === 'xwide' ? 'min(900px, 96vh)' : 'min(820px, 94vh)',
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
                void downloadAsPdf(iframeRef.current, title, variant);
              }}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
            >
              Descargar PDF
            </button>
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
              minHeight: variant === 'compact' ? '620px' : variant === 'xwide' ? '640px' : '540px',
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