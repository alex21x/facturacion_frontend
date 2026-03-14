import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCashRegister,
  fetchCommerceSettings,
  createLot,
  createPaymentMethod,
  createSeries,
  createWarehouse,
  fetchMastersDashboard,
  updateCommerceSettings,
  updateCashRegister,
  updateDocumentKinds,
  updateInventorySettings,
  updatePaymentMethod,
  updateSeries,
  updateUnits,
  updateWarehouse,
} from '../api';
import type {
  CashRegisterRow,
  CommerceFeatureRow,
  DocumentKindRow,
  InventorySettings,
  LotRow,
  MasterOptionsResponse,
  MastersDashboardResponse,
  PaymentMethodRow,
  SeriesRow,
  UnitRow,
  WarehouseRow,
} from '../types';

type MastersViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
};

type MasterSection = 'warehouse' | 'cash' | 'payment' | 'series' | 'lot' | 'units' | 'settings' | 'doc-kinds' | 'commerce';

const DOC_KIND_OPTIONS: Array<SeriesRow['document_kind']> = [
  'QUOTATION',
  'SALES_ORDER',
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
];

export function MastersView({ accessToken, branchId, warehouseId }: MastersViewProps) {
  const [options, setOptions] = useState<MasterOptionsResponse | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [inventorySettings, setInventorySettings] = useState<InventorySettings | null>(null);
  const [documentKinds, setDocumentKinds] = useState<DocumentKindRow[]>([]);
  const [commerceFeatures, setCommerceFeatures] = useState<CommerceFeatureRow[]>([]);
  const [stats, setStats] = useState<MastersDashboardResponse['stats'] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<MasterSection>('warehouse');
  const [sectionSearch, setSectionSearch] = useState('');

  const warehouseFormRef = useRef<HTMLFormElement | null>(null);
  const cashFormRef = useRef<HTMLFormElement | null>(null);
  const paymentFormRef = useRef<HTMLFormElement | null>(null);
  const seriesFormRef = useRef<HTMLFormElement | null>(null);
  const lotFormRef = useRef<HTMLFormElement | null>(null);
  const settingsFormRef = useRef<HTMLFormElement | null>(null);

  const [warehouseForm, setWarehouseForm] = useState({
    branch_id: branchId,
    code: '',
    name: '',
    address: '',
  });

  const [cashForm, setCashForm] = useState({
    branch_id: branchId,
    code: '',
    name: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    code: '',
    name: '',
  });

  const [seriesForm, setSeriesForm] = useState({
    branch_id: branchId,
    warehouse_id: warehouseId,
    document_kind: 'RECEIPT' as SeriesRow['document_kind'],
    series: '',
    current_number: 0,
  });

  const [lotForm, setLotForm] = useState({
    product_id: 0,
    warehouse_id: warehouseId ?? 0,
    lot_code: '',
    expires_at: '',
    unit_cost: 0,
  });

  const normalizedSearch = useMemo(() => sectionSearch.trim().toLowerCase(), [sectionSearch]);

  const includesSearch = (value: string | number | null | undefined): boolean => {
    if (!normalizedSearch) {
      return true;
    }

    return String(value ?? '').toLowerCase().includes(normalizedSearch);
  };

  const filteredWarehouses = useMemo(
    () =>
      warehouses.filter(
        (row) => includesSearch(row.code) || includesSearch(row.name) || includesSearch(row.address)
      ),
    [warehouses, normalizedSearch]
  );

  const filteredCashRegisters = useMemo(
    () => cashRegisters.filter((row) => includesSearch(row.code) || includesSearch(row.name)),
    [cashRegisters, normalizedSearch]
  );

  const filteredPaymentMethods = useMemo(
    () => paymentMethods.filter((row) => includesSearch(row.code) || includesSearch(row.name)),
    [paymentMethods, normalizedSearch]
  );

  const filteredSeriesRows = useMemo(
    () =>
      seriesRows.filter(
        (row) =>
          includesSearch(row.document_kind) || includesSearch(row.series) || includesSearch(row.current_number)
      ),
    [seriesRows, normalizedSearch]
  );

  const filteredLots = useMemo(
    () =>
      lots.filter(
        (row) =>
          includesSearch(row.product_name) ||
          includesSearch(row.warehouse_name) ||
          includesSearch(row.lot_code) ||
          includesSearch(row.expires_at)
      ),
    [lots, normalizedSearch]
  );

  const filteredUnits = useMemo(
    () =>
      units.filter(
        (row) => includesSearch(row.code) || includesSearch(row.name) || includesSearch(row.sunat_uom_code)
      ),
    [units, normalizedSearch]
  );

  const filteredDocumentKinds = useMemo(
    () => documentKinds.filter((row) => includesSearch(row.code) || includesSearch(row.label)),
    [documentKinds, normalizedSearch]
  );

  const sectionSearchPlaceholder = useMemo(() => {
    switch (activeSection) {
      case 'warehouse':
        return 'Buscar almacen por codigo, nombre o direccion';
      case 'cash':
        return 'Buscar caja por codigo o nombre';
      case 'payment':
        return 'Buscar tipo de pago por codigo o nombre';
      case 'series':
        return 'Buscar serie por tipo, serie o correlativo';
      case 'lot':
        return 'Buscar lote por producto, almacen o codigo';
      case 'settings':
        return 'Buscar en ajustes de inventario';
      case 'units':
        return 'Buscar unidad por codigo, nombre o codigo SUNAT';
      case 'doc-kinds':
        return 'Buscar tipo de comprobante por codigo o nombre';
      case 'commerce':
        return 'Buscar funcionalidad comercial por codigo';
      default:
        return 'Buscar';
    }
  }, [activeSection]);

  const canCreateInSection =
    activeSection === 'warehouse' ||
    activeSection === 'cash' ||
    activeSection === 'payment' ||
    activeSection === 'series' ||
    activeSection === 'lot';

  function focusFirstField(formRef: React.RefObject<HTMLFormElement | null>) {
    formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const firstField = formRef.current?.querySelector('input, select, textarea, button') as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | HTMLButtonElement
      | null;
    firstField?.focus();
  }

  function toCsvCell(value: string | number | boolean | null | undefined): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportSectionData() {
    const dateTag = new Date().toISOString().slice(0, 10);
    let fileName = `masters-${activeSection}-${dateTag}.csv`;
    let lines: string[] = [];

    if (activeSection === 'warehouse') {
      lines = [
        'codigo,nombre,direccion,estado',
        ...filteredWarehouses.map((row) =>
          [
            toCsvCell(row.code),
            toCsvCell(row.name),
            toCsvCell(row.address),
            toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO'),
          ].join(',')
        ),
      ];
    }

    if (activeSection === 'cash') {
      lines = [
        'codigo,nombre,estado',
        ...filteredCashRegisters.map((row) =>
          [toCsvCell(row.code), toCsvCell(row.name), toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO')].join(',')
        ),
      ];
    }

    if (activeSection === 'payment') {
      lines = [
        'codigo,nombre,estado',
        ...filteredPaymentMethods.map((row) =>
          [toCsvCell(row.code), toCsvCell(row.name), toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO')].join(',')
        ),
      ];
    }

    if (activeSection === 'series') {
      lines = [
        'tipo,serie,correlativo,activo',
        ...filteredSeriesRows.map((row) =>
          [
            toCsvCell(row.document_kind),
            toCsvCell(row.series),
            toCsvCell(row.current_number),
            toCsvCell(row.is_enabled ? 'SI' : 'NO'),
          ].join(',')
        ),
      ];
    }

    if (activeSection === 'lot') {
      lines = [
        'producto,almacen,lote,vencimiento',
        ...filteredLots.map((row) =>
          [
            toCsvCell(row.product_name),
            toCsvCell(row.warehouse_name),
            toCsvCell(row.lot_code),
            toCsvCell(row.expires_at ?? '-'),
          ].join(',')
        ),
      ];
    }

    if (activeSection === 'units') {
      lines = [
        'codigo,sunat_uom_code,nombre,habilitada',
        ...filteredUnits.map((row) =>
          [
            toCsvCell(row.code),
            toCsvCell(row.sunat_uom_code),
            toCsvCell(row.name),
            toCsvCell(row.is_enabled ? 'SI' : 'NO'),
          ].join(',')
        ),
      ];
    }

    if (activeSection === 'settings' && inventorySettings) {
      fileName = `masters-settings-${dateTag}.csv`;
      lines = [
        'inventory_mode,lot_outflow_strategy,allow_negative_stock,enforce_lot_for_tracked',
        [
          toCsvCell(inventorySettings.inventory_mode),
          toCsvCell(inventorySettings.lot_outflow_strategy),
          toCsvCell(inventorySettings.allow_negative_stock),
          toCsvCell(inventorySettings.enforce_lot_for_tracked),
        ].join(','),
      ];
    }

    if (activeSection === 'doc-kinds') {
      lines = [
        'codigo,nombre,habilitado',
        ...filteredDocumentKinds.map((row) =>
          [toCsvCell(row.code), toCsvCell(row.label), toCsvCell(row.is_enabled ? 'SI' : 'NO')].join(',')
        ),
      ];
    }

    if (activeSection === 'commerce') {
      lines = [
        'feature_code,enabled',
        ...commerceFeatures.map((row) => [toCsvCell(row.feature_code), toCsvCell(row.is_enabled ? 'SI' : 'NO')].join(',')),
      ];
    }

    if (lines.length === 0) {
      setError('No hay datos para exportar en la seccion activa.');
      return;
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  function handleQuickNew() {
    setMessage('');
    setError('');

    if (activeSection === 'warehouse') {
      setWarehouseForm({ branch_id: branchId, code: '', name: '', address: '' });
      focusFirstField(warehouseFormRef);
      return;
    }

    if (activeSection === 'cash') {
      setCashForm({ branch_id: branchId, code: '', name: '' });
      focusFirstField(cashFormRef);
      return;
    }

    if (activeSection === 'payment') {
      setPaymentForm({ code: '', name: '' });
      focusFirstField(paymentFormRef);
      return;
    }

    if (activeSection === 'series') {
      setSeriesForm({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_kind: 'RECEIPT',
        series: '',
        current_number: 0,
      });
      focusFirstField(seriesFormRef);
      return;
    }

    if (activeSection === 'lot') {
      setLotForm({
        product_id: 0,
        warehouse_id: warehouseId ?? 0,
        lot_code: '',
        expires_at: '',
        unit_cost: 0,
      });
      focusFirstField(lotFormRef);
      return;
    }
  }

  function handleQuickSave() {
    if (activeSection === 'warehouse') {
      warehouseFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'cash') {
      cashFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'payment') {
      paymentFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'series') {
      seriesFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'lot') {
      lotFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'settings') {
      settingsFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'units') {
      void saveUnits();
      return;
    }

    if (activeSection === 'doc-kinds') {
      void saveDocumentKinds();
      return;
    }

    if (activeSection === 'commerce') {
      void saveCommerceSettings();
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true;

      if (event.altKey && !event.repeat && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (canCreateInSection) {
          handleQuickNew();
        }
        return;
      }

      if (event.altKey && !event.repeat && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleQuickSave();
        return;
      }

      if (event.altKey && !event.repeat && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        exportSectionData();
        return;
      }

      if (event.altKey && !event.repeat && event.key.toLowerCase() === 'b' && !isTypingTarget) {
        event.preventDefault();
        const searchInput = document.querySelector('.master-search-control input') as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSection, canCreateInSection, sectionSearch, inventorySettings, documentKinds, units, commerceFeatures]);

  async function loadAll() {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const [dashboard, commerce] = await Promise.all([
        fetchMastersDashboard(accessToken),
        fetchCommerceSettings(accessToken),
      ]);
      setOptions(dashboard.options);
      setWarehouses(dashboard.warehouses);
      setCashRegisters(dashboard.cash_registers);
      setPaymentMethods(dashboard.payment_methods);
      setSeriesRows(dashboard.series);
      setLots(dashboard.lots);
      setUnits(dashboard.units);
      setInventorySettings(dashboard.inventory_settings);
      setDocumentKinds(dashboard.document_kinds);
      setCommerceFeatures(commerce.features ?? []);
      setStats(dashboard.stats);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cargar maestros');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    setWarehouseForm((prev) => ({ ...prev, branch_id: branchId }));
    setCashForm((prev) => ({ ...prev, branch_id: branchId }));
    setSeriesForm((prev) => ({ ...prev, branch_id: branchId, warehouse_id: warehouseId }));
    setLotForm((prev) => ({ ...prev, warehouse_id: warehouseId ?? prev.warehouse_id }));
  }, [branchId, warehouseId]);

  useEffect(() => {
    setSectionSearch('');
  }, [activeSection]);

  async function saveWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createWarehouse(accessToken, warehouseForm);
      setMessage('Almacen creado.');
      setWarehouseForm({ branch_id: branchId, code: '', name: '', address: '' });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear almacen');
    }
  }

  async function saveCash(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createCashRegister(accessToken, cashForm);
      setMessage('Caja creada.');
      setCashForm({ branch_id: branchId, code: '', name: '' });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear caja');
    }
  }

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createPaymentMethod(accessToken, paymentForm);
      setMessage('Tipo de pago creado.');
      setPaymentForm({ code: '', name: '' });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear tipo de pago');
    }
  }

  async function saveSeries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createSeries(accessToken, seriesForm);
      setMessage('Serie creada.');
      setSeriesForm((prev) => ({ ...prev, series: '', current_number: 0 }));
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear serie');
    }
  }

  async function saveLot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createLot(accessToken, {
        product_id: Number(lotForm.product_id),
        warehouse_id: Number(lotForm.warehouse_id),
        lot_code: lotForm.lot_code,
        expires_at: lotForm.expires_at || null,
        unit_cost: Number(lotForm.unit_cost) || 0,
      });
      setMessage('Lote creado.');
      setLotForm((prev) => ({ ...prev, lot_code: '', expires_at: '', unit_cost: 0 }));
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear lote');
    }
  }

  async function toggleWarehouse(row: WarehouseRow) {
    try {
      await updateWarehouse(accessToken, row.id, { status: row.status === 1 ? 0 : 1 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar almacen');
    }
  }

  async function toggleCash(row: CashRegisterRow) {
    try {
      await updateCashRegister(accessToken, row.id, { status: row.status === 1 ? 0 : 1 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar caja');
    }
  }

  async function togglePayment(row: PaymentMethodRow) {
    try {
      await updatePaymentMethod(accessToken, row.id, { status: row.status === 1 ? 0 : 1 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar tipo de pago');
    }
  }

  async function toggleSeries(row: SeriesRow) {
    try {
      await updateSeries(accessToken, row.id, { is_enabled: !row.is_enabled });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar serie');
    }
  }

  async function saveInventorySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inventorySettings) {
      return;
    }

    try {
      await updateInventorySettings(accessToken, inventorySettings);
      setMessage('Configuracion de lotes/inventario actualizada.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar configuracion de inventario');
    }
  }

  async function saveDocumentKinds() {
    try {
      await updateDocumentKinds(
        accessToken,
        documentKinds.map((row) => ({ code: row.code, is_enabled: row.is_enabled }))
      );
      setMessage('Tipos de comprobante actualizados.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron actualizar tipos de comprobante');
    }
  }

  async function saveUnits() {
    try {
      await updateUnits(
        accessToken,
        units.map((row) => ({ id: row.id, is_enabled: row.is_enabled }))
      );
      setMessage('Unidades actualizadas.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron actualizar unidades');
    }
  }

  async function saveCommerceSettings() {
    try {
      const response = await updateCommerceSettings(
        accessToken,
        commerceFeatures.map((row) => ({
          feature_code: row.feature_code,
          is_enabled: row.is_enabled,
          config: row.config,
        }))
      );
      setCommerceFeatures(response.features ?? []);
      setMessage('Funciones comerciales actualizadas.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar configuracion comercial');
    }
  }

  return (
    <section className="module-panel masters-shell">
      <div className="module-header">
        <h3>Masters</h3>
        <button type="button" onClick={() => void loadAll()} disabled={loading}>
          Refrescar
        </button>
      </div>

      {message && <p className="notice">{message}</p>}
      {error && <p className="error-box">{error}</p>}

      {stats && (
        <div className="master-stats">
          <article><span>Almacenes</span><strong>{stats.warehouses_total}</strong></article>
          <article><span>Cajas</span><strong>{stats.cash_registers_total}</strong></article>
          <article><span>Pagos</span><strong>{stats.payment_methods_total}</strong></article>
          <article><span>Series</span><strong>{stats.series_total}</strong></article>
          <article><span>Lotes</span><strong>{stats.lots_total}</strong></article>
          <article><span>Unidades habilitadas</span><strong>{stats.units_enabled_total}</strong></article>
        </div>
      )}

      <nav className="master-nav">
        <button type="button" className={activeSection === 'warehouse' ? 'active' : ''} onClick={() => setActiveSection('warehouse')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6 12 2l8 4-8 4zM4 10l8 4 8-4M4 14l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Stock</span>
              <span className="master-menu-label">Almacenes</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'cash' ? 'active' : ''} onClick={() => setActiveSection('cash')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Punto de venta</span>
              <span className="master-menu-label">Cajas</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'payment' ? 'active' : ''} onClick={() => setActiveSection('payment')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 7h18v10H3zM7 11h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Cobranza</span>
              <span className="master-menu-label">Tipos de Pago</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'series' ? 'active' : ''} onClick={() => setActiveSection('series')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h9l4 4v14H6zM15 3v5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Documentos</span>
              <span className="master-menu-label">Series</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'lot' ? 'active' : ''} onClick={() => setActiveSection('lot')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4h10v4l-2 2v8l-3 2-3-2v-8L7 8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Vencimientos</span>
              <span className="master-menu-label">Lotes</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'settings' ? 'active' : ''} onClick={() => setActiveSection('settings')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5zM3 12h2m14 0h2M12 3v2m0 14v2M5.7 5.7l1.4 1.4m9.8 9.8 1.4 1.4M18.3 5.7l-1.4 1.4m-9.8 9.8-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Reglas</span>
              <span className="master-menu-label">Inventario</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'units' ? 'active' : ''} onClick={() => setActiveSection('units')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h16M4 12h16M4 16h16M8 6v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Catalogo</span>
              <span className="master-menu-label">Unidades</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'doc-kinds' ? 'active' : ''} onClick={() => setActiveSection('doc-kinds')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16M10 6v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Habilitacion</span>
              <span className="master-menu-label">Comprobantes</span>
            </span>
          </span>
        </button>
        <button type="button" className={activeSection === 'commerce' ? 'active' : ''} onClick={() => setActiveSection('commerce')}>
          <span className="master-btn-head">
            <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 12h10M7 7h10M7 17h10M4 7h.01M4 12h.01M4 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <span className="master-menu-kicker">Comercio</span>
              <span className="master-menu-label">Funciones</span>
            </span>
          </span>
        </button>
      </nav>

      <div className="master-nav-mobile-control">
        <label>
          Ir a seccion
          <select value={activeSection} onChange={(e) => setActiveSection(e.target.value as MasterSection)}>
            <option value="warehouse">Almacenes</option>
            <option value="cash">Cajas</option>
            <option value="payment">Tipos de Pago</option>
            <option value="series">Series</option>
            <option value="lot">Lotes</option>
            <option value="units">Unidades</option>
            <option value="settings">Inventario</option>
            <option value="doc-kinds">Comprobantes</option>
            <option value="commerce">Funciones comerciales</option>
          </select>
        </label>
      </div>

      <div className="master-action-bar" role="toolbar" aria-label="Acciones rapidas de maestros">
        <div className="master-action-left">
          <label className="master-search-control">
            Buscar en seccion
            <input
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
              placeholder={sectionSearchPlaceholder}
            />
          </label>
          <span className="shortcut-hint">Atajos: Alt+N Nuevo, Alt+S Guardar, Alt+E Exportar, Alt+B Buscar</span>
        </div>
        <div className="master-action-right">
          <button type="button" onClick={handleQuickNew} disabled={!canCreateInSection} title="Alt+N">
            <span className="action-btn-head">
              <svg className="action-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>Nuevo</span>
            </span>
          </button>
          <button type="button" onClick={handleQuickSave} title="Alt+S">
            <span className="action-btn-head">
              <svg className="action-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4h12l2 2v14H5zM8 4v6h8M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Guardar</span>
            </span>
          </button>
          <button type="button" onClick={exportSectionData} title="Alt+E">
            <span className="action-btn-head">
              <svg className="action-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Exportar</span>
            </span>
          </button>
        </div>
      </div>

      {activeSection === 'warehouse' && (
        <div className="master-section-grid">
          <form ref={warehouseFormRef} className="grid-form master-card" onSubmit={saveWarehouse}>
            <h4>Nuevo Almacen</h4>
            <label>
              Sucursal
              <select
                value={warehouseForm.branch_id ?? ''}
                onChange={(e) =>
                  setWarehouseForm((prev) => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">Sin sucursal</option>
                {(options?.branches ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} - {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Codigo
              <input value={warehouseForm.code} onChange={(e) => setWarehouseForm((prev) => ({ ...prev, code: e.target.value }))} required />
            </label>
            <label>
              Nombre
              <input value={warehouseForm.name} onChange={(e) => setWarehouseForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </label>
            <label>
              Direccion
              <input value={warehouseForm.address} onChange={(e) => setWarehouseForm((prev) => ({ ...prev, address: e.target.value }))} />
            </label>
            <button className="wide" type="submit">Crear almacen</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Almacenes</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredWarehouses.map((row) => (
                  <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td><td><button type="button" onClick={() => void toggleWarehouse(row)}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredWarehouses.length === 0 && (
                  <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'cash' && (
        <div className="master-section-grid">
          <form ref={cashFormRef} className="grid-form master-card" onSubmit={saveCash}>
            <h4>Nueva Caja</h4>
            <label>
              Sucursal
              <select
                value={cashForm.branch_id ?? ''}
                onChange={(e) => setCashForm((prev) => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Sin sucursal</option>
                {(options?.branches ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Codigo
              <input value={cashForm.code} onChange={(e) => setCashForm((prev) => ({ ...prev, code: e.target.value }))} required />
            </label>
            <label>
              Nombre
              <input value={cashForm.name} onChange={(e) => setCashForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </label>
            <button className="wide" type="submit">Crear caja</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Cajas</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredCashRegisters.map((row) => (
                  <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td><td><button type="button" onClick={() => void toggleCash(row)}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredCashRegisters.length === 0 && (
                  <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'payment' && (
        <div className="master-section-grid">
          <form ref={paymentFormRef} className="grid-form master-card" onSubmit={savePayment}>
            <h4>Nuevo Tipo de Pago</h4>
            <label>
              Codigo
              <input value={paymentForm.code} onChange={(e) => setPaymentForm((prev) => ({ ...prev, code: e.target.value }))} required />
            </label>
            <label>
              Nombre
              <input value={paymentForm.name} onChange={(e) => setPaymentForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </label>
            <button className="wide" type="submit">Crear tipo pago</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Tipos de Pago</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredPaymentMethods.map((row) => (
                  <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td><td><button type="button" onClick={() => void togglePayment(row)}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredPaymentMethods.length === 0 && (
                  <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'series' && (
        <div className="master-section-grid">
          <form ref={seriesFormRef} className="grid-form master-card" onSubmit={saveSeries}>
            <h4>Nueva Serie</h4>
            <label>
              Tipo comprobante
              <select
                value={seriesForm.document_kind}
                onChange={(e) =>
                  setSeriesForm((prev) => ({ ...prev, document_kind: e.target.value as SeriesRow['document_kind'] }))
                }
              >
                {DOC_KIND_OPTIONS.map((row) => (
                  <option key={row} value={row}>{row}</option>
                ))}
              </select>
            </label>
            <label>
              Serie
              <input value={seriesForm.series} onChange={(e) => setSeriesForm((prev) => ({ ...prev, series: e.target.value }))} required />
            </label>
            <label>
              Correlativo actual
              <input type="number" min={0} value={seriesForm.current_number} onChange={(e) => setSeriesForm((prev) => ({ ...prev, current_number: Number(e.target.value) }))} />
            </label>
            <button className="wide" type="submit">Crear serie</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Series</h4>
            <table>
              <thead><tr><th>Tipo</th><th>Serie</th><th>Correlativo</th><th>Activo</th><th></th></tr></thead>
              <tbody>
                {filteredSeriesRows.map((row) => (
                  <tr key={row.id}><td>{row.document_kind}</td><td>{row.series}</td><td>{row.current_number}</td><td>{row.is_enabled ? 'SI' : 'NO'}</td><td><button type="button" onClick={() => void toggleSeries(row)}>{row.is_enabled ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredSeriesRows.length === 0 && (
                  <tr><td colSpan={5}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'lot' && (
        <div className="master-section-grid">
          <form ref={lotFormRef} className="grid-form master-card" onSubmit={saveLot}>
            <h4>Nuevo Lote</h4>
            <label>
              Producto
              <select value={lotForm.product_id} onChange={(e) => setLotForm((prev) => ({ ...prev, product_id: Number(e.target.value) }))}>
                <option value={0}>Seleccionar</option>
                {(options?.products ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.sku ?? 'SIN-SKU'} - {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Almacen
              <select value={lotForm.warehouse_id} onChange={(e) => setLotForm((prev) => ({ ...prev, warehouse_id: Number(e.target.value) }))}>
                <option value={0}>Seleccionar</option>
                {(options?.warehouses ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Codigo lote
              <input value={lotForm.lot_code} onChange={(e) => setLotForm((prev) => ({ ...prev, lot_code: e.target.value }))} required />
            </label>
            <label>
              Fecha vencimiento
              <input type="date" value={lotForm.expires_at} onChange={(e) => setLotForm((prev) => ({ ...prev, expires_at: e.target.value }))} />
            </label>
            <button className="wide" type="submit">Crear lote</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Lotes</h4>
            <table>
              <thead><tr><th>Producto</th><th>Almacen</th><th>Lote</th><th>Vence</th></tr></thead>
              <tbody>
                {filteredLots.map((row) => (
                  <tr key={row.id}><td>{row.product_name}</td><td>{row.warehouse_name}</td><td>{row.lot_code}</td><td>{row.expires_at ?? '-'}</td></tr>
                ))}
                {filteredLots.length === 0 && (
                  <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'settings' && inventorySettings && (
        <form ref={settingsFormRef} className="grid-form master-card" onSubmit={saveInventorySettings}>
          <h4>Configuracion de Inventario</h4>
          <label>
            Modo inventario
            <select value={inventorySettings.inventory_mode} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, inventory_mode: e.target.value as InventorySettings['inventory_mode'] } : prev)}>
              <option value="KARDEX_SIMPLE">KARDEX_SIMPLE</option>
              <option value="LOT_TRACKING">LOT_TRACKING</option>
            </select>
          </label>
          <label>
            Estrategia salida lote
            <select value={inventorySettings.lot_outflow_strategy} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, lot_outflow_strategy: e.target.value as InventorySettings['lot_outflow_strategy'] } : prev)}>
              <option value="MANUAL">MANUAL</option>
              <option value="FIFO">FIFO</option>
              <option value="FEFO">FEFO</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={inventorySettings.allow_negative_stock} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, allow_negative_stock: e.target.checked } : prev)} /> Permitir stock negativo
          </label>
          <label>
            <input type="checkbox" checked={inventorySettings.enforce_lot_for_tracked} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enforce_lot_for_tracked: e.target.checked } : prev)} /> Exigir lote para tracking
          </label>
          <button className="wide" type="submit">Guardar configuracion</button>
        </form>
      )}

      {activeSection === 'units' && (
        <div className="table-wrap master-card">
          <h4>Unidades Habilitadas para la Empresa</h4>
          <table>
            <thead><tr><th>Codigo</th><th>Codigo SUNAT</th><th>Nombre</th><th>Habilitada</th></tr></thead>
            <tbody>
              {filteredUnits.map((row) => {
                const index = units.findIndex((item) => item.id === row.id);
                return (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.sunat_uom_code ?? '-'}</td>
                    <td>{row.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.is_enabled}
                        onChange={(e) =>
                          setUnits((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, is_enabled: e.target.checked } : item))
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredUnits.length === 0 && (
                <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
              )}
            </tbody>
          </table>
          <button type="button" onClick={() => void saveUnits()}>Guardar unidades habilitadas</button>
        </div>
      )}

      {activeSection === 'doc-kinds' && (
        <div className="table-wrap master-card">
          <h4>Tipos de Comprobante Habilitados</h4>
          <table>
            <thead><tr><th>Codigo</th><th>Nombre</th><th>Habilitado</th></tr></thead>
            <tbody>
              {filteredDocumentKinds.map((row) => {
                const index = documentKinds.findIndex((item) => item.code === row.code);
                return (
                <tr key={row.code}>
                  <td>{row.code}</td>
                  <td>{row.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_enabled}
                      onChange={(e) =>
                        setDocumentKinds((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, is_enabled: e.target.checked } : item))
                        )
                      }
                    />
                  </td>
                </tr>
                );
              })}
              {filteredDocumentKinds.length === 0 && (
                <tr><td colSpan={3}>Sin resultados para la busqueda actual.</td></tr>
              )}
            </tbody>
          </table>
          <button type="button" onClick={() => void saveDocumentKinds()}>Guardar tipos comprobante</button>
        </div>
      )}

      {activeSection === 'commerce' && (
        <div className="table-wrap master-card">
          <h4>Funciones Comerciales Configurables</h4>
          <table>
            <thead><tr><th>Feature</th><th>Habilitado</th></tr></thead>
            <tbody>
              {commerceFeatures
                .filter((row) => includesSearch(row.feature_code))
                .map((row) => {
                  const index = commerceFeatures.findIndex((item) => item.feature_code === row.feature_code);
                  return (
                    <tr key={row.feature_code}>
                      <td>{row.feature_code}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.is_enabled}
                          onChange={(e) =>
                            setCommerceFeatures((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, is_enabled: e.target.checked } : item))
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              {commerceFeatures.filter((row) => includesSearch(row.feature_code)).length === 0 && (
                <tr><td colSpan={2}>Sin resultados para la busqueda actual.</td></tr>
              )}
            </tbody>
          </table>
          <button type="button" onClick={() => void saveCommerceSettings()}>Guardar funciones comerciales</button>
        </div>
      )}
    </section>
  );
}
