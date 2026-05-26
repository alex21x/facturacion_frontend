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

async function waitForDocumentToRender(doc: Document): Promise<void> {
  const images = Array.from(doc.querySelectorAll('img'));
  const imagePromises = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      // Evita bloqueos cuando el navegador no dispara load/error por CORS.
      window.setTimeout(done, 2500);
    });
  });

  await Promise.all(imagePromises);

  try {
    await (doc as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
  } catch {
    // noop: si falla fonts.ready seguimos con el render.
  }

  // Da tiempo a layout/reflow para que html2canvas capture estado final.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function downloadAsPdf(
  iframe: HTMLIFrameElement | null,
  title: string,
  variant: 'compact' | 'wide' | 'xwide',
): Promise<void> {
  // For A4/xwide documents, native print engine preserves layout fidelity better
  // than canvas-based conversion, so users can save as PDF without distortion.
  if (variant !== 'compact') {
    const win = iframe?.contentWindow;
    if (!win) {
      throw new Error('No se pudo preparar el documento para exportar PDF.');
    }

    win.focus();
    win.print();
    return;
  }

  const sourceDoc = iframe?.contentDocument;
  if (!sourceDoc?.body) {
    throw new Error('No se pudo preparar el documento para exportar PDF.');
  }

  const module = await import('html2pdf.js');
  const html2pdf = (module as any).default ?? module;

  // A4 = 210mm × 297mm at 96dpi = 794 × 1123px.
  // Ticket 80mm at 96dpi ≈ 302px wide; use 380px for safety.
  // CRITICAL: the export iframe MUST be exactly the target paper width in CSS pixels,
  // otherwise html2canvas captures a wider body and jsPDF distorts the result.
  const EXPORT_W = variant === 'compact' ? 380 : 794;
  const EXPORT_H = variant === 'compact' ? 2400 : 3000; // tall enough for any content

  const exportFrame = document.createElement('iframe');
  exportFrame.style.position = 'fixed';
  exportFrame.style.left = '-99999px';
  exportFrame.style.top = '0';
  exportFrame.style.width = `${EXPORT_W}px`;
  exportFrame.style.height = `${EXPORT_H}px`;
  exportFrame.style.opacity = '0';
  exportFrame.style.pointerEvents = 'none';
  exportFrame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(exportFrame);

  try {
    exportFrame.srcdoc = sourceDoc.documentElement.outerHTML;

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      exportFrame.addEventListener('load', done, { once: true });
      exportFrame.addEventListener('error', done, { once: true });
      window.setTimeout(done, 4000);
    });

    const exportDoc = exportFrame.contentDocument;
    if (!exportDoc?.body) {
      throw new Error('No se pudo preparar el documento aislado para PDF.');
    }

    const exportHead = exportDoc.head;
    if (exportHead && !exportHead.querySelector('base')) {
      const baseTag = exportDoc.createElement('base');
      baseTag.setAttribute('href', sourceDoc.baseURI || `${window.location.origin}/`);
      exportHead.prepend(baseTag);
    }

    // Force body/html to match the exact export frame width so the .sheet fills 100%.
    const fitStyle = exportDoc.createElement('style');
    fitStyle.textContent = [
      '.no-print{display:none !important;}',
      `html,body{width:${EXPORT_W}px !important;max-width:${EXPORT_W}px !important;margin:0 !important;padding:0 !important;overflow-x:hidden !important;zoom:1 !important;transform:none !important;}`,
      `.sheet{width:${EXPORT_W}px !important;max-width:${EXPORT_W}px !important;box-sizing:border-box !important;}`,
      '.header--a4 .logo-col{width:42mm !important;max-width:42mm !important;min-width:42mm !important;overflow:hidden !important;}',
      '.header--a4 .header-logo{width:auto !important;max-width:36mm !important;max-height:22mm !important;height:auto !important;display:block !important;object-fit:contain !important;}',
    ].join('');
    exportHead?.appendChild(fitStyle);

    await waitForDocumentToRender(exportDoc);

    const fileName = resolvePdfFileName(exportDoc, title);
    const target = exportDoc.body;

    // Use rendered box sizes instead of raw scrollHeight to avoid runaway canvases.
    const targetHeight = Math.ceil(target.getBoundingClientRect().height);
    const bodyHeight = Math.ceil(exportDoc.body.getBoundingClientRect().height);
    const minHeight = variant === 'compact' ? 1200 : 1123;
    const maxHeight = variant === 'compact' ? 5200 : 7200;
    const exportHeight = Math.min(Math.max(targetHeight, bodyHeight, minHeight), maxHeight);

    const worker = html2pdf().set({
      filename: fileName,
      margin: variant === 'compact' ? [2, 2, 2, 2] : [0, 0, 0, 0],
      image: { type: 'jpeg', quality: 0.9 },
      html2canvas: {
        scale: variant === 'compact' ? 2.2 : 1.9,
        useCORS: true,
        allowTaint: false,
        logging: false,
        foreignObjectRendering: false,
        backgroundColor: '#ffffff',
        width: EXPORT_W,
        windowWidth: EXPORT_W,
        windowHeight: exportHeight,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: variant === 'compact'
        ? { unit: 'mm', format: [80, 297], orientation: 'portrait', compress: true }
        : { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(target);

    const blob = await worker.outputPdf('blob');
    await savePdfBlob(blob, fileName);
  } finally {
    exportFrame.remove();
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