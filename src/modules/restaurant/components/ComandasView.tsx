import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkoutRestaurantOrder, fetchComandas, fetchOrderPreparationRequirements, fetchRestaurantBootstrap, updateComandaStatus } from '../api';
import { fetchCommercialDocuments, fetchCommercialDocumentDetails, fetchTaxBridgePreview, retryTaxBridgeSend, downloadSunatXml, downloadSunatCdr } from '../../sales/api';
import { openCommercialDocumentPreview80mm, openCommercialDocumentPrintA4 } from '../../sales/print';
import type { PrintableSalesDocument } from '../../sales/print';
import type { CommercialDocumentListItem } from '../../sales/types';
import type {
  CheckoutRestaurantOrderPayload,
  ComandaKitchenStatus,
  ComandaRow,
  PreparationRequirementsResponse,
  PreparationShortage,
  RestaurantBootstrapResponse,
  RestaurantSeriesNumber,
} from '../types';

function getTodayLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

const POLLING_INTERVAL_MS = 30_000;

type Props = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
};

const STATUS_LABELS: Record<ComandaKitchenStatus, string> = {
  PENDING: 'Pendiente',
  IN_PREP: 'En preparacion',
  READY: 'Listo',
  SERVED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const BOARD_COLUMNS: Array<{
  status: ComandaKitchenStatus;
  title: string;
  hint: string;
  tone: 'pending' | 'prep' | 'ready' | 'served' | 'cancelled';
}> = [
  { status: 'PENDING', title: 'Pendientes', hint: 'Ingresan a cocina', tone: 'pending' },
  { status: 'IN_PREP', title: 'En preparación', hint: 'Producción activa', tone: 'prep' },
  { status: 'READY', title: 'Listas para servir', hint: 'Esperando pase', tone: 'ready' },
  { status: 'SERVED', title: 'Entregadas', hint: 'Cierre de atención', tone: 'served' },
];

function kitchenBadgeClass(status: ComandaKitchenStatus): string {
  if (status === 'READY') return 'sales-sunat-badge is-ok';
  if (status === 'IN_PREP') return 'sales-sunat-badge is-progress';
  if (status === 'SERVED') return 'sales-sunat-badge is-neutral';
  if (status === 'CANCELLED') return 'sales-sunat-badge is-bad';
  return 'sales-sunat-badge is-warn';
}

function formatTotal(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
  return value.toFixed(2);
}

function timeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  if (diffMs < 0) return 'Ahora';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function ComandasView({ accessToken, branchId, warehouseId, cashRegisterId }: Props) {
  const [rows, setRows] = useState<ComandaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComandaKitchenStatus | ''>('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modifiedOrderIds, setModifiedOrderIds] = useState<Set<number>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Checkout modal state
  const [checkoutTarget, setCheckoutTarget] = useState<ComandaRow | null>(null);
  const [checkoutDocKind, setCheckoutDocKind] = useState<'SALES_ORDER' | 'INVOICE' | 'RECEIPT'>('RECEIPT');
  const [checkoutSeries, setCheckoutSeries] = useState('');
  const [checkoutPaymentMethodId, setCheckoutPaymentMethodId] = useState<number | ''>('');
  const [checkoutSeriesOptions, setCheckoutSeriesOptions] = useState<RestaurantSeriesNumber[]>([]);
  const [checkoutSeriesLoading, setCheckoutSeriesLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutDoneResult, setCheckoutDoneResult] = useState<import('../types').CheckoutResult | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState<RestaurantBootstrapResponse | null>(null);
  const [recipesValidationEnabled, setRecipesValidationEnabled] = useState<boolean | null>(null);
  const [sellerToCashierMode, setSellerToCashierMode] = useState(false);

  // View tab: comandas board vs cobros del turno
  const [activeTab, setActiveTab] = useState<'comandas' | 'cobros'>('comandas');

  // Cobros del turno state
  const [cobros, setCobros] = useState<CommercialDocumentListItem[]>([]);
  const [cobrosLoading, setCobrosLoading] = useState(false);
  const [cobrosMessage, setCobrosMessage] = useState('');
  const [cobrosTotal, setCobrosTotal] = useState(0);
  const [cobroDetail, setCobroDetail] = useState<PrintableSalesDocument | null>(null);
  const [cobroDetailLoading, setCobroDetailLoading] = useState(false);
  const [cobroDetailMessage, setCobroDetailMessage] = useState('');
  const [hoverCobroId, setHoverCobroId] = useState<number | null>(null);
  const [hoverCobroLoadingId, setHoverCobroLoadingId] = useState<number | null>(null);
  const [hoverCobroCache, setHoverCobroCache] = useState<Record<number, PrintableSalesDocument>>({});
  const [taxPayloadModal, setTaxPayloadModal] = useState<{ title: string; payload: unknown } | null>(null);
  const [sunatActionDocId, setSunatActionDocId] = useState<number | null>(null);

  // Preparation requirements modal (shortage warning + detailed view)
  const [reqsModal, setReqsModal] = useState<{
    row: ComandaRow;
    requirements: PreparationRequirementsResponse;
    shortages: PreparationShortage[];
    allowStart: boolean;
  } | null>(null);

  // Ticker for time-ago refresh (every minute)
  const [tick, setTick] = useState(0);
  const loadRef = useRef<() => void>(() => {});

  const summary = useMemo(() => {
    return {
      pending: rows.filter((r) => r.kitchen_status === 'PENDING').length,
      inPrep: rows.filter((r) => r.kitchen_status === 'IN_PREP').length,
      ready: rows.filter((r) => r.kitchen_status === 'READY').length,
    };
  }, [rows]);

  const boardRows = useMemo(() => {
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      rows: rows.filter((row) => row.kitchen_status === column.status),
    }));
  }, [rows]);

  const loadCobros = useCallback(async (silent = false) => {
    if (!branchId) {
      setCobros([]);
      return;
    }
    if (!silent) setCobrosLoading(true);
    setCobrosMessage('');
    try {
      const res = await fetchCommercialDocuments(accessToken, {
        branchId,
        sourceOrigin: 'RESTAURANT',
        perPage: 100,
      });
      const docs = res.data ?? [];
      setCobros(docs);
      const sum = docs.reduce((acc, d) => acc + Number(d.total ?? 0), 0);
      setCobrosTotal(sum);
    } catch (error) {
      setCobrosMessage(error instanceof Error ? error.message : 'No se pudo cargar cobros del turno');
    } finally {
      if (!silent) setCobrosLoading(false);
    }
  }, [accessToken, branchId]);

  async function load(silent = false) {
    if (!branchId) {
      setRows([]);
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    if (!silent) setLoading(true);
    setMessage('');
    try {
      const res = await fetchComandas(accessToken, {
        branchId,
        status: statusFilter,
        search,
      });
      setRows(res.data ?? []);
      setLastRefreshed(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar comandas');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Keep loadRef current so interval always calls latest version
  loadRef.current = () => void load(true);

  // Initial load + reload when filters change
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, statusFilter]);

  useEffect(() => {
    if (!branchId) {
      setRecipesValidationEnabled(false);
      return;
    }

    let cancelled = false;
    setRecipesValidationEnabled(false);

    (async () => {
      try {
        const data = await fetchRestaurantBootstrap(accessToken, { branchId, mode: 'orders_minimal' });
        if (!cancelled) {
          setRecipesValidationEnabled(Boolean(data.restaurant_recipes_enabled));
          setSellerToCashierMode(Boolean(data.sales_seller_to_cashier_enabled));
        }
      } catch {
        if (!cancelled) {
          setRecipesValidationEnabled(false);
          setSellerToCashierMode(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, branchId]);

  // Load cobros when tab becomes active or branchId changes
  useEffect(() => {
    if (activeTab === 'cobros') {
      void loadCobros();
    }
  }, [activeTab, loadCobros]);

  // Silent auto-polling every 30 s
  useEffect(() => {
    const id = setInterval(() => {
      loadRef.current();
      // Also silently refresh cobros if the tab is active
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      if (activeTab === 'cobros') void loadCobros(true);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadCobros]);

  // Tick every 60 s to re-render time-ago labels
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // BroadcastChannel — receives ORDER_MODIFIED from RestaurantOrderView in same browser
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('restaurant_orders');
      bc.onmessage = (ev: MessageEvent<{ type: string; orderId: number }>) => {
        if (ev.data?.type === 'ORDER_MODIFIED') {
          const modifiedId = Number(ev.data.orderId);
          setModifiedOrderIds((prev) => new Set(prev).add(modifiedId));
          // Immediate silent reload so the card shows updated items
          loadRef.current();
        }
      };
    } catch {
      // BroadcastChannel not supported — polling covers it
    }
    return () => { bc?.close(); };
  }, []);

  async function moveStatus(row: ComandaRow, nextStatus: ComandaKitchenStatus) {
    setBusyId(row.id);
    setMessage('');
    try {
      await updateComandaStatus(accessToken, row.id, {
        status: nextStatus,
        table_label: row.table_label || undefined,
      });
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, kitchen_status: nextStatus } : item)));
      // Acknowledge modification badge when staff acts on the order
      setModifiedOrderIds((prev) => { const s = new Set(prev); s.delete(row.id); return s; });
      // Notify RestaurantOrderView (waiter screen) when a comanda is ready to serve
      if (nextStatus === 'READY') {
        try {
          const bc = new BroadcastChannel('restaurant_orders');
          bc.postMessage({
            type: 'ORDER_READY',
            orderId: row.id,
            tableLabel: row.table_label || '',
            series: row.series,
            number: row.number,
          });
          bc.close();
        } catch {
          // BroadcastChannel unavailable
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado');
    } finally {
      setBusyId(null);
    }
  }

  // Check preparation requirements before moving to IN_PREP; show warning if stock shortage
  async function startPrep(row: ComandaRow) {
    if (recipesValidationEnabled === false) {
      void moveStatus(row, 'IN_PREP');
      return;
    }

    setBusyId(row.id);
    try {
      const reqs = await fetchOrderPreparationRequirements(accessToken, row.id);
      if (reqs.warehouse_id === null) {
        setRecipesValidationEnabled(false);
        setBusyId(null);
        void moveStatus(row, 'IN_PREP');
        return;
      }

      setRecipesValidationEnabled(true);

      const shortages: PreparationShortage[] = (reqs.ingredients_summary ?? [])
        .filter((line) => Number(line.shortfall_base) > 0)
        .map((line) => ({
          ingredient_product_id: line.ingredient_product_id,
          name: line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`,
          required: Number(line.required_base),
          available: Number(line.available_base),
          unit: 'BASE',
        }));

      if (shortages.length > 0) {
        setReqsModal({ row, requirements: reqs, shortages, allowStart: true });
        setBusyId(null);
        return;
      }
    } catch {
      // If requirements check fails (e.g. no recipe defined), proceed anyway
    }
    void moveStatus(row, 'IN_PREP');
  }

  async function viewRequirements(row: ComandaRow) {
    if (recipesValidationEnabled === false) {
      setMessage('Recetas/Requerimientos está desactivado para esta empresa.');
      return;
    }

    setBusyId(row.id);
    setMessage('');
    try {
      const reqs = await fetchOrderPreparationRequirements(accessToken, row.id);
      if (reqs.warehouse_id === null) {
        setRecipesValidationEnabled(false);
        setMessage('Recetas/Requerimientos está desactivado para esta empresa.');
        return;
      }

      setRecipesValidationEnabled(true);

      const shortages: PreparationShortage[] = (reqs.ingredients_summary ?? [])
        .filter((line) => Number(line.shortfall_base) > 0)
        .map((line) => ({
          ingredient_product_id: line.ingredient_product_id,
          name: line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`,
          required: Number(line.required_base),
          available: Number(line.available_base),
          unit: 'BASE',
        }));

      setReqsModal({ row, requirements: reqs, shortages, allowStart: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo obtener requerimientos de preparación');
    } finally {
      setBusyId(null);
    }
  }

  function dismissModified(orderId: number) {
    setModifiedOrderIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
  }

  function openCheckout(row: ComandaRow) {
    setCheckoutTarget(row);
    setCheckoutDocKind(sellerToCashierMode ? 'SALES_ORDER' : 'RECEIPT');
    setCheckoutSeries('');
    setCheckoutSeriesOptions([]);
    setCheckoutPaymentMethodId('');
    setCheckoutMessage('');
  }

  function closeCheckout() {
    setCheckoutTarget(null);
    setCheckoutBusy(false);
    setCheckoutMessage('');
    setCheckoutDoneResult(null);
    setPrintBusy(false);
  }

  async function printCheckoutResult(docId: number, format: '80mm' | 'A4') {
    setPrintBusy(true);
    try {
      const doc = await fetchCommercialDocumentDetails(accessToken, docId);
      if (format === '80mm') {
        openCommercialDocumentPreview80mm(doc);
      } else {
        openCommercialDocumentPrintA4(doc);
      }
    } catch {
      // silently ignore
    } finally {
      setPrintBusy(false);
    }
  }

  async function openCobroDetail(docId: number) {
    setCobroDetailLoading(true);
    setCobroDetailMessage('');
    try {
      const detail = await fetchCommercialDocumentDetails(accessToken, docId);
      setCobroDetail(detail);
    } catch (error) {
      setCobroDetailMessage(error instanceof Error ? error.message : 'No se pudo cargar detalle del cobro');
    } finally {
      setCobroDetailLoading(false);
    }
  }

  async function prefetchHoverCobro(docId: number) {
    if (hoverCobroCache[docId]) return;
    setHoverCobroLoadingId(docId);
    try {
      const detail = await fetchCommercialDocumentDetails(accessToken, docId);
      setHoverCobroCache((prev) => ({ ...prev, [docId]: detail }));
    } catch {
      // no-op on hover prefetch errors
    } finally {
      setHoverCobroLoadingId((prev) => (prev === docId ? null : prev));
    }
  }

  async function openTaxPayloadPreview(row: CommercialDocumentListItem) {
    try {
      const response = await fetchTaxBridgePreview(accessToken, row.id);
      setTaxPayloadModal({
        title: `Payload tributario ${row.series}-${String(row.number).padStart(6, '0')}`,
        payload: response.debug?.payload ?? response.payload,
      });
    } catch (error) {
      setCobrosMessage(error instanceof Error ? error.message : 'No se pudo obtener payload del puente tributario');
    }
  }

  async function retrySunatFromCobros(row: CommercialDocumentListItem) {
    setSunatActionDocId(row.id);
    try {
      await retryTaxBridgeSend(accessToken, row.id);
      setCobrosMessage(`Reintento SUNAT enviado para ${row.series}-${String(row.number).padStart(6, '0')}`);
      void loadCobros(true);
    } catch (error) {
      setCobrosMessage(error instanceof Error ? error.message : 'No se pudo reintentar envio a SUNAT');
    } finally {
      setSunatActionDocId(null);
    }
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.bin';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadXmlFromCobros(row: CommercialDocumentListItem) {
    setSunatActionDocId(row.id);
    try {
      const result = await downloadSunatXml(accessToken, row.id);
      triggerBlobDownload(result.blob, result.filename);
    } catch (error) {
      setCobrosMessage(error instanceof Error ? error.message : 'No se pudo descargar XML');
    } finally {
      setSunatActionDocId(null);
    }
  }

  async function handleDownloadCdrFromCobros(row: CommercialDocumentListItem) {
    setSunatActionDocId(row.id);
    try {
      const result = await downloadSunatCdr(accessToken, row.id);
      triggerBlobDownload(result.blob, result.filename);
    } catch (error) {
      setCobrosMessage(error instanceof Error ? error.message : 'No se pudo descargar CDR');
    } finally {
      setSunatActionDocId(null);
    }
  }

  function sunatStatusLabel(status: string | null | undefined): string {
    const normalized = String(status || '').toUpperCase();
    if (!normalized) return 'No enviado';
    if (normalized === 'ACCEPTED') return 'Aceptado';
    if (normalized === 'REJECTED') return 'Rechazado';
    if (normalized === 'PENDING_CONFIRMATION') return 'Pendiente confirmacion';
    if (normalized === 'EXPIRED_WINDOW') return 'Fuera de plazo';
    if (normalized === 'SENDING') return 'Enviando';
    if (normalized === 'PENDING_MANUAL') return 'Pendiente manual';
    if (normalized === 'PENDING_SUMMARY') return 'Pendiente resumen';
    if (normalized === 'SENT_BY_SUMMARY') return 'Enviado por resumen';
    if (normalized === 'CONFIG_INCOMPLETE') return 'Config incompleta';
    if (normalized === 'HTTP_ERROR') return 'Error HTTP';
    if (normalized === 'NETWORK_ERROR') return 'Error red';
    if (normalized === 'ERROR') return 'Error';
    if (normalized === 'SENT') return 'Enviado';
    return normalized;
  }

  function sunatStatusClass(status: string | null | undefined): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'ACCEPTED') return 'sales-sunat-badge is-ok';
    if (['SENDING', 'PENDING_CONFIRMATION', 'PENDING_MANUAL', 'PENDING_SUMMARY', 'SENT', 'SENT_BY_SUMMARY'].includes(normalized)) {
      return 'sales-sunat-badge is-warn';
    }
    if (['REJECTED', 'HTTP_ERROR', 'NETWORK_ERROR', 'ERROR', 'CONFIG_INCOMPLETE', 'EXPIRED_WINDOW'].includes(normalized)) {
      return 'sales-sunat-badge is-bad';
    }
    return 'sales-sunat-badge is-neutral';
  }

  function isTributaryDocument(doc: CommercialDocumentListItem): boolean {
    const kind = String(doc.document_kind || '').toUpperCase();
    return kind === 'INVOICE' || kind === 'RECEIPT' || kind.startsWith('CREDIT_NOTE') || kind.startsWith('DEBIT_NOTE');
  }

  async function submitCheckout() {
    if (!checkoutTarget) return;
    setCheckoutBusy(true);
    setCheckoutMessage('');

    if (!checkoutSeries.trim()) {
      setCheckoutMessage('Selecciona una serie activa para continuar.');
      setCheckoutBusy(false);
      return;
    }

    const payload: CheckoutRestaurantOrderPayload = {
      target_document_kind: checkoutDocKind,
      series: checkoutSeries.trim() || null,
      payment_method_id: checkoutPaymentMethodId !== '' ? Number(checkoutPaymentMethodId) : null,
      cash_register_id: cashRegisterId,
    };

    try {
      const result = await checkoutRestaurantOrder(accessToken, checkoutTarget.id, payload);
      // Remove the order from the board (it is now ISSUED)
      setRows((prev) => prev.filter((r) => r.id !== checkoutTarget.id));
      // Show success + print options inside modal instead of closing immediately
      setCheckoutDoneResult(result);
      // Keep Cobros del turno in sync immediately after checkout.
      void loadCobros(true);
      setMessage(
        result.document_kind === 'SALES_ORDER'
          ? `Pedido ${result.series}-${String(result.number).padStart(6, '0')} finalizado en comanda (pendiente caja).`
          : `Pedido finalizado y cobrado: ${result.series}-${String(result.number).padStart(6, '0')}.`
      );
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Error al registrar cobro';
      const stockMatch = raw.match(/Insufficient stock for product #(\d+)/i);
      if (stockMatch) {
        const productId = stockMatch[1];
        setCheckoutMessage(`Stock insuficiente para el producto #${productId}. Revisa inventario o ajusta el pedido antes de cobrar.`);
      } else {
        setCheckoutMessage(raw);
      }
    } finally {
      setCheckoutBusy(false);
    }
  }

  useEffect(() => {
    if (!reqsModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReqsModal(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reqsModal]);

  // Resolve series options from restaurant bootstrap when checkout opens/doc kind changes
  useEffect(() => {
    if (!checkoutTarget) return;
    setCheckoutMessage('');

    let cancelled = false;

    const resolveCheckoutSeries = async () => {
      setCheckoutSeriesLoading(true);

      let currentBootstrap = bootstrap;
      if (!currentBootstrap) {
        try {
          currentBootstrap = await fetchRestaurantBootstrap(accessToken, { branchId });
          if (!cancelled) {
            setBootstrap(currentBootstrap);
          }
        } catch {
          if (!cancelled) {
            setCheckoutSeriesOptions([]);
            setCheckoutSeries('');
            setCheckoutSeriesLoading(false);
          }
          return;
        }
      }

      if (cancelled) return;

      const enabled = (currentBootstrap.series_numbers ?? []).filter((s) => s.document_kind === checkoutDocKind && Boolean(s.is_enabled));
      setCheckoutSeriesOptions(enabled);
      setCheckoutSeries((prev) => {
        if (prev && enabled.some((s) => s.series === prev)) return prev;
        return enabled[0]?.series ?? '';
      });
      setCheckoutSeriesLoading(false);
    };

    void resolveCheckoutSeries();

    return () => {
      cancelled = true;
    };
  }, [checkoutTarget, checkoutDocKind, bootstrap, accessToken, branchId]);

  const statusOptions: Array<{ value: ComandaKitchenStatus | ''; label: string }> = [
    { value: '', label: 'Todos los estados' },
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'IN_PREP', label: 'En preparación' },
    { value: 'READY', label: 'Listo' },
    { value: 'SERVED', label: 'Entregado' },
    { value: 'CANCELLED', label: 'Cancelado' },
  ];

  // Suppress unused-variable warning for tick (used to trigger re-render)
  void tick;

  // TODO: when restaurant bootstrap exposes commerce feature flags, read SALES_TAX_BRIDGE from there.
  const taxBridgeEnabled = true;

  function cobrosDocKindLabel(docKind: string): string {
    const k = (docKind ?? '').toUpperCase();
    if (k === 'INVOICE') return 'Factura';
    if (k === 'RECEIPT') return 'Boleta';
    if (k === 'SALES_ORDER') return 'Nota de pedido';
    if (k === 'CREDIT_NOTE' || k.startsWith('CREDIT_NOTE_')) return 'N. Crédito';
    return docKind;
  }

  function cobrosStatusLabel(doc: CommercialDocumentListItem): string {
    const s = (doc.status ?? '').toUpperCase();
    const k = (doc.document_kind ?? '').toUpperCase();
    if (s === 'ISSUED' && k === 'SALES_ORDER') return 'Pendiente caja';
    if (s === 'ISSUED') return 'Pagado';
    if (s === 'PENDING') return 'Pendiente';
    if (s === 'VOIDED' || s === 'CANCELLED' || s === 'VOID' || s === 'CANCELED') return 'Anulado';
    if (s === 'CONVERTED') return 'Convertido';
    return doc.status;
  }

  function cobrosStatusClass(doc: CommercialDocumentListItem): string {
    const s = (doc.status ?? '').toUpperCase();
    const k = (doc.document_kind ?? '').toUpperCase();
    if (s === 'ISSUED' && k === 'SALES_ORDER') return 'sales-sunat-badge is-warn';
    if (s === 'ISSUED') return 'sales-sunat-badge is-ok';
    if (s === 'PENDING') return 'sales-sunat-badge is-warn';
    if (s === 'VOIDED' || s === 'CANCELLED' || s === 'VOID' || s === 'CANCELED') return 'sales-sunat-badge is-bad';
    if (s === 'CONVERTED') return 'sales-sunat-badge is-neutral';
    return 'sales-sunat-badge is-neutral';
  }

  return (
    <>
    <section className="module-panel restaurant-panel restaurant-panel--comandas">
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Restaurante</p>
          <h3>{activeTab === 'cobros' ? 'Cobros del turno' : 'Comandas'}</h3>
          <p className="restaurant-toolbar__copy">
            {activeTab === 'cobros'
              ? 'Documentos emitidos hoy desde comanda. Solo lectura — gestión oficial en Comercial.'
              : 'Vista operativa para cocina, pase y entrega en sala.'}
          </p>
        </div>
        <div className="restaurant-toolbar__actions">
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, border: '1px solid #e4ddd5', borderRadius: 8, padding: 2, background: '#faf7f4' }}>
            <button
              type="button"
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                background: activeTab === 'comandas' ? '#fff' : 'transparent',
                color: activeTab === 'comandas' ? '#3d3530' : '#9a8a7d',
                boxShadow: activeTab === 'comandas' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
              onClick={() => setActiveTab('comandas')}
            >
              Comandas
            </button>
            <button
              type="button"
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                background: activeTab === 'cobros' ? '#fff' : 'transparent',
                color: activeTab === 'cobros' ? '#3d3530' : '#9a8a7d',
                boxShadow: activeTab === 'cobros' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
              onClick={() => setActiveTab('cobros')}
            >
              Cobros del turno
            </button>
          </div>
          {activeTab === 'comandas' && (
          <span className="restaurant-toolbar__context" style={{ fontSize: '0.76rem', color: '#7a6f63' }}>
            Actualizado {lastRefreshed.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
          </span>
          )}
          {activeTab === 'comandas' && (
          <button type="button" className="restaurant-ghost-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando...' : '↻ Refrescar'}
          </button>
          )}
          {activeTab === 'cobros' && (
          <button type="button" className="restaurant-ghost-btn" onClick={() => void loadCobros()} disabled={cobrosLoading}>
            {cobrosLoading ? 'Actualizando...' : '↻ Refrescar'}
          </button>
          )}
        </div>
      </div>

      {/* ── Stats strip — shown for both tabs ── */}
      {activeTab === 'comandas' && (<div className="restaurant-stats restaurant-stats--three">
        <article className="restaurant-stat">
          <span>Pendientes</span>
          <strong>{summary.pending}</strong>
          <small>Órdenes recién registradas</small>
        </article>
        <article className="restaurant-stat">
          <span>En preparación</span>
          <strong>{summary.inPrep}</strong>
          <small>Producción activa</small>
        </article>
        <article className="restaurant-stat">
          <span>Listas</span>
          <strong>{summary.ready}</strong>
          <small>Esperando despacho</small>
        </article>
      </div>)}

      {/* ── Cobros del turno tab ── */}
      {activeTab === 'cobros' && (
        <div style={{ marginTop: 8 }}>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 140, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 18px' }}>
              <p style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600, marginBottom: 2 }}>Documentos hoy</p>
              <strong style={{ fontSize: '1.5rem', color: '#166534' }}>{cobros.length}</strong>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 18px' }}>
              <p style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, marginBottom: 2 }}>Total cobrado</p>
              <strong style={{ fontSize: '1.5rem', color: '#1d4ed8' }}>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cobrosTotal)}</strong>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '12px 18px' }}>
              <p style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, marginBottom: 2 }}>Nota de pedido (caja)</p>
              <strong style={{ fontSize: '1.5rem', color: '#7c3aed' }}>{cobros.filter(d => (d.document_kind ?? '').toUpperCase() === 'SALES_ORDER').length}</strong>
            </div>
          </div>

          {cobrosMessage && <p className="notice restaurant-notice">{cobrosMessage}</p>}

          {cobrosLoading ? (
            <div className="restaurant-empty-state"><strong>Cargando cobros...</strong></div>
          ) : cobros.length === 0 ? (
            <div className="restaurant-empty-state">
              <strong>Sin cobros hoy</strong>
              <p>Los documentos emitidos desde comanda aparecerán aquí durante el turno.</p>
              <p style={{ fontSize: '0.78rem', color: '#9a8a7d', marginTop: 4 }}>Gestión oficial y exportación en <strong>Comercial &gt; Reporte</strong> con filtro &quot;Origen restaurante&quot;.</p>
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #efe7dc', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ede8e1', background: '#faf7f4' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>ID</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Documento</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Fecha emision</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Cliente</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Forma de pago</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Conversiones</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#7a6f63' }}>Estado</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#7a6f63' }}>Total</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>Acciones</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#7a6f63' }}>SUNAT</th>
                  </tr>
                </thead>
                <tbody>
                  {cobros.map((doc) => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid #f3ede6' }}>
                      <td style={{ padding: '7px 10px', color: '#3d3530' }}>{doc.id}</td>
                      <td
                        style={{ padding: '7px 10px', color: '#3d3530', position: 'relative' }}
                        onMouseEnter={() => {
                          setHoverCobroId(doc.id);
                          void prefetchHoverCobro(doc.id);
                        }}
                        onMouseLeave={() => setHoverCobroId((prev) => (prev === doc.id ? null : prev))}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{ borderBottom: '1px dashed #9a8a7d', cursor: 'default', width: 'fit-content' }}>
                            {cobrosDocKindLabel(doc.document_kind)} {doc.series}-{String(doc.number).padStart(6, '0')}
                          </span>
                        </div>
                        {hoverCobroId === doc.id && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 8px)',
                              left: 0,
                              width: 430,
                              maxWidth: '78vw',
                              background: '#fff',
                              border: '1px solid #e7dece',
                              borderRadius: 12,
                              boxShadow: '0 12px 26px rgba(0,0,0,.14)',
                              zIndex: 20,
                              padding: 12,
                            }}
                          >
                            {hoverCobroLoadingId === doc.id && !hoverCobroCache[doc.id] ? (
                              <p style={{ margin: 0, color: '#7a6f63', fontSize: '0.8rem' }}>Cargando detalle...</p>
                            ) : (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                                  <strong style={{ color: '#2f2a24' }}>{doc.series}-{String(doc.number).padStart(6, '0')}</strong>
                                  <span style={{ color: '#1d4ed8', fontWeight: 700 }}>
                                    {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(doc.total))}
                                  </span>
                                </div>
                                <div style={{ maxHeight: 220, overflowY: 'auto', overflowX: 'hidden', border: '1px solid #efe7dc', borderRadius: 8 }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', tableLayout: 'fixed' }}>
                                    <thead>
                                      <tr style={{ background: '#faf7f4', borderBottom: '1px solid #ece4d8' }}>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Item</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cant</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(hoverCobroCache[doc.id]?.items ?? []).map((item, idx) => (
                                        <tr key={`${item.description}-${idx}`} style={{ borderBottom: '1px solid #f4efe8' }}>
                                          <td style={{ padding: '6px 8px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.description}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(item.qty ?? 0).toFixed(2)}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(item.lineTotal ?? 0))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                  <button
                                    type="button"
                                    className="restaurant-ghost-btn"
                                    disabled={!hoverCobroCache[doc.id]}
                                    onClick={() => {
                                      const cached = hoverCobroCache[doc.id];
                                      if (!cached) return;
                                      openCommercialDocumentPrintA4(cached);
                                    }}
                                  >
                                    Impr. A4
                                  </button>
                                  <button
                                    type="button"
                                    className="restaurant-primary-btn"
                                    disabled={!hoverCobroCache[doc.id]}
                                    onClick={() => {
                                      const cached = hoverCobroCache[doc.id];
                                      if (!cached) return;
                                      openCommercialDocumentPreview80mm(cached);
                                    }}
                                  >
                                    Ticket 80mm
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#7a6f63', whiteSpace: 'nowrap' }}>
                        {doc.issue_at ? new Date(doc.issue_at).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }) : '-'}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#3d3530', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.customer_name || 'Cliente rapido'}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#3d3530' }}>{doc.payment_method_name ?? 'Sin metodo de pago'}</td>
                      <td style={{ padding: '7px 10px', color: '#3d3530' }}>
                        {String(doc.document_kind || '').toUpperCase() === 'SALES_ORDER'
                          ? (doc.has_tributary_conversion ? '✓ Tributario emitido' : '⏳ Tributario pendiente')
                          : (doc.source_document_id ? `✓ Emitido desde #${doc.source_document_id}` : '—')}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span className={cobrosStatusClass(doc)}>{cobrosStatusLabel(doc)}</span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#3d3530', fontWeight: 600 }}>
                        {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(doc.total))}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-mini sales-action-btn sales-action-view"
                            onClick={() => void openCobroDetail(doc.id)}
                            title="Ver comprobante"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="btn-mini sales-action-btn sales-action-view"
                            onClick={() => void printCheckoutResult(doc.id, '80mm')}
                            title="Ver ticket 80mm"
                          >
                            🧾
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {isTributaryDocument(doc) ? (
                          <div className="sales-sunat-dropdown">
                            <button type="button" className={`sales-sunat-badge ${sunatStatusClass(doc.sunat_status)}`}>
                              {sunatStatusLabel(doc.sunat_status)}
                            </button>
                            <div className="sales-sunat-dropdown-menu">
                              {String(doc.sunat_status ?? '').toUpperCase() === 'ACCEPTED' && (
                                <>
                                  <p className="sunat-menu-section-label">Descargar</p>
                                  <div className="sunat-menu-row">
                                    <button
                                      type="button"
                                      className="sunat-menu-btn sunat-menu-btn--download"
                                      disabled={sunatActionDocId === doc.id || !taxBridgeEnabled}
                                      onClick={() => void handleDownloadXmlFromCobros(doc)}
                                    >
                                      🗂️ XML
                                    </button>
                                    <button
                                      type="button"
                                      className="sunat-menu-btn sunat-menu-btn--download"
                                      disabled={sunatActionDocId === doc.id || !taxBridgeEnabled}
                                      onClick={() => void handleDownloadCdrFromCobros(doc)}
                                    >
                                      📦 CDR
                                    </button>
                                  </div>
                                  <div className="sunat-menu-divider" />
                                </>
                              )}
                              <button
                                type="button"
                                className="sunat-menu-btn"
                                disabled={sunatActionDocId === doc.id || !taxBridgeEnabled}
                                onClick={() => void openTaxPayloadPreview(doc)}
                              >
                                🧩 Ver payload tributario
                              </button>
                              <button
                                type="button"
                                className="sunat-menu-btn"
                                disabled={sunatActionDocId === doc.id || !taxBridgeEnabled}
                                onClick={() => void retrySunatFromCobros(doc)}
                              >
                                🚀 {sunatActionDocId === doc.id ? 'Enviando...' : 'Enviar/Reintentar SUNAT'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'comandas' && (<div className="restaurant-filters">
        <label className="restaurant-field restaurant-field--wide">
          <span>Buscar</span>
          <input
            className="restaurant-input"
            placeholder="Serie, cliente o mesa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
          />
        </label>
        <label className="restaurant-field">
          <span>Estado</span>
          <select className="restaurant-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ComandaKitchenStatus | '')}>
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="restaurant-primary-btn restaurant-primary-btn--soft" onClick={() => void load()} disabled={loading}>
          Aplicar
        </button>
      </div>)}

      {activeTab === 'comandas' && message && <p className="notice restaurant-notice">{message}</p>}

      {activeTab === 'comandas' && (rows.length === 0 ? (
        <div className="restaurant-empty-state">
          <strong>{loading ? 'Cargando comandas...' : 'Sin comandas en esta vista'}</strong>
          <p>No hay órdenes que coincidan con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="comandas-board">
          {boardRows.map((column) => (
            <section key={column.status} className={`comandas-column comandas-column--${column.tone}`}>
              <header className="comandas-column__head">
                <div>
                  <p>{column.title}</p>
                  <small>{column.hint}</small>
                </div>
                <strong>{column.rows.length}</strong>
              </header>

              <div className="comandas-column__body">
                {column.rows.length === 0 ? (
                  <div className="comandas-column__empty">Sin comandas en esta etapa.</div>
                ) : column.rows.map((row) => {
                  const isModified = modifiedOrderIds.has(row.id);
                  const items = row.items_preview ?? [];
                  const previewItems = items.slice(0, 2);
                  const hiddenItems = Math.max(0, items.length - previewItems.length);
                  return (
                  <article key={row.id} className={`comanda-card comanda-card--${column.tone}${isModified ? ' comanda-card--modified' : ''}`}>

                    {/* ── Modified alert banner ── */}
                    {isModified && (
                      <div className="comanda-card__modified-banner">
                        <span>⚡ Pedido modificado</span>
                        <button
                          type="button"
                          className="comanda-card__modified-dismiss"
                          onClick={() => dismissModified(row.id)}
                          aria-label="Entendido"
                        >
                          ✓ Entendido
                        </button>
                      </div>
                    )}

                    {/* ── Header: ID + serie + tiempo ── */}
                    <div className="comanda-card__head">
                      <div className="comanda-card__head-left">
                        <p className="comanda-card__kicker">#{row.id}</p>
                        <h4 className="comanda-card__serie">{row.series}-{String(row.number).padStart(6, '0')}</h4>
                      </div>
                      <div className="comanda-card__head-right">
                        <span className="comanda-card__time-ago">{timeAgo(row.issue_at)}</span>
                        <span className={kitchenBadgeClass(row.kitchen_status)}>{STATUS_LABELS[row.kitchen_status]}</span>
                      </div>
                    </div>

                    {/* ── Info strip: Mesa · Cliente · Total ── */}
                    <div className="comanda-card__meta-line">
                      <span className="comanda-meta-pill">
                        <span className="comanda-meta-pill__label">Mesa</span>
                        <strong>{row.table_label || '—'}</strong>
                      </span>
                      <span className="comanda-meta-pill comanda-meta-pill--customer">
                        <span className="comanda-meta-pill__label">Cliente</span>
                        <strong>{row.customer_name || 'Rapido'}</strong>
                      </span>
                      <span className="comanda-meta-pill comanda-meta-pill--total">
                        <span className="comanda-meta-pill__label">Total</span>
                        <strong>{formatTotal(row.total)}</strong>
                      </span>
                    </div>

                    {/* ── Items inline ── */}
                    <div className="comanda-card__items-inline">
                      <p className="comanda-card__items-label">
                        Platos
                        <span className="comanda-card__items-count">{items.length}</span>
                      </p>
                      {items.length === 0 ? (
                        <p className="comanda-items-empty">Sin detalle de platos</p>
                      ) : (
                        <ul className="comanda-items-inline-list">
                          {previewItems.map((item, idx) => (
                            <li key={`item-${row.id}-${idx}`} className="comanda-items-inline-list__row">
                              <span className="comanda-items-inline-list__name">{item.description || 'Ítem sin descripción'}</span>
                              <strong className="comanda-items-inline-list__qty">✕ {formatQty(Number(item.qty))}</strong>
                            </li>
                          ))}
                          {hiddenItems > 0 && (
                            <li className="comanda-items-inline-list__row comanda-items-inline-list__row--more">
                              <span className="comanda-items-inline-list__name">+{hiddenItems} platos mas</span>
                              <span className="comanda-items-trigger-wrap comanda-items-popover-wrap">
                                <button
                                  type="button"
                                  className="comanda-items-inline-list__qty comanda-items-inline-list__qty--link"
                                >
                                  ver todo
                                </button>
                                <div className="comanda-items-popover">
                                  <p className="comanda-items-popover__title">
                                    Todos los platos ({items.length})
                                  </p>
                                  <ul className="comanda-items-popover__list">
                                    {items.map((item, idx) => (
                                      <li key={`item-popover-${row.id}-${idx}`}>
                                        <span>
                                          {item.description || 'Ítem sin descripción'}
                                        </span>
                                        <strong>
                                          ✕ {formatQty(Number(item.qty))}
                                        </strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </span>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    {/* ── Actions ── */}
                    <div className="comanda-card__actions comanda-card__actions--compact">
                      {recipesValidationEnabled === true && (
                        <button
                          type="button"
                          className="restaurant-stage-btn"
                          disabled={busyId === row.id}
                          onClick={() => void viewRequirements(row)}
                        >
                          Ver requerimientos
                        </button>
                      )}
                      {row.kitchen_status === 'PENDING' && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--prep"
                          disabled={busyId === row.id}
                          onClick={() => void startPrep(row)}
                        >
                          Iniciar
                        </button>
                      )}
                      {row.kitchen_status === 'IN_PREP' && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--ready"
                          disabled={busyId === row.id}
                          onClick={() => void moveStatus(row, 'READY')}
                        >
                          Marcar listo
                        </button>
                      )}
                      {(row.kitchen_status === 'READY' || row.kitchen_status === 'SERVED') && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--served"
                          disabled={busyId === row.id || row.kitchen_status === 'SERVED'}
                          onClick={() => void moveStatus(row, 'SERVED')}
                        >
                          Entregar
                        </button>
                      )}
                      {(row.kitchen_status === 'READY' || row.kitchen_status === 'SERVED') && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--checkout"
                          disabled={busyId === row.id}
                          onClick={() => openCheckout(row)}
                        >
                          Cobrar
                        </button>
                      )}
                    </div>
                  </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ))}
    </section>

    {/* ── Checkout modal ───────────────────────────────────────────────── */}
    {checkoutTarget && (() => {
      const target = checkoutTarget;
      return (
      <div className="cko-backdrop" role="dialog" aria-modal="true" aria-label="Cobrar pedido">
        <div className="cko-dialog">
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Cobrar pedido</p>
              <h3>{target.series}-{String(target.number).padStart(6, '0')}</h3>
              <p className="cko-dialog__sub">
                {target.table_label ? `Mesa: ${target.table_label} · ` : ''}
                {target.customer_name || 'Cliente rapido'}
              </p>
            </div>
            <button type="button" className="cko-dialog__close" onClick={closeCheckout} aria-label="Cerrar">&times;</button>
          </header>

          <div className="cko-dialog__total">
            <span>Total</span>
            <strong>{formatTotal(target.total)}</strong>
          </div>
          {cashRegisterId && (
            <div style={{ margin: '0 20px', padding: '8px 14px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
              <span>Caja activa</span>
              <strong>Caja #{cashRegisterId}</strong>
            </div>
          )}
          <div className="cko-dialog__body">
            {/* ── Tipo de comprobante: siempre las 3 opciones, igual que retail ── */}
            <label className="cko-field">
              <span>Tipo de comprobante</span>
              <div className="cko-doc-kind-row">
                <button
                  type="button"
                  className={`cko-kind-btn ${checkoutDocKind === 'SALES_ORDER' ? 'cko-kind-btn--active' : ''}`}
                  onClick={() => setCheckoutDocKind('SALES_ORDER')}
                >
                  Nota de pedido
                </button>
                <button
                  type="button"
                  className={`cko-kind-btn ${checkoutDocKind === 'RECEIPT' ? 'cko-kind-btn--active' : ''}`}
                  onClick={() => setCheckoutDocKind('RECEIPT')}
                >
                  Boleta
                </button>
                <button
                  type="button"
                  className={`cko-kind-btn ${checkoutDocKind === 'INVOICE' ? 'cko-kind-btn--active' : ''}`}
                  onClick={() => setCheckoutDocKind('INVOICE')}
                >
                  Factura
                </button>
              </div>
            </label>

            {/* Hint informativo solo cuando el default es caja independiente */}
            {sellerToCashierMode && checkoutDocKind === 'SALES_ORDER' && (
              <p style={{ fontSize: '0.78rem', color: '#7a6f63', margin: '0 0 10px', lineHeight: 1.5 }}>
                Nota de pedido: queda en la cola de caja para que el cajero emita el comprobante final.
              </p>
            )}

            {/* Serie — para todos los tipos */}
            <label className="cko-field">
              <span>Serie <em>(desde Maestros &gt; Series)</em></span>
              <select
                className="cko-select"
                value={checkoutSeries}
                onChange={(e) => setCheckoutSeries(e.target.value)}
                disabled={checkoutSeriesLoading || checkoutSeriesOptions.length === 0}
              >
                {checkoutSeriesLoading && <option value="">Cargando series...</option>}
                {!checkoutSeriesLoading && checkoutSeriesOptions.length === 0 && (
                  <option value="">Sin series activas</option>
                )}
                {checkoutSeriesOptions.map((s) => (
                  <option key={s.id ?? s.series} value={s.series}>
                    {s.series}
                  </option>
                ))}
              </select>
            </label>

            {!checkoutSeriesLoading && checkoutSeriesOptions.length === 0 && (
              <p className="cko-error">
                No hay series activas para {checkoutDocKind === 'RECEIPT' ? 'boleta' : checkoutDocKind === 'INVOICE' ? 'factura' : 'nota de pedido'} en esta sucursal.
                Configura una en Maestros &gt; Series.
              </p>
            )}

            {/* Medio de pago — para todos los tipos */}
            {bootstrap != null && (
              <label className="cko-field">
                <span>Medio de pago <em>(opcional)</em></span>
                <select
                  className="cko-select"
                  value={checkoutPaymentMethodId}
                  onChange={(e) => setCheckoutPaymentMethodId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Mantener del pedido</option>
                  {(bootstrap.payment_methods ?? []).map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </label>
            )}

            {checkoutMessage && <p className="cko-error">{checkoutMessage}</p>}
          </div>

          {checkoutDoneResult ? (
            // ── Success: print options ──
            <>
              <div style={{ margin: '0 20px 16px', padding: '14px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
                <p style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 700, marginBottom: 4 }}>
                  {checkoutDoneResult.document_kind === 'SALES_ORDER'
                    ? 'Pedido comercial enviado a caja'
                    : `${checkoutDoneResult.document_kind === 'RECEIPT' ? 'Boleta' : 'Factura'} emitida`}
                </p>
                <p style={{ fontSize: '0.82rem', color: '#166534' }}>
                  {checkoutDoneResult.series}-{String(checkoutDoneResult.number).padStart(6, '0')}
                  {' · S/ '}{Number(checkoutDoneResult.total).toFixed(2)}
                </p>
              </div>
              <footer className="cko-dialog__foot">
                <button type="button" className="restaurant-ghost-btn" onClick={closeCheckout}>
                  Cerrar
                </button>
                {checkoutDoneResult.document_kind !== 'SALES_ORDER' && (
                  <>
                    <button
                      type="button"
                      className="restaurant-ghost-btn"
                      disabled={printBusy}
                      onClick={() => void printCheckoutResult(checkoutDoneResult.id, 'A4')}
                    >
                      {printBusy ? 'Cargando...' : 'Impr. A4'}
                    </button>
                    <button
                      type="button"
                      className="restaurant-primary-btn"
                      disabled={printBusy}
                      onClick={() => void printCheckoutResult(checkoutDoneResult.id, '80mm')}
                    >
                      {printBusy ? 'Cargando...' : 'Ticket 80mm'}
                    </button>
                  </>
                )}
              </footer>
            </>
          ) : (
          <footer className="cko-dialog__foot">
            <button type="button" className="restaurant-ghost-btn" onClick={closeCheckout} disabled={checkoutBusy}>
              Cancelar
            </button>
            <button
              type="button"
              className="restaurant-primary-btn"
              disabled={checkoutBusy || checkoutSeriesLoading || checkoutSeriesOptions.length === 0}
              onClick={() => void submitCheckout()}
            >
              {checkoutBusy ? 'Procesando...' : (
                checkoutDocKind === 'SALES_ORDER' ? 'Emitir Nota de pedido'
                : checkoutDocKind === 'RECEIPT' ? 'Emitir Boleta'
                : 'Emitir Factura'
              )}
            </button>
          </footer>
          )}
        </div>
      </div>
      );
    })()}

    {/* ── Cobro detail modal (from Cobros del turno) ───────────────────── */}
    {cobroDetail && (
      <div className="cko-backdrop" role="dialog" aria-modal="true" aria-label="Detalle de cobro" onClick={() => setCobroDetail(null)}>
        <div className="cko-dialog" onClick={(e) => e.stopPropagation()}>
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Detalle de cobro</p>
              <h3>{cobroDetail.series}-{String(cobroDetail.number).padStart(6, '0')}</h3>
              <p className="cko-dialog__sub">{cobroDetail.customerName || 'Cliente rapido'}</p>
            </div>
            <button type="button" className="cko-dialog__close" onClick={() => setCobroDetail(null)} aria-label="Cerrar">&times;</button>
          </header>

          <div className="cko-dialog__total">
            <span>Total</span>
            <strong>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(cobroDetail.grandTotal ?? 0))}</strong>
          </div>

          <div className="cko-dialog__body">
            <div style={{ width: '100%', maxHeight: '38vh', overflow: 'auto', border: '1px solid #efe7dc', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ede8e1', background: '#faf7f4' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: '#7a6f63' }}>Item</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#7a6f63' }}>Cant</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: '#7a6f63' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(cobroDetail.items ?? []).map((item, idx) => (
                    <tr key={`${item.description}-${idx}`} style={{ borderBottom: '1px solid #f3ede6' }}>
                      <td style={{ padding: '6px 8px', color: '#3d3530' }}>{item.description}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#3d3530' }}>{Number(item.qty ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#3d3530' }}>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(item.lineTotal ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="cko-dialog__foot">
            <button type="button" className="restaurant-ghost-btn" onClick={() => setCobroDetail(null)}>
              Cerrar
            </button>
            <button type="button" className="restaurant-ghost-btn" onClick={() => openCommercialDocumentPrintA4(cobroDetail)}>
              Impr. A4
            </button>
            <button type="button" className="restaurant-primary-btn" onClick={() => openCommercialDocumentPreview80mm(cobroDetail)}>
              Ticket 80mm
            </button>
          </footer>
        </div>
      </div>
    )}

    {cobroDetailMessage && <p className="notice restaurant-notice">{cobroDetailMessage}</p>}

    {taxPayloadModal && (
      <div className="cko-backdrop" role="dialog" aria-modal="true" aria-label="Payload tributario" onClick={() => setTaxPayloadModal(null)}>
        <div className="cko-dialog" onClick={(e) => e.stopPropagation()}>
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Puente tributario</p>
              <h3>{taxPayloadModal.title}</h3>
            </div>
            <button type="button" className="cko-dialog__close" onClick={() => setTaxPayloadModal(null)} aria-label="Cerrar">&times;</button>
          </header>

          <div className="cko-dialog__body">
            <pre
              style={{
                margin: 0,
                padding: 12,
                fontSize: '0.74rem',
                lineHeight: 1.35,
                borderRadius: 10,
                border: '1px solid #efe7dc',
                background: '#faf7f4',
                maxHeight: '54vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(taxPayloadModal.payload ?? {}, null, 2)}
            </pre>
          </div>

          <footer className="cko-dialog__foot">
            <button type="button" className="restaurant-ghost-btn" onClick={() => setTaxPayloadModal(null)}>
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    )}

    {/* ── Preparation requirements warning modal ───────────────────────── */}
    {reqsModal && (
      <div
        className="cko-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Stock insuficiente"
        onClick={() => setReqsModal(null)}
      >
        <div className="cko-dialog cko-dialog--requirements" onClick={(e) => e.stopPropagation()}>
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Requerimientos de preparación</p>
              <h3>{reqsModal.shortages.length > 0 ? 'Insumos insuficientes' : 'Stock suficiente para preparar'}</h3>
              <p className="cko-dialog__sub">
                Orden #{reqsModal.row.id} · {reqsModal.row.series}-{String(reqsModal.row.number).padStart(6, '0')}
              </p>
            </div>
            <button
              type="button"
              className="cko-dialog__close"
              onClick={() => setReqsModal(null)}
              aria-label="Cerrar"
            >
              &times;
            </button>
          </header>

          <div className="cko-dialog__body">
            <p style={{ fontSize: '0.83rem', color: '#7a6f63', marginBottom: 12 }}>
              Esta vista ya considera la merma de la receta en el cálculo del requerido.
            </p>
            <div style={{ width: '100%', maxHeight: '44vh', overflow: 'auto', border: '1px solid #efe7dc', borderRadius: 10 }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#7a6f63', textAlign: 'left', borderBottom: '1px solid #ede8e1' }}>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>Ingrediente</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Requerido</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Disponible</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Faltante</th>
                </tr>
              </thead>
              <tbody>
                {(reqsModal.requirements.ingredients_summary ?? []).map((line) => (
                  <tr key={line.ingredient_product_id} style={{ borderBottom: '1px solid #f3ede6' }}>
                    <td style={{ padding: '5px 6px', color: '#3d3530' }}>
                      {line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`}
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#3d3530' }}>{formatQty(Number(line.required_base))}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#166534' }}>{formatQty(Number(line.available_base))}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: Number(line.shortfall_base) > 0 ? '#b91c1c' : '#3d3530', fontWeight: Number(line.shortfall_base) > 0 ? 700 : 500 }}>
                      {formatQty(Number(line.shortfall_base))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {reqsModal.shortages.length > 0 && (
              <p style={{ marginTop: 12, fontSize: '0.8rem', color: '#9a3412' }}>
                Puedes iniciar la preparación igual y ajustar el inventario después, o cancelar para revisar stock primero.
              </p>
            )}
          </div>

          <footer className="cko-dialog__foot">
            <button
              type="button"
              className="restaurant-ghost-btn"
              onClick={() => setReqsModal(null)}
            >
              Cerrar
            </button>
            {reqsModal.allowStart && reqsModal.shortages.length > 0 && (
              <button
                type="button"
                className="restaurant-primary-btn"
                style={{ background: '#d97706' }}
                onClick={() => {
                  const row = reqsModal.row;
                  setReqsModal(null);
                  void moveStatus(row, 'IN_PREP');
                }}
              >
                Iniciar de todas formas
              </button>
            )}
          </footer>
        </div>
      </div>
    )}
    </>
  );
}
