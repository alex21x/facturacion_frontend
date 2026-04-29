import { useEffect, useMemo, useState } from 'react';
import { fmtDateTimeShortLima } from '../../../shared/utils/lima';
import {
  fetchCompanyVerticalSettings,
  fetchCommerceSettings,
  fetchFeatureToggles,
  fetchIgvSettings,
  fetchModules,
  fetchOperationalLimits,
  fetchReconcileStats,
  updateCompanyVerticalSettings,
  updateCommerceSettings,
  updateIgvSettings,
  updateOperationalLimits,
} from '../api';
import type {
  CompanyVerticalSettingsResponse,
  CommerceSettingsFeature,
  FeatureToggleRow,
  IgvSettingsResponse,
  ModuleRow,
  OperationalLimitsResponse,
  ReconcileStatsResponse,
  SalesTaxBridgeConfig,
  UpdateOperationalLimitsPayload,
} from '../types';

type AppConfigViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
  currentUserRoleCode: string | null;
  activeVerticalCode: string | null;
};

const UI_LABELS = {
  // Header & Navigation
  title: 'Configuración',
  refresh: 'Refrescar',

  // Descriptions
  description: 'Panel central de parámetros del sistema.',

  // Context
  operationalContext: 'Contexto operativo actual',
  branch: 'Sucursal',
  warehouse: 'Almacén',
  cashRegister: 'Caja',

  // Vertical Settings
  verticalHeader: 'Verticalización por rubro',
  activeVertical: 'Rubro activo de la empresa',
  selectVertical: 'Seleccionar rubro',
  saveVertical: 'Guardar rubro activo',
  currentActive: 'Activo actual:',
  notDefined: 'No definido',

  // Vertical Table Headers
  code: 'Código',
  name: 'Nombre',
  assigned: 'Asignado',
  primary: 'Principal',

  // Limits Form
  maxCompanies: 'Máx. empresas habilitadas',
  maxBranches: 'Máx. sucursales habilitadas',
  maxWarehouses: 'Máx. almacenes habilitados',
  maxCashRegisters: 'Máx. cajas habilitadas',
  saveLimits: 'Guardar límites',

  // IGV Settings
  igvLabel: 'IGV activo (%)',
  saveIgv: 'Guardar IGV',
  igvDescription: 'Maestro IGV activo para la empresa. Esta tasa se aplica a ventas, compras y al payload tributario.',
  igvActive: 'Activo:',

  // Current Usage
  currentUsage: 'Uso actual',
  resource: 'Recurso',
  usage: 'Uso',
  limit: 'Límite',
  companies: 'Empresas',
  branches: 'Sucursales',
  warehouses: 'Almacenes',
  cashRegisters: 'Cajas',

  // Modules Table
  modulesHeader: 'Módulos',
  coreModule: 'Core',
  companyLevel: 'Empresa',
  branchLevel: 'Sucursal',
  active: 'Activo',

  // Feature Toggles Table
  featuresHeader: 'Funcionalidades',
  editableFeaturesHeader: 'Funcionalidades editables',
  source: 'Fuente',

  // Commerce Features
  commerceHeader: 'Configuración de funcionalidades',
  enabled: 'Habilitado',
  saveFeatures: 'Guardar cambios',
  taxBridgeHeader: 'Puente tributario SUNAT',
  taxBridgeDebugHeader: 'Visor técnico de bridge SUNAT',
  taxBridgeDebugRoles: 'Roles autorizados',
  taxBridgeDebugRolesHint: 'Ingrese códigos de rol separados por coma. Ejemplo: ADMIN,SOPORTE,VENDEDOR. Si lo deja vacío, se mantiene el fallback técnico/admin.',

  // Boolean Display
  yes: 'SI',
  no: 'NO',
  notApplicable: '-',

  // Tax Bridge - Send Mode
  taxBridgeSendMode: 'Modo de envío SUNAT',
  autoSend: 'Envío automático al emitir',
  manualSend: 'Envío manual desde botón',
  autoSendHint: 'Cada comprobante tributario emitido se manda al puente automáticamente.',
  manualSendHint: 'El usuario lo enviará desde el botón Enviar SUNAT en la lista, como en el legado.',
  forceAsyncOnIssue: 'Forzar envío asíncrono SUNAT',
  forceAsyncOnIssueEnabledHint: 'La emisión no espera respuesta SUNAT. El envío se procesa en segundo plano y no bloquea la venta.',
  forceAsyncOnIssueDisabledHint: 'El envío automático usa modo síncrono y puede aumentar el tiempo de respuesta al emitir.',

  // Tax Bridge - Auto Reconciliation
  autoReconciliation: 'Reintentos automáticos SUNAT',
  activeStatus: 'Activo',
  disabledStatus: 'Desactivado',
  autoReconciliationEnabled: 'El sistema reintenta solo los documentos pendientes en segundo plano, con espera progresiva (1 → 2 → 4 → … → 120 min). Una vez aceptados, se actualizan solos. Usted no tiene que hacer nada.',
  autoReconciliationDisabled: 'Los reintentos automáticos están pausados. Los documentos pendientes quedarán esperando hasta que los reenvíe manualmente desde Excepciones SUNAT.',
  maxDocsPerCycle: 'Máximo de documentos por ciclo:',
  maxDocsRange: '(5 – 50)',
  batchSizeHint: 'Lote bajo (5 – 10) = más silencioso durante la venta. Lote alto (40 – 50) = resuelve la cola más rápido en horario tranquilo.',

  // Tax Bridge - Stats
  inQueue: 'En cola',
  notSent: 'Sin enviar',
  nextRetry: 'Próximo reintento automático',
  allClear: '✓ Todo en orden — no hay documentos pendientes',

  // Tax Bridge - Configuration
  bridgeMode: 'Modo puente tributario',
  production: 'PRODUCCIÓN',
  beta: 'BETA',
  productionUrl: 'URL puente PRODUCCIÓN',
  betaUrl: 'URL puente BETA',
  urlHint: 'Si ingresas solo la base del puente, el sistema completará automáticamente el método correcto: /index.php/Sunat/<método>. Cada tarea usa su método, por ejemplo send_xml o register_CERT.',
  timeout: 'Timeout (segundos)',
  authScheme: 'Auth puente',
  noToken: 'Sin token',
  bearerToken: 'Bearer token',
  tokenLabel: 'Token (opcional)',
  solUser: 'Usuario SOL',
  solPassword: 'Password SOL',
  localCodeBranch: 'Código local SUNAT de la sucursal',
  pseSend: 'Envío PSE (opcional)',
  branchLocalDescription: 'El código local se guarda por sucursal. Las credenciales SOL y el usuario/password secundario SUNAT se mantienen como configuración general de la empresa.',

  // Vertical Source Display
  overrideSource: 'Sobreescrito empresa/rubro',
  templateSource: 'Template rubro',
  fallbackSource: 'Fallback empresa/sucursal',
};

const FEATURE_LABELS: Record<string, string> = {
  DOC_KIND_CREDIT_NOTE: 'Notas de crédito',
  DOC_KIND_CREDIT_NOTE_: 'Notas de crédito',
  DOC_KIND_DEBIT_NOTE: 'Notas de débito',
  DOC_KIND_DEBIT_NOTE_: 'Notas de débito',
  RESTAURANT_MENU_IGV_INCLUDED: 'Menú con IGV incluido',
  RESTAURANT_RECIPES_ENABLED: 'Validar recetas en comandas',
  PRODUCT_MULTI_UOM: 'Múltiples unidades por producto',
  PRODUCT_UOM_CONVERSIONS: 'Conversión de unidades',
  PRODUCT_WHOLESALE_PRICING: 'Precios por volumen',
  INVENTORY_PRODUCTS_BY_PROFILE: 'Productos según perfil',
  INVENTORY_PRODUCT_MASTERS_BY_PROFILE: 'Catálogo según perfil',
  SALES_CUSTOMER_PRICE_PROFILE: 'Precios por cliente',
  SALES_WORKSHOP_MULTI_VEHICLE: 'Taller: clientes con multiples vehiculos',
  SALES_SELLER_TO_CASHIER: 'Flujo vendedor a caja',
  SALES_ALLOW_ISSUED_EDIT_BEFORE_SUNAT_FINAL: 'Editar emitidos antes de respuesta final SUNAT',
  SALES_ANTICIPO_ENABLED: 'Cobro con anticipo',
  SALES_TAX_BRIDGE: 'Envío a SUNAT',
  SALES_TAX_BRIDGE_DEBUG_VIEW: 'Ver diagnóstico SUNAT',
  SALES_GLOBAL_DISCOUNT_ENABLED: 'Descuento global en ventas',
  SALES_ITEM_DISCOUNT_ENABLED: 'Descuento por item en ventas',
  SALES_FREE_ITEMS_ENABLED: 'Operaciones gratuitas en ventas',
  SALES_DETRACCION_ENABLED: 'Usar detracción en ventas',
  SALES_RETENCION_ENABLED: 'Usar retención en ventas',
  SALES_PERCEPCION_ENABLED: 'Usar percepción en ventas',
  PURCHASES_GLOBAL_DISCOUNT_ENABLED: 'Descuento global en compras',
  PURCHASES_ITEM_DISCOUNT_ENABLED: 'Descuento por item en compras',
  PURCHASES_FREE_ITEMS_ENABLED: 'Operaciones gratuitas en compras',
  PURCHASES_DETRACCION_ENABLED: 'Usar detracción en compras',
  PURCHASES_RETENCION_COMPRADOR_ENABLED: 'Retención compra por comprador',
  PURCHASES_RETENCION_PROVEEDOR_ENABLED: 'Retención compra por proveedor',
  PURCHASES_PERCEPCION_ENABLED: 'Usar percepción en compras',
};

function humanizeFeatureCode(code: string): string {
  return code
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? humanizeFeatureCode(code);
}

function featureRowLabel(row: { feature_code: string; feature_label?: string | null }): string {
  const label = (row.feature_label ?? '').trim();
  if (label !== '' && label.toUpperCase() !== row.feature_code.toUpperCase()) {
    return label;
  }

  return featureLabel(row.feature_code);
}

type FeatureCategory = 'documentos' | 'restaurante' | 'inventario' | 'ventas' | 'compras' | 'otros';

const FEATURE_CATEGORY_META: Array<{ key: FeatureCategory; label: string }> = [
  { key: 'documentos', label: 'Documentos' },
  { key: 'restaurante', label: 'Restaurante' },
  { key: 'inventario', label: 'Inventario y Productos' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'compras', label: 'Compras' },
  { key: 'otros', label: 'Otros' },
];

function featureCategoryByCode(code: string): FeatureCategory {
  const key = code.toUpperCase();
  if (key.startsWith('DOC_KIND_')) return 'documentos';
  if (key.startsWith('RESTAURANT_')) return 'restaurante';
  if (key.startsWith('PRODUCT_') || key.startsWith('INVENTORY_')) return 'inventario';
  if (key.startsWith('SALES_')) return 'ventas';
  if (key.startsWith('PURCHASES_')) return 'compras';
  return 'otros';
}

function verticalSourceLabel(source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return UI_LABELS.overrideSource;
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return UI_LABELS.templateSource;
  }

  return UI_LABELS.fallbackSource;
}

function verticalSourceBadgeClass(source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'appcfg-source-badge appcfg-source-badge--override';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'appcfg-source-badge appcfg-source-badge--template';
  }

  return 'appcfg-source-badge appcfg-source-badge--fallback';
}

function normalizeRoleCodesInput(rawValue: unknown): string[] {
  if (Array.isArray(rawValue)) {
    return Array.from(new Set(rawValue.map((value) => String(value).trim().toUpperCase()).filter((value) => value !== '')));
  }

  if (typeof rawValue === 'string') {
    return Array.from(new Set(rawValue
      .split(/[;,\n\r]+/)
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value !== '')));
  }

  return [];
}

export function AppConfigView({ accessToken, branchId, warehouseId, cashRegisterId, currentUserRoleCode, activeVerticalCode }: AppConfigViewProps) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [features, setFeatures] = useState<FeatureToggleRow[]>([]);
  const [limits, setLimits] = useState<OperationalLimitsResponse | null>(null);
  const [limitsForm, setLimitsForm] = useState<UpdateOperationalLimitsPayload>({});
  const [commerceFeatures, setCommerceFeatures] = useState<CommerceSettingsFeature[]>([]);
  const [commerceFeaturesForm, setCommerceFeaturesForm] = useState<Record<string, boolean>>({});
  const [taxBridgeForm, setTaxBridgeForm] = useState<SalesTaxBridgeConfig>({
    bridge_mode: 'PRODUCTION',
    production_url: '',
    beta_url: '',
    timeout_seconds: 15,
    auth_scheme: 'none',
    token: '',
    auto_send_on_issue: true,
    force_async_on_issue: true,
    auto_reconcile_enabled: true,
    reconcile_batch_size: 20,
    sol_user: '',
    sol_pass: '',
    envio_pse: '',
  });
  const [taxBridgeDebugRolesInput, setTaxBridgeDebugRolesInput] = useState('');
  const [reconcileStats, setReconcileStats] = useState<ReconcileStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [igvSettings, setIgvSettings] = useState<IgvSettingsResponse | null>(null);
  const [igvRatePercent, setIgvRatePercent] = useState('18');
  const [verticalSettings, setVerticalSettings] = useState<CompanyVerticalSettingsResponse | null>(null);
  const [selectedVerticalCode, setSelectedVerticalCode] = useState('');
  const [activeTab, setActiveTab] = useState<'identidad' | 'plataforma' | 'modulos' | 'comercial'>('identidad');

  const isAdminUser = useMemo(() => {
    const roleCode = (currentUserRoleCode ?? '').trim().toUpperCase();
    return roleCode === 'ADMIN' || roleCode === 'ADMINISTRADOR' || roleCode === 'SUPERADMIN' || roleCode === 'SUPER_ADMIN';
  }, [currentUserRoleCode]);

  const isRetailVertical = useMemo(() => {
    return String(activeVerticalCode ?? '').trim().toUpperCase() === 'RETAIL';
  }, [activeVerticalCode]);

  const adminManagedFeatureCodes = useMemo(
    () =>
      new Set([
        'SALES_GLOBAL_DISCOUNT_ENABLED',
        'SALES_ITEM_DISCOUNT_ENABLED',
        'SALES_FREE_ITEMS_ENABLED',
        'SALES_DETRACCION_ENABLED',
        'SALES_RETENCION_ENABLED',
        'SALES_PERCEPCION_ENABLED',
        'PURCHASES_GLOBAL_DISCOUNT_ENABLED',
        'PURCHASES_ITEM_DISCOUNT_ENABLED',
        'PURCHASES_FREE_ITEMS_ENABLED',
        'PURCHASES_DETRACCION_ENABLED',
        'PURCHASES_RETENCION_COMPRADOR_ENABLED',
        'PURCHASES_RETENCION_PROVEEDOR_ENABLED',
        'PURCHASES_PERCEPCION_ENABLED',
      ]),
    []
  );

  async function loadAppCfg() {
    setLoading(true);
    setMessage('');

    try {
      // Fetch all independent data in parallel
      const [moduleRows, featureRows, igvRows, limitRows, verticalRowsResult, commerceRowsResult, branchCommerceRowsResult] = await Promise.allSettled([
        fetchModules(accessToken),
        fetchFeatureToggles(accessToken),
        fetchIgvSettings(accessToken),
        fetchOperationalLimits(accessToken),
        fetchCompanyVerticalSettings(accessToken),
        fetchCommerceSettings(accessToken),
        branchId ? fetchCommerceSettings(accessToken, branchId) : Promise.resolve(null),
      ]);

      if (moduleRows.status === 'fulfilled') setModules(moduleRows.value);
      if (featureRows.status === 'fulfilled') setFeatures(featureRows.value);

      if (igvRows.status === 'fulfilled') {
        setIgvSettings(igvRows.value);
        setIgvRatePercent(String(igvRows.value.active_rate.rate_percent ?? 18));
      }

      if (limitRows.status === 'fulfilled') {
        const limitData = limitRows.value;
        setLimits(limitData);
        setLimitsForm({
          max_companies_enabled: limitData.platform_limits.max_companies_enabled,
          max_branches_enabled: limitData.company_limits.max_branches_enabled,
          max_warehouses_enabled: limitData.company_limits.max_warehouses_enabled,
          max_cash_registers_enabled: limitData.company_limits.max_cash_registers_enabled,
        });
      }

      if (verticalRowsResult.status === 'fulfilled') {
        setVerticalSettings(verticalRowsResult.value);
        setSelectedVerticalCode(verticalRowsResult.value.active_vertical?.code ?? '');
      } else {
        setVerticalSettings(null);
        setSelectedVerticalCode('');
      }

      if (commerceRowsResult.status === 'fulfilled') {
        const commerceRows = commerceRowsResult.value;
        setCommerceFeatures(commerceRows.features);
        const map: Record<string, boolean> = {};
        for (const f of commerceRows.features) {
          map[f.feature_code] = f.is_enabled;
        }
        setCommerceFeaturesForm(map);

        const bridge = commerceRows.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE');
        const cfg = (bridge?.config && typeof bridge.config === 'object' ? bridge.config : {}) as SalesTaxBridgeConfig;
        const debugBridge = commerceRows.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE_DEBUG_VIEW');
        const debugCfg = debugBridge?.config && typeof debugBridge.config === 'object'
          ? debugBridge.config as { allowed_role_codes?: unknown }
          : {};
        setTaxBridgeForm({
          bridge_mode: cfg.bridge_mode === 'BETA' ? 'BETA' : 'PRODUCTION',
          production_url: String(cfg.production_url ?? ''),
          beta_url: String(cfg.beta_url ?? ''),
          timeout_seconds: Number(cfg.timeout_seconds ?? 15),
          auth_scheme: cfg.auth_scheme === 'bearer' ? 'bearer' : 'none',
          token: String(cfg.token ?? ''),
          force_async_on_issue: cfg.force_async_on_issue ?? true,
          auto_send_on_issue: cfg.auto_send_on_issue ?? true,
          auto_reconcile_enabled: cfg.auto_reconcile_enabled !== false,
          reconcile_batch_size: Number(cfg.reconcile_batch_size ?? 20),
          sol_user: String(cfg.sol_user ?? ''),
          sol_pass: String(cfg.sol_pass ?? ''),
          codigolocal: '',
          envio_pse: String(cfg.envio_pse ?? ''),
        });
        setTaxBridgeDebugRolesInput(normalizeRoleCodesInput(debugCfg.allowed_role_codes).join(', '));

        // Apply branch-level codigolocal if available
        if (branchCommerceRowsResult.status === 'fulfilled' && branchCommerceRowsResult.value) {
          const branchBridge = branchCommerceRowsResult.value.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE');
          const branchCfg = (branchBridge?.config && typeof branchBridge.config === 'object'
            ? branchBridge.config
            : {}) as SalesTaxBridgeConfig;
          setTaxBridgeForm((prev) => ({
            ...prev,
            codigolocal: String(branchCfg.codigolocal ?? ''),
          }));
        }

        // Load reconcile stats (non-blocking, fire after main load)
        fetchReconcileStats(accessToken).then(setReconcileStats).catch(() => {/* stats optional */});
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar AppCfg';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppCfg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId]);

  async function handleSaveLimits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const nextLimits = await updateOperationalLimits(accessToken, {
        max_companies_enabled: Number(limitsForm.max_companies_enabled),
        max_branches_enabled: Number(limitsForm.max_branches_enabled),
        max_warehouses_enabled: Number(limitsForm.max_warehouses_enabled),
        max_cash_registers_enabled: Number(limitsForm.max_cash_registers_enabled),
      });

      setLimits(nextLimits);
      setMessage('Limites operativos actualizados.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo actualizar limites';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCommerceFeatures(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = commerceFeatures
        .filter((row) => {
          // Exclude only the known superadmin-managed commercial toggles.
          // Keep SALES_TAX_BRIDGE and SALES_TAX_BRIDGE_DEBUG_VIEW writable here.
          return !adminManagedFeatureCodes.has(row.feature_code);
        })
        .map((row) => {
        const feature_code = row.feature_code;
        const is_enabled = commerceFeaturesForm[feature_code] ?? false;

        if (feature_code === 'SALES_TAX_BRIDGE') {
          return {
            feature_code,
            is_enabled,
            config: {
              bridge_mode: taxBridgeForm.bridge_mode === 'BETA' ? 'BETA' : 'PRODUCTION',
              production_url: String(taxBridgeForm.production_url ?? '').trim(),
              beta_url: String(taxBridgeForm.beta_url ?? '').trim(),
              timeout_seconds: Math.max(5, Math.min(60, Number(taxBridgeForm.timeout_seconds ?? 15))),
              auth_scheme: taxBridgeForm.auth_scheme === 'bearer' ? 'bearer' : 'none',
              force_async_on_issue: taxBridgeForm.force_async_on_issue !== false,
              token: String(taxBridgeForm.token ?? '').trim(),
              auto_send_on_issue: Boolean(taxBridgeForm.auto_send_on_issue),
              auto_reconcile_enabled: taxBridgeForm.auto_reconcile_enabled !== false,
              reconcile_batch_size: Math.max(5, Math.min(50, Number(taxBridgeForm.reconcile_batch_size ?? 20))),
              sol_user: String(taxBridgeForm.sol_user ?? '').trim(),
              sol_pass: String(taxBridgeForm.sol_pass ?? ''),
              envio_pse: String(taxBridgeForm.envio_pse ?? '').trim(),
            },
          };
        }

        if (feature_code === 'SALES_TAX_BRIDGE_DEBUG_VIEW') {
          const allowedRoleCodes = normalizeRoleCodesInput(taxBridgeDebugRolesInput);
          return {
            feature_code,
            is_enabled,
            config: allowedRoleCodes.length > 0
              ? { allowed_role_codes: allowedRoleCodes }
              : null,
          };
        }

        return {
          feature_code,
          is_enabled,
          config: row.config ?? null,
        };
      });

      const result = await updateCommerceSettings(accessToken, { features: payload });

      if (branchId) {
        await updateCommerceSettings(
          accessToken,
          {
            features: [
              {
                feature_code: 'SALES_TAX_BRIDGE',
                is_enabled: commerceFeaturesForm.SALES_TAX_BRIDGE ?? false,
                config: {
                  codigolocal: String(taxBridgeForm.codigolocal ?? '').trim(),
                },
              },
            ],
          },
          branchId
        );
      }

      setCommerceFeatures(result.features);
      const map: Record<string, boolean> = {};
      for (const f of result.features) {
        map[f.feature_code] = f.is_enabled;
      }
      setCommerceFeaturesForm(map);
      const resultDebugBridge = result.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE_DEBUG_VIEW');
      const resultDebugCfg = resultDebugBridge?.config && typeof resultDebugBridge.config === 'object'
        ? resultDebugBridge.config as { allowed_role_codes?: unknown }
        : {};
      setTaxBridgeDebugRolesInput(normalizeRoleCodesInput(resultDebugCfg.allowed_role_codes).join(', '));
      setMessage('Funcionalidades comerciales actualizadas.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo actualizar funcionalidades';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveIgvSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await updateIgvSettings(accessToken, Number(igvRatePercent || 0));
      setIgvSettings(result);
      setIgvRatePercent(String(result.active_rate.rate_percent ?? 18));
      setMessage('Maestro IGV actualizado.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo actualizar IGV';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveVerticalSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVerticalCode) {
      setMessage('Selecciona un rubro para guardar.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const result = await updateCompanyVerticalSettings(accessToken, {
        vertical_code: selectedVerticalCode,
      });
      setVerticalSettings(result);
      setSelectedVerticalCode(result.active_vertical?.code ?? selectedVerticalCode);
      setMessage('Rubro activo actualizado.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo actualizar rubro activo';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  const commerceFeatureCodes = new Set(commerceFeatures.map((row) => row.feature_code));
  const readonlyFeatures = features.filter((row) => !commerceFeatureCodes.has(row.feature_code));
  const editableFeatures = commerceFeatures;
  const groupedReadonlyFeatures = useMemo(() => {
    const grouped = new Map<FeatureCategory, FeatureToggleRow[]>();
    for (const row of readonlyFeatures) {
      const category = featureCategoryByCode(row.feature_code);
      const current = grouped.get(category) ?? [];
      current.push(row);
      grouped.set(category, current);
    }
    return grouped;
  }, [readonlyFeatures]);

  const groupedEditableFeatures = useMemo(() => {
    const grouped = new Map<FeatureCategory, CommerceSettingsFeature[]>();
    for (const row of editableFeatures) {
      if (isRetailVertical && featureCategoryByCode(row.feature_code) === 'restaurante') {
        continue;
      }
      const category = featureCategoryByCode(row.feature_code);
      const current = grouped.get(category) ?? [];
      current.push(row);
      grouped.set(category, current);
    }
    return grouped;
  }, [editableFeatures, isRetailVertical]);

  const groupedReadonlyFeaturesFiltered = useMemo(() => {
    const grouped = new Map<FeatureCategory, FeatureToggleRow[]>();
    for (const row of readonlyFeatures) {
      const category = featureCategoryByCode(row.feature_code);
      if (isRetailVertical && category === 'restaurante') {
        continue;
      }
      const current = grouped.get(category) ?? [];
      current.push(row);
      grouped.set(category, current);
    }
    return grouped;
  }, [readonlyFeatures, isRetailVertical]);

  const visibleFeatureCategoryMeta = useMemo(
    () => FEATURE_CATEGORY_META.filter((meta) => !(isRetailVertical && meta.key === 'restaurante')),
    [isRetailVertical]
  );

  return (
    <section className="module-panel">
      <div className="module-header">
        <div>
          <h3>{UI_LABELS.title}</h3>

            {commerceFeatures.some((row) => row.feature_code === 'SALES_TAX_BRIDGE_DEBUG_VIEW') && (
              <div className="cfg-card">
                <h4 className="cfg-card-title">{UI_LABELS.taxBridgeDebugHeader}</h4>
                <div className="grid-form">
                  <label className="wide">
                    {UI_LABELS.taxBridgeDebugRoles}
                    <textarea
                      rows={3}
                      value={taxBridgeDebugRolesInput}
                      onChange={(e) => setTaxBridgeDebugRolesInput(e.target.value)}
                      placeholder="ADMIN,SOPORTE,VENDEDOR"
                    />
                    <small>{UI_LABELS.taxBridgeDebugRolesHint}</small>
                  </label>
                </div>
              </div>
            )}
          <p className="cfg-lead">{UI_LABELS.description}</p>
        </div>
        <button type="button" onClick={() => void loadAppCfg()} disabled={loading}>
          {UI_LABELS.refresh}
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {/* Barra de contexto siempre visible */}
      <div className="cfg-context-bar">
        <div className="cfg-context-pill">
          <span>{UI_LABELS.branch}</span>
          <strong>{branchId ?? UI_LABELS.notApplicable}</strong>
        </div>
        <div className="cfg-context-pill">
          <span>{UI_LABELS.warehouse}</span>
          <strong>{warehouseId ?? UI_LABELS.notApplicable}</strong>
        </div>
        <div className="cfg-context-pill">
          <span>{UI_LABELS.cashRegister}</span>
          <strong>{cashRegisterId ?? UI_LABELS.notApplicable}</strong>
        </div>
        {igvSettings && (
          <div className="cfg-context-pill cfg-context-pill--accent">
            <span>IGV activo</span>
            <strong>{igvSettings.active_rate.rate_percent}%</strong>
          </div>
        )}
        {verticalSettings?.active_vertical && (
          <div className="cfg-context-pill cfg-context-pill--rubro">
            <span>Rubro</span>
            <strong>{verticalSettings.active_vertical.name}</strong>
          </div>
        )}
      </div>

      {/* Pestanas de navegacion */}
      <div className="cfg-tabs" role="tablist">
        {(
          [
            { id: 'identidad', label: 'Identidad' },
            { id: 'plataforma', label: 'Plataforma' },
            { id: 'modulos', label: 'Modulos' },
            ...(commerceFeatures.length > 0 ? [{ id: 'comercial', label: 'Comercial' }] : []),
          ] as { id: typeof activeTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`cfg-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pestana: Identidad */}
      {activeTab === 'identidad' && (
        <div className="cfg-tab-panel">
          {verticalSettings ? (
            <div className="cfg-card">
              <h4 className="cfg-card-title">{UI_LABELS.verticalHeader}</h4>
              <form className="grid-form" onSubmit={handleSaveVerticalSettings}>
                <label>
                  {UI_LABELS.activeVertical}
                  <select
                    value={selectedVerticalCode}
                    onChange={(e) => setSelectedVerticalCode(e.target.value)}
                  >
                    <option value="">{UI_LABELS.selectVertical}</option>
                    {verticalSettings.verticals.map((row) => (
                      <option key={row.id} value={row.code}>
                        {row.name} ({row.code})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="entity-filter-action">
                  <button type="submit" disabled={loading || !selectedVerticalCode}>
                    {UI_LABELS.saveVertical}
                  </button>
                </div>
              </form>
              <table style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>{UI_LABELS.code}</th>
                    <th>{UI_LABELS.name}</th>
                    <th>{UI_LABELS.assigned}</th>
                    <th>{UI_LABELS.primary}</th>
                  </tr>
                </thead>
                <tbody>
                  {verticalSettings.verticals.map((row) => (
                    <tr
                      key={row.id}
                      className={row.code === verticalSettings.active_vertical?.code ? 'cfg-row--active' : ''}
                    >
                      <td><code className="cfg-code">{row.code}</code></td>
                      <td>{row.name}</td>
                      <td>
                        {row.is_assigned
                          ? <span className="cfg-badge cfg-badge--yes">Si</span>
                          : <span className="cfg-badge cfg-badge--no">No</span>}
                      </td>
                      <td>
                        {row.is_primary
                          ? <span className="cfg-badge cfg-badge--yes">Si</span>
                          : <span className="cfg-badge cfg-badge--no">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cfg-empty">Sin datos de verticalizacion disponibles.</div>
          )}
        </div>
      )}

      {/* Pestana: Plataforma */}
      {activeTab === 'plataforma' && (
        <div className="cfg-tab-panel">
          <div className="cfg-grid-2">
            <div className="cfg-card">
              <h4 className="cfg-card-title">Limites de plataforma</h4>
              <form className="grid-form" onSubmit={handleSaveLimits}>
                <label>
                  {UI_LABELS.maxCompanies}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_companies_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_companies_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxBranches}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_branches_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_branches_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxWarehouses}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_warehouses_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_warehouses_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxCashRegisters}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_cash_registers_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_cash_registers_enabled: Number(e.target.value) }))}
                  />
                </label>
                <button className="wide" type="submit" disabled={loading}>
                  {UI_LABELS.saveLimits}
                </button>
              </form>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="cfg-card">
                <h4 className="cfg-card-title">IGV maestro</h4>
                <form className="grid-form" onSubmit={handleSaveIgvSettings}>
                  <label>
                    {UI_LABELS.igvLabel}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={igvRatePercent}
                      onChange={(e) => setIgvRatePercent(e.target.value)}
                    />
                  </label>
                  <div className="entity-filter-action">
                    <button type="submit" disabled={loading}>{UI_LABELS.saveIgv}</button>
                  </div>
                  <p className="notice" style={{ gridColumn: '1 / -1', fontSize: '0.8rem', margin: 0 }}>
                    {UI_LABELS.igvDescription}
                  </p>
                  {igvSettings && (
                    <p style={{ gridColumn: '1 / -1', margin: 0 }}>
                      <strong>{UI_LABELS.igvActive}</strong> {igvSettings.active_rate.name}
                    </p>
                  )}
                </form>
              </div>
              {limits && (
                <div className="cfg-card">
                  <h4 className="cfg-card-title">{UI_LABELS.currentUsage}</h4>
                  <div className="cfg-usage-list">
                    {[
                      { label: UI_LABELS.companies, used: limits.usage.enabled_companies, max: limits.platform_limits.max_companies_enabled },
                      { label: UI_LABELS.branches, used: limits.usage.enabled_branches, max: limits.company_limits.max_branches_enabled },
                      { label: UI_LABELS.warehouses, used: limits.usage.enabled_warehouses, max: limits.company_limits.max_warehouses_enabled },
                      { label: UI_LABELS.cashRegisters, used: limits.usage.enabled_cash_registers, max: limits.company_limits.max_cash_registers_enabled },
                    ].map((item) => {
                      const pct = Math.min(100, Math.round((item.used / item.max) * 100));
                      const color = item.used >= item.max ? '#dc2626' : pct > 80 ? '#f59e0b' : 'var(--primary, #2563eb)';
                      return (
                        <div key={item.label} className="cfg-usage-row">
                          <div className="cfg-usage-meta">
                            <span>{item.label}</span>
                            <span className={item.used >= item.max ? 'cfg-usage-full' : ''}>{item.used} / {item.max}</span>
                          </div>
                          <div className="cfg-usage-track">
                            <div className="cfg-usage-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pestana: Modulos */}
      {activeTab === 'modulos' && (
        <div className="cfg-tab-panel">
          <div className="cfg-card" style={{ marginBottom: '1rem' }}>
            <h4 className="cfg-card-title">{UI_LABELS.modulesHeader}</h4>
            <table>
              <thead>
                <tr>
                  <th>{UI_LABELS.code}</th>
                  <th>{UI_LABELS.name}</th>
                  <th>{UI_LABELS.coreModule}</th>
                  <th>{UI_LABELS.companyLevel}</th>
                  <th>{UI_LABELS.branchLevel}</th>
                  <th>{UI_LABELS.active}</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((row) => (
                  <tr key={row.id}>
                    <td><code className="cfg-code">{row.code}</code></td>
                    <td>{row.name}</td>
                    <td>{row.is_core ? <span className="cfg-badge cfg-badge--core">Core</span> : UI_LABELS.notApplicable}</td>
                    <td>
                      {row.company_enabled === null ? UI_LABELS.notApplicable
                        : row.company_enabled ? <span className="cfg-badge cfg-badge--yes">Si</span>
                        : <span className="cfg-badge cfg-badge--no">No</span>}
                    </td>
                    <td>
                      {row.branch_enabled === null ? UI_LABELS.notApplicable
                        : row.branch_enabled ? <span className="cfg-badge cfg-badge--yes">Si</span>
                        : <span className="cfg-badge cfg-badge--no">No</span>}
                    </td>
                    <td>
                      {row.is_enabled
                        ? <span className="cfg-badge cfg-badge--yes">Activo</span>
                        : <span className="cfg-badge cfg-badge--no">Inactivo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={handleSaveCommerceFeatures}>
            <div className="cfg-card">
              <h4 className="cfg-card-title">{UI_LABELS.featuresHeader}</h4>
              <div className="cfg-feature-groups">
                {visibleFeatureCategoryMeta.map((meta) => {
                  const readonlyItems = groupedReadonlyFeaturesFiltered.get(meta.key) ?? [];
                  const editableItems = groupedEditableFeatures.get(meta.key) ?? [];
                  if (readonlyItems.length === 0 && editableItems.length === 0) {
                    return null;
                  }

                  return (
                    <section key={meta.key} className="cfg-feature-group">
                      <header className="cfg-feature-group__header">
                        <h5>{meta.label}</h5>
                        <small>{readonlyItems.length + editableItems.length} funcionalidades</small>
                      </header>

                      <div className="cfg-feature-grid">
                        {readonlyItems.map((row) => (
                          <div
                            key={row.feature_code}
                            className={`cfg-feature-card${row.is_enabled ? ' cfg-feature-card--on' : ''}`}
                            title={row.feature_code}
                          >
                            <div className="cfg-feature-card__header">
                              <span className="cfg-feature-card__name">{featureRowLabel(row)}</span>
                              <span className={`cfg-feature-card__status${row.is_enabled ? ' on' : ''}`}>
                                {row.is_enabled ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            <div className="cfg-feature-card__meta">
                              <span className={verticalSourceBadgeClass(row.vertical_source)}>
                                {verticalSourceLabel(row.vertical_source)}
                              </span>
                              {row.company_enabled !== null && (
                                <span className="cfg-feature-card__level">Empresa: {row.company_enabled ? 'Si' : 'No'}</span>
                              )}
                              {row.branch_enabled !== null && (
                                <span className="cfg-feature-card__level">Sucursal: {row.branch_enabled ? 'Si' : 'No'}</span>
                              )}
                            </div>
                          </div>
                        ))}

                        {editableItems.map((row) => {
                          const featureCat = featureCategoryByCode(row.feature_code);
                          const isManagedByAdminPortal = featureCat === 'ventas' || featureCat === 'compras';
                          const enabled = commerceFeaturesForm[row.feature_code] ?? false;

                          return (
                            <div
                              key={row.feature_code}
                              className={`cfg-feature-card cfg-feature-card--editable${enabled ? ' cfg-feature-card--on' : ''}`}
                              title={row.feature_code}
                            >
                              <div className="cfg-feature-card__header">
                                <span className="cfg-feature-card__name">{featureRowLabel(row)}</span>
                                <label className="cfg-switch cfg-feature-card__switch">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    disabled={isManagedByAdminPortal}
                                    onChange={(e) =>
                                      setCommerceFeaturesForm((prev) => ({ ...prev, [row.feature_code]: e.target.checked }))
                                    }
                                  />
                                  <span className="cfg-switch__slider" />
                                </label>
                              </div>
                              <div className="cfg-feature-card__meta">
                                <span className={verticalSourceBadgeClass(row.vertical_source)}>
                                  {verticalSourceLabel(row.vertical_source)}
                                </span>
                                <span className={`cfg-feature-card__status${enabled ? ' on' : ''}`}>
                                  {enabled ? 'Activo' : 'Inactivo'}
                                </span>
                                {isManagedByAdminPortal && <span className="cfg-feature-card__level">Gestionado en Admin por empresa</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            <p className="notice" style={{ marginTop: '10px' }}>
              Las reglas de ventas/compras sensibles se administran por empresa desde el portal Admin.
            </p>

            {commerceFeatures.length > 0 && (
              <button type="submit" disabled={loading} style={{ marginTop: '10px' }}>
                {UI_LABELS.saveFeatures}
              </button>
            )}
          </form>
        </div>
      )}

      {activeTab === 'comercial' && commerceFeatures.length > 0 && (
        <div className="cfg-tab-panel">
          <form onSubmit={handleSaveCommerceFeatures}>
            {(commerceFeaturesForm.SALES_TAX_BRIDGE ?? false) ? (
              <div className="cfg-card">
                <h4 className="cfg-card-title">{UI_LABELS.taxBridgeHeader}</h4>
                <div className="grid-form">
                  <div className="tax-bridge-send-mode wide">
                    <span className="tax-bridge-send-mode__label">{UI_LABELS.taxBridgeSendMode}</span>
                    <label className="tax-bridge-send-mode__switch">
                      <input
                        type="checkbox"
                        checked={Boolean(taxBridgeForm.auto_send_on_issue)}
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_send_on_issue: e.target.checked }))}
                      />
                      <span>{taxBridgeForm.auto_send_on_issue ? UI_LABELS.autoSend : UI_LABELS.manualSend}</span>
                    </label>
                    <small className="tax-bridge-send-mode__hint">
                      {taxBridgeForm.auto_send_on_issue ? UI_LABELS.autoSendHint : UI_LABELS.manualSendHint}
                    </small>
                  </div>
                  <div className="tax-bridge-send-mode wide">
                    <span className="tax-bridge-send-mode__label">{UI_LABELS.forceAsyncOnIssue}</span>
                    <label className="tax-bridge-send-mode__switch">
                      <input
                        type="checkbox"
                        checked={taxBridgeForm.force_async_on_issue !== false}
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, force_async_on_issue: e.target.checked }))}
                      />
                      <span>{taxBridgeForm.force_async_on_issue !== false ? UI_LABELS.activeStatus : UI_LABELS.disabledStatus}</span>
                    </label>
                    <small className="tax-bridge-send-mode__hint">
                      {taxBridgeForm.force_async_on_issue !== false
                        ? UI_LABELS.forceAsyncOnIssueEnabledHint
                        : UI_LABELS.forceAsyncOnIssueDisabledHint}
                    </small>
                  </div>
                  <div className="tax-bridge-send-mode wide" style={{ background: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--card)' : '#fef2f2', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="tax-bridge-send-mode__label" style={{ fontWeight: 700 }}>
                        {UI_LABELS.autoReconciliation}
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={taxBridgeForm.auto_reconcile_enabled !== false}
                          onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_reconcile_enabled: e.target.checked }))}
                        />
                        <span style={{ fontWeight: 600, color: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--ok, #16a34a)' : '#dc2626' }}>
                          {taxBridgeForm.auto_reconcile_enabled !== false ? UI_LABELS.activeStatus : UI_LABELS.disabledStatus}
                        </span>
                      </label>
                    </div>
                    <small style={{ color: 'var(--ink-soft)', display: 'block', marginBottom: 10 }}>
                      {taxBridgeForm.auto_reconcile_enabled !== false
                        ? UI_LABELS.autoReconciliationEnabled
                        : UI_LABELS.autoReconciliationDisabled}
                    </small>
                    {taxBridgeForm.auto_reconcile_enabled !== false && (
                      <>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                            {UI_LABELS.maxDocsPerCycle} <strong>{taxBridgeForm.reconcile_batch_size ?? 20}</strong>
                            {' '}<span style={{ color: 'var(--ink-soft)', fontSize: '0.75rem' }}>{UI_LABELS.maxDocsRange}</span>
                          </span>
                          <input
                            type="range"
                            min={5}
                            max={50}
                            step={5}
                            value={taxBridgeForm.reconcile_batch_size ?? 20}
                            onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, reconcile_batch_size: Number(e.target.value) }))}
                            style={{ width: '100%', accentColor: 'var(--primary, #2563eb)' }}
                          />
                          <small style={{ color: 'var(--ink-soft)' }}>{UI_LABELS.batchSizeHint}</small>
                        </label>
                        {reconcileStats && (
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                            <div style={{ background: reconcileStats.pending_reconcile_count > 0 ? '#fef9c3' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.pending_reconcile_count > 0 ? '#92400e' : '#15803d' }}>{reconcileStats.pending_reconcile_count}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>{UI_LABELS.inQueue}</div>
                            </div>
                            <div style={{ background: reconcileStats.unsent_count > 0 ? '#fff7ed' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.unsent_count > 0 ? '#9a3412' : '#15803d' }}>{reconcileStats.unsent_count}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>{UI_LABELS.notSent}</div>
                            </div>
                            {reconcileStats.next_reconcile_at && (
                              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 160 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)' }}>{UI_LABELS.nextRetry}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                                  {fmtDateTimeShortLima(reconcileStats.next_reconcile_at)}
                                </div>
                              </div>
                            )}
                            {reconcileStats.pending_reconcile_count === 0 && reconcileStats.unsent_count === 0 && (
                              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px', flex: 1, color: '#15803d', fontSize: '0.8rem', fontWeight: 600 }}>
                                {UI_LABELS.allClear}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <label>
                    {UI_LABELS.bridgeMode}
                    <select
                      value={taxBridgeForm.bridge_mode ?? 'PRODUCTION'}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, bridge_mode: e.target.value === 'BETA' ? 'BETA' : 'PRODUCTION' }))}
                    >
                      <option value="PRODUCTION">{UI_LABELS.production}</option>
                      <option value="BETA">{UI_LABELS.beta}</option>
                    </select>
                  </label>
                  <label>
                    {UI_LABELS.productionUrl}
                    <input
                      value={taxBridgeForm.production_url ?? ''}
                      placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNAT/index.php/Sunat"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, production_url: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.betaUrl}
                    <input
                      value={taxBridgeForm.beta_url ?? ''}
                      placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNATBETA/index.php/Sunat"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, beta_url: e.target.value }))}
                    />
                  </label>
                  <p className="tax-bridge-send-mode__hint">{UI_LABELS.urlHint}</p>
                  <label>
                    {UI_LABELS.timeout}
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={taxBridgeForm.timeout_seconds ?? 15}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, timeout_seconds: Number(e.target.value || 15) }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.authScheme}
                    <select
                      value={taxBridgeForm.auth_scheme ?? 'none'}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auth_scheme: e.target.value === 'bearer' ? 'bearer' : 'none' }))}
                    >
                      <option value="none">{UI_LABELS.noToken}</option>
                      <option value="bearer">{UI_LABELS.bearerToken}</option>
                    </select>
                  </label>
                  <label>
                    {UI_LABELS.tokenLabel}
                    <input
                      value={taxBridgeForm.token ?? ''}
                      placeholder="Bearer token"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, token: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.solUser}
                    <input
                      value={taxBridgeForm.sol_user ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_user: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.solPassword}
                    <input
                      type="password"
                      value={taxBridgeForm.sol_pass ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_pass: e.target.value }))}
                    />
                  </label>
                  {branchId ? (
                    <label>
                      {UI_LABELS.localCodeBranch}
                      <input
                        maxLength={4}
                        value={taxBridgeForm.codigolocal ?? ''}
                        placeholder="0000"
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, codigolocal: e.target.value }))}
                      />
                    </label>
                  ) : null}
                  <label>
                    {UI_LABELS.pseSend}
                    <input
                      value={taxBridgeForm.envio_pse ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, envio_pse: e.target.value }))}
                    />
                  </label>
                  {branchId ? (
                    <p className="tax-bridge-send-mode__hint wide">{UI_LABELS.branchLocalDescription}</p>
                  ) : null}
                </div>
                <button type="submit" disabled={loading} style={{ marginTop: '10px' }}>
                  {UI_LABELS.saveFeatures}
                </button>
              </div>
            ) : (
              <div className="cfg-empty">Activa la funcionalidad de puente tributario desde la pestaña Modulos para configurar esta seccion.</div>
            )}
          </form>
        </div>
      )}
    </section>
  );
}