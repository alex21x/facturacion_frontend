import { useEffect, useRef, useState } from 'react';
import { executeAiAgent, type AiAgentResponse } from '../api';
import '../ai-agent.css';

type Props = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function formatSalesAmount(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function AiAgentView({ accessToken, branchId, warehouseId }: Props) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [result, setResult] = useState<AiAgentResponse['data'] | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const highestDailySale = Math.max(...(result?.report?.daily_sales.map((row) => row.total_amount) ?? [0]), 1);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function toggleVoiceInput() {
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError(true);
      setMessage('Este navegador no admite dictado por voz. Puedes escribir la consulta.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'es-PE';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setPrompt((current) => `${current.trim()} ${transcript}`.trim());
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setError(true);
      setMessage('No se pudo capturar el audio.');
    };
    recognitionRef.current = recognition;
    setError(false);
    setMessage('');
    setListening(true);
    recognition.start();
  }

  async function submit() {
    if (prompt.trim() === '') {
      setError(true);
      setMessage('Escribe o dicta una instrucción.');
      return;
    }

    setLoading(true);
    setError(false);
    setMessage('');
    try {
      const response = await executeAiAgent(accessToken, {
        prompt: prompt.trim(),
        branch_id: branchId,
        warehouse_id: warehouseId,
      });
      setResult(response.data);
      setMessage(response.message);
      setPrompt('');
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : 'No se pudo crear el pedido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-agent-module">
      <div className="ai-agent-hero">
        <p className="eyebrow">Asistente operativo</p>
        <h2>Agente IA operativo</h2>
        <p>Escribe o dicta consultas como crear pedidos o generar reportes de ventas. Las acciones usan los datos y permisos de tu empresa.</p>
      </div>
      <div className="ai-agent-card">
        <label htmlFor="ai-order-prompt">¿Qué necesitas realizar o consultar?</label>
        <textarea
          id="ai-order-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ejemplo: Crear pedido para Juan Pérez con 2 carburadores. También: generar reporte de ventas del 01/10/2026 al 10/10/2026"
          rows={5}
          disabled={loading}
        />
        <div className="ai-agent-actions">
          <button type="button" onClick={toggleVoiceInput} disabled={loading}>
            {listening ? 'Detener audio' : 'Dictar por audio'}
          </button>
          <button type="button" className="ai-agent-primary" onClick={() => void submit()} disabled={loading || listening}>
            {loading ? 'Procesando...' : 'Ejecutar con agente IA'}
          </button>
        </div>
        <p className={`ai-agent-feedback${error ? ' is-error' : ''}`} role="status">{message}</p>
        {result?.report && (
          <div className="ai-agent-report" aria-live="polite">
            <strong>Reporte de ventas</strong>
            <span>{result.report.date_from} al {result.report.date_to}</span>
            <span>{result.report.documents_count} comprobantes</span>
            <span>Total: {formatSalesAmount(result.report.total_amount)}</span>
            <div className="ai-agent-chart" role="img" aria-label="Gráfica de ventas totales por día">
              {result.report.daily_sales.length > 0 ? result.report.daily_sales.map((row) => (
                <div className="ai-agent-chart-column" key={row.date}>
                  <span className="ai-agent-chart-value">{formatSalesAmount(row.total_amount)}</span>
                  <div className="ai-agent-chart-track">
                    <div
                      className="ai-agent-chart-bar"
                      style={{ height: `${Math.max((row.total_amount / highestDailySale) * 100, 3)}%` }}
                      title={`${row.date}: ${formatSalesAmount(row.total_amount)} (${row.documents_count} comprobantes)`}
                    />
                  </div>
                  <span className="ai-agent-chart-label">{row.date}</span>
                </div>
              )) : <p>No hay ventas emitidas para el periodo consultado.</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
