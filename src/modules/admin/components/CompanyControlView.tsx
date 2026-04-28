import { useEffect, useMemo, useState } from 'react';
import {
  createAdminCompany,
  fetchCompanyCommerceAdminMatrix,
  fetchCompanyInventorySettingsAdminMatrix,
  fetchCompanyOperationalLimitMatrix,
  fetchCompanyRateLimitMatrix,
  fetchCompanyVerticalAdminMatrix,
  resetAdminCompanyPassword,
  updateCompanyCommerceAdminMatrix,
  updateCompanyInventorySettingsAdminMatrix,
  updateCompanyOperationalLimitMatrix,
  updateCompanyOperationalLimitMatrixBulk,
  updateCompanyRateLimitMatrix,
  updateCompanyRateLimitMatrixBulk,
  updateCompanyVerticalAdminMatrix,
  updateCompanyVerticalAdminMatrixBulk,
} from '../../appcfg/api';
import type {
  CompanyCommerceAdminMatrixResponse,
  CompanyInventorySettingsAdminMatrixResponse,
  InventorySettingsRecord,
  CompanyOperationalLimitMatrixResponse,
  CompanyRateLimitMatrixResponse,
  CompanyVerticalAdminMatrixResponse,
} from '../../appcfg/types';

const FEATURE_LABELS: Record<string, string> = {
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

const REQUIRED_COMMERCE_FEATURE_CODES: string[] = [
  'SALES_CUSTOMER_PRICE_PROFILE',
  'SALES_WORKSHOP_MULTI_VEHICLE',
  'SALES_SELLER_TO_CASHIER',
  'SALES_ALLOW_ISSUED_EDIT_BEFORE_SUNAT_FINAL',
  'SALES_ANTICIPO_ENABLED',
  'SALES_TAX_BRIDGE',
  'SALES_TAX_BRIDGE_DEBUG_VIEW',
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
];

function buildCommerceFeatureCodes(matrix: CompanyCommerceAdminMatrixResponse | null): string[] {
  const apiCodes = matrix?.feature_codes ?? [];
  const companyCodes = new Set<string>();

  for (const company of matrix?.companies ?? []) {
    for (const code of Object.keys(company.features ?? {})) {
      companyCodes.add(code);
    }
  }

  const merged = new Set<string>([
    ...REQUIRED_COMMERCE_FEATURE_CODES,
    ...apiCodes,
    ...Array.from(companyCodes),
  ]);

  const preferredOrder = new Map<string, number>();
  REQUIRED_COMMERCE_FEATURE_CODES.forEach((code, index) => preferredOrder.set(code, index));

  return Array.from(merged).sort((a, b) => {
    const aIndex = preferredOrder.get(a);
    const bIndex = preferredOrder.get(b);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function normalizeCompanyFeatures(codes: string[], companyFeatures: Record<string, boolean> | undefined): Record<string, boolean> {
  const normalized: Record<string, boolean> = {};
  for (const code of codes) {
    normalized[code] = Boolean(companyFeatures?.[code]);
  }
  return normalized;
}

function featureLabel(code: string): string {
  if (FEATURE_LABELS[code]) return FEATURE_LABELS[code];
  return code.replace(/_+/g, ' ').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function buildSuggestedAdminUsername(taxId: string, legalName: string): string {
  const cleanTaxId = (taxId || '').replace(/\D+/g, '');
  if (cleanTaxId.length >= 6) {
    return `admin_${cleanTaxId}`;
  }

  const slugBase = (legalName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18);

  return slugBase ? `admin_${slugBase}` : 'admin_empresa';
}

type Props = { accessToken: string; onUnauthorized?: () => void };

type AdminPanelKey = 'companies' | 'operational' | 'rate' | 'commerce' | 'inventory';

type ResetPreview = {
  companyName: string;
  username: string;
  email: string | null;
  newPassword: string;
  generatedAtLabel: string;
};

export function CompanyControlView({ accessToken, onUnauthorized }: Props) {
  const PAGE_SIZE = 12;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activePanel, setActivePanel] = useState<AdminPanelKey>('companies');

  function handleApiError(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : fallback;
    if (msg.toLowerCase().includes('expirada') || msg.toLowerCase().includes('invalida')) {
      onUnauthorized?.();
    }
    return msg;
  }
  const [isError, setIsError] = useState(false);
  const [matrix, setMatrix]   = useState<CompanyVerticalAdminMatrixResponse | null>(null);
  const [rateMatrix, setRateMatrix] = useState<CompanyRateLimitMatrixResponse | null>(null);
  const [operationalMatrix, setOperationalMatrix] = useState<CompanyOperationalLimitMatrixResponse | null>(null);
  const [selectedVerticalByCompany, setSelectedVerticalByCompany] = useState<Record<number, string>>({});
  const [rateDraftByCompany, setRateDraftByCompany] = useState<Record<number, {
    is_enabled: boolean;
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
    plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
  }>>({});
  const [searchText, setSearchText]               = useState('');
  const [filterVerticalCode, setFilterVerticalCode] = useState('');
  const [bulkVerticalCode, setBulkVerticalCode]     = useState('');
  const [bulkRateRead, setBulkRateRead] = useState(3600);
  const [bulkRateWrite, setBulkRateWrite] = useState(2400);
  const [bulkRateReports, setBulkRateReports] = useState(900);
  const [bulkPresetCode, setBulkPresetCode] = useState<'BASIC' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [opDraftByCompany, setOpDraftByCompany] = useState<Record<number, {
    max_branches_enabled: number;
    max_warehouses_enabled: number;
    max_cash_registers_enabled: number;
    max_cash_registers_per_warehouse: number;
  }>>({});
  const [bulkOpBranches, setBulkOpBranches] = useState(1);
  const [bulkOpWarehouses, setBulkOpWarehouses] = useState(1);
  const [bulkOpCash, setBulkOpCash] = useState(1);
  const [bulkOpCashPerWarehouse, setBulkOpCashPerWarehouse] = useState(1);
  const [commerceMatrix, setCommerceMatrix] = useState<CompanyCommerceAdminMatrixResponse | null>(null);
  const [inventoryMatrix, setInventoryMatrix] = useState<CompanyInventorySettingsAdminMatrixResponse | null>(null);
  const [commerceDraftByCompany, setCommerceDraftByCompany] = useState<Record<number, Record<string, boolean>>>({});
  const [inventoryDraftByCompany, setInventoryDraftByCompany] = useState<Record<number, InventorySettingsRecord>>({});
  const [selectedCommerceCompanyId, setSelectedCommerceCompanyId] = useState<number | null>(null);
  const [commerceCompanyQuery, setCommerceCompanyQuery] = useState('');
  const [commerceCompanyDropdownOpen, setCommerceCompanyDropdownOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    tax_id: '',
    legal_name: '',
    trade_name: '',
    email: '',
    phone: '',
    address: '',
    vertical_code: '',
    admin_username: '',
    admin_password: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_phone: '',
    main_branch_code: '001',
    main_branch_name: 'Sucursal Principal',
    create_default_warehouse: true,
    default_warehouse_code: 'ALM-001',
    default_warehouse_name: 'Almacen Principal',
    create_default_cash_register: true,
    default_cash_register_code: 'CAJA-001',
    default_cash_register_name: 'Caja Principal',
    plan_code: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM',
    preset_code: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE',
  });

  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [resetModal, setResetModal] = useState<ResetPreview | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'general' | 'access' | 'security' | 'history'>('general');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [resetPreviewByCompany, setResetPreviewByCompany] = useState<Record<number, ResetPreview>>({});
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false);
  const [adminUsernameTouched, setAdminUsernameTouched] = useState(false);
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [currentCompanyPage, setCurrentCompanyPage] = useState(1);

  useEffect(() => {
    if (adminUsernameTouched) return;
    const suggested = buildSuggestedAdminUsername(createDraft.tax_id, createDraft.legal_name);
    setCreateDraft(prev => {
      if (prev.admin_username === suggested) return prev;
      return { ...prev, admin_username: suggested };
    });
  }, [adminUsernameTouched, createDraft.tax_id, createDraft.legal_name]);

  async function doResetAdminPassword(companyId: number, companyName: string) {
    if (!confirm(`¿Resetear la contraseña del administrador de "${companyName}"? Se generará una nueva contraseña temporal.`)) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await resetAdminCompanyPassword(accessToken, companyId);
      const generatedAtLabel = new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(new Date());
      const preview: ResetPreview = {
        companyName,
        username: result.username,
        email: result.email,
        newPassword: result.new_password,
        generatedAtLabel,
      };
      setResetPreviewByCompany((prev) => ({
        ...prev,
        [companyId]: preview,
      }));
      setShowResetPassword(false);
      setResetPasswordCopied(false);
      setResetModal(preview);
      setMessage(`Nueva clave temporal generada para ${companyName}.`);
      setIsError(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo resetear la contraseña');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function copyResetCredentials(preview: ResetPreview) {
    try {
      await navigator.clipboard.writeText(`Empresa: ${preview.companyName}\nUsuario: ${preview.username}\nClave temporal: ${preview.newPassword}`);
      setResetPasswordCopied(true);
    } catch {
      setMessage('No se pudo copiar la credencial.');
      setIsError(true);
    }
  }

  async function loadMatrix() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const [verticalResult, rateResult, operationalResult, commerceResult, inventoryResult] = await Promise.all([
        fetchCompanyVerticalAdminMatrix(accessToken),
        fetchCompanyRateLimitMatrix(accessToken),
        fetchCompanyOperationalLimitMatrix(accessToken),
        fetchCompanyCommerceAdminMatrix(accessToken),
        fetchCompanyInventorySettingsAdminMatrix(accessToken),
      ]);

      setMatrix(verticalResult);
      setRateMatrix(rateResult);
      setOperationalMatrix(operationalResult);
      setCommerceMatrix(commerceResult);
      setInventoryMatrix(inventoryResult);

      const allCommerceCodes = buildCommerceFeatureCodes(commerceResult);
      const nextCommerceDraft: Record<number, Record<string, boolean>> = {};
      for (const company of commerceResult.companies) {
        nextCommerceDraft[company.company_id] = normalizeCompanyFeatures(allCommerceCodes, company.features);
      }
      setCommerceDraftByCompany(nextCommerceDraft);

      setSelectedCommerceCompanyId(prev => {
        if (prev !== null) return prev;
        const first = commerceResult.companies[0];
        if (first) {
          setCommerceCompanyQuery(first.legal_name + (first.tax_id ? ` (${first.tax_id})` : ''));
        }
        return first?.company_id ?? null;
      });

      const nextInventoryDraft: Record<number, InventorySettingsRecord> = {};
      for (const company of inventoryResult.companies) {
        nextInventoryDraft[company.company_id] = { ...company.inventory_settings };
      }
      setInventoryDraftByCompany(nextInventoryDraft);

      const nextMap: Record<number, string> = {};
      for (const company of verticalResult.companies) {
        nextMap[company.company_id] = company.active_vertical_code ?? verticalResult.verticals[0]?.code ?? '';
      }
      setSelectedVerticalByCompany(nextMap);

      const nextRateDraft: Record<number, {
        is_enabled: boolean;
        requests_per_minute_read: number;
        requests_per_minute_write: number;
        requests_per_minute_reports: number;
        plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
      }> = {};
      for (const company of rateResult.companies) {
        nextRateDraft[company.company_id] = {
          is_enabled: company.is_enabled,
          requests_per_minute_read: company.requests_per_minute_read,
          requests_per_minute_write: company.requests_per_minute_write,
          requests_per_minute_reports: company.requests_per_minute_reports,
          plan_code: company.plan_code,
        };
      }
      setRateDraftByCompany(nextRateDraft);

      const nextOpDraft: Record<number, {
        max_branches_enabled: number;
        max_warehouses_enabled: number;
        max_cash_registers_enabled: number;
        max_cash_registers_per_warehouse: number;
      }> = {};
      for (const company of operationalResult.companies) {
        nextOpDraft[company.company_id] = {
          max_branches_enabled: company.max_branches_enabled,
          max_warehouses_enabled: company.max_warehouses_enabled,
          max_cash_registers_enabled: company.max_cash_registers_enabled,
          max_cash_registers_per_warehouse: company.max_cash_registers_per_warehouse,
        };
      }
      setOpDraftByCompany(nextOpDraft);

      setBulkVerticalCode(prev => prev || verticalResult.verticals[0]?.code || '');
      setBulkRateRead(rateResult.defaults.requests_per_minute_read);
      setBulkRateWrite(rateResult.defaults.requests_per_minute_write);
      setBulkRateReports(rateResult.defaults.requests_per_minute_reports);
      setBulkPresetCode('PRO');
      setBulkOpBranches(operationalResult.defaults.max_branches_enabled);
      setBulkOpWarehouses(operationalResult.defaults.max_warehouses_enabled);
      setBulkOpCash(operationalResult.defaults.max_cash_registers_enabled);
      setBulkOpCashPerWarehouse(operationalResult.defaults.max_cash_registers_per_warehouse);
    } catch (err) {
      setMessage(handleApiError(err, 'No se pudo cargar el control de empresas'));
      setIsError(true);
      setMatrix(null);
      setRateMatrix(null);
      setOperationalMatrix(null);
      setCommerceMatrix(null);
      setInventoryMatrix(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMatrix(); }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [searchText]);

  const allCommerceFeatureCodes = useMemo(
    () => buildCommerceFeatureCodes(commerceMatrix),
    [commerceMatrix]
  );

  async function saveCommerceOne(companyId: number) {
    const draft = commerceDraftByCompany[companyId];
    if (!draft) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyCommerceAdminMatrix(accessToken, companyId, draft);
      setCommerceMatrix(result);
      const codes = buildCommerceFeatureCodes(result);
      const updatedCompany = result.companies.find(c => c.company_id === companyId);
      setCommerceDraftByCompany(prev => ({
        ...prev,
        [companyId]: normalizeCompanyFeatures(codes, updatedCompany?.features),
      }));
      setMessage('Reglas de ventas/compras actualizadas');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function saveInventoryOne(companyId: number) {
    const draft = inventoryDraftByCompany[companyId];
    if (!draft) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyInventorySettingsAdminMatrix(accessToken, companyId, draft);
      setInventoryMatrix(result);
      setMessage('Configuración de inventario actualizada');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
      setIsError(true);
    } finally { setLoading(false); }
  }

  const filteredCompanies = useMemo(() => {
    return (matrix?.companies ?? []).filter(company => {
      const search = debouncedSearchText.trim().toLowerCase();
      const bySearch =
        search === '' ||
        company.legal_name.toLowerCase().includes(search) ||
        (company.trade_name ?? '').toLowerCase().includes(search) ||
        (company.tax_id ?? '').toLowerCase().includes(search);
      const byVertical =
        filterVerticalCode === '' ||
        company.active_vertical_code === filterVerticalCode ||
        company.assignments.some(a => a.vertical_code === filterVerticalCode && a.is_enabled);
      return bySearch && byVertical;
    });
  }, [matrix?.companies, debouncedSearchText, filterVerticalCode]);

  useEffect(() => {
    setCurrentCompanyPage(1);
  }, [debouncedSearchText, filterVerticalCode]);

  async function toggleOne(companyId: number, isEnabled: boolean) {
    if (!matrix) return;
    const verticalCode = selectedVerticalByCompany[companyId] ?? matrix.verticals[0]?.code ?? '';
    if (!verticalCode) { setMessage('Selecciona un rubro.'); setIsError(true); return; }
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyVerticalAdminMatrix(accessToken, {
        company_id: companyId,
        vertical_code: verticalCode,
        is_enabled: isEnabled,
        make_primary: true,
      });
      setMatrix(result);
      setMessage(isEnabled ? 'Empresa activada correctamente.' : 'Empresa desactivada.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar la empresa');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function toggleBulk(isEnabled: boolean) {
    if (!matrix) return;
    const verticalCode = bulkVerticalCode || matrix.verticals[0]?.code || '';
    const companyIds   = filteredCompanies.map(c => c.company_id);
    if (!verticalCode) { setMessage('Selecciona el rubro para la acción masiva.'); setIsError(true); return; }
    if (companyIds.length === 0) { setMessage('No hay empresas en el filtro actual.'); setIsError(true); return; }
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyVerticalAdminMatrixBulk(accessToken, {
        company_ids: companyIds,
        vertical_code: verticalCode,
        is_enabled: isEnabled,
        make_primary: true,
      });
      setMatrix(result);
      setMessage(
        isEnabled
          ? `Activación masiva completada — ${companyIds.length} empresa(s).`
          : `Desactivación masiva completada — ${companyIds.length} empresa(s).`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la acción masiva');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function saveRateOne(companyId: number) {
    const draft = rateDraftByCompany[companyId];
    if (!draft) {
      setMessage('No se encontraron valores para guardar.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyRateLimitMatrix(accessToken, {
        company_id: companyId,
        is_enabled: draft.is_enabled,
        requests_per_minute_read: draft.requests_per_minute_read,
        requests_per_minute_write: draft.requests_per_minute_write,
        requests_per_minute_reports: draft.requests_per_minute_reports,
        plan_code: draft.plan_code,
        preset_code: draft.plan_code !== 'CUSTOM' ? draft.plan_code : undefined,
      });
      setRateMatrix(result);
      setRateDraftByCompany(() => {
        const next: Record<number, {
          is_enabled: boolean;
          requests_per_minute_read: number;
          requests_per_minute_write: number;
          requests_per_minute_reports: number;
          plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
        }> = {};
        for (const company of result.companies) {
          next[company.company_id] = {
            is_enabled: company.is_enabled,
            requests_per_minute_read: company.requests_per_minute_read,
            requests_per_minute_write: company.requests_per_minute_write,
            requests_per_minute_reports: company.requests_per_minute_reports,
            plan_code: company.plan_code,
          };
        }
        return next;
      });
      setMessage('Límite por empresa actualizado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar el límite por empresa');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveRateBulk(isEnabled: boolean) {
    const companyIds = filteredCompanies.map(c => c.company_id);
    if (companyIds.length === 0) {
      setMessage('No hay empresas en el filtro actual.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyRateLimitMatrixBulk(accessToken, {
        company_ids: companyIds,
        is_enabled: isEnabled,
        requests_per_minute_read: bulkRateRead,
        requests_per_minute_write: bulkRateWrite,
        requests_per_minute_reports: bulkRateReports,
        plan_code: bulkPresetCode,
        preset_code: bulkPresetCode,
      });
      setRateMatrix(result);
      setRateDraftByCompany(() => {
        const next: Record<number, {
          is_enabled: boolean;
          requests_per_minute_read: number;
          requests_per_minute_write: number;
          requests_per_minute_reports: number;
          plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
        }> = {};
        for (const company of result.companies) {
          next[company.company_id] = {
            is_enabled: company.is_enabled,
            requests_per_minute_read: company.requests_per_minute_read,
            requests_per_minute_write: company.requests_per_minute_write,
            requests_per_minute_reports: company.requests_per_minute_reports,
            plan_code: company.plan_code,
          };
        }
        return next;
      });
      setMessage(`Límites masivos aplicados en ${companyIds.length} empresa(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la actualización masiva de límites');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveOperationalOne(companyId: number) {
    const draft = opDraftByCompany[companyId];
    if (!draft) {
      setMessage('No se encontraron límites operativos para guardar.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyOperationalLimitMatrix(accessToken, {
        company_id: companyId,
        max_branches_enabled: draft.max_branches_enabled,
        max_warehouses_enabled: draft.max_warehouses_enabled,
        max_cash_registers_enabled: draft.max_cash_registers_enabled,
        max_cash_registers_per_warehouse: draft.max_cash_registers_per_warehouse,
      });
      setOperationalMatrix(result);
      setMessage('Límite operativo por empresa actualizado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar límite operativo');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveOperationalBulk() {
    const companyIds = filteredCompanies.map(c => c.company_id);
    if (companyIds.length === 0) {
      setMessage('No hay empresas en el filtro actual.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyOperationalLimitMatrixBulk(accessToken, {
        company_ids: companyIds,
        max_branches_enabled: bulkOpBranches,
        max_warehouses_enabled: bulkOpWarehouses,
        max_cash_registers_enabled: bulkOpCash,
        max_cash_registers_per_warehouse: bulkOpCashPerWarehouse,
      });
      setOperationalMatrix(result);
      setMessage(`Límites operativos masivos aplicados en ${companyIds.length} empresa(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la actualización masiva de límites operativos');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  function applyBulkPreset() {
    if (!rateMatrix) return;
    const preset = rateMatrix.presets.find(p => p.code === bulkPresetCode);
    if (!preset) return;
    setBulkRateRead(preset.requests_per_minute_read);
    setBulkRateWrite(preset.requests_per_minute_write);
    setBulkRateReports(preset.requests_per_minute_reports);
  }

  async function copyCompanyAccessLink(companyId: number) {
    const row = matrix?.companies.find(c => c.company_id === companyId);
    if (!row?.access_url) {
      setMessage('La empresa aun no tiene link de acceso.');
      setIsError(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(row.access_url);
      setMessage(`Link copiado: ${row.access_url}`);
      setIsError(false);
    } catch {
      setMessage('No se pudo copiar el link.');
      setIsError(true);
    }
  }

  async function createCompanyFromAdmin() {
    if (!createDraft.tax_id.trim() || !createDraft.legal_name.trim() || !createDraft.admin_username.trim() || !createDraft.admin_password.trim() || !createDraft.admin_first_name.trim()) {
      setMessage('Completa RUC, razon social y datos del admin inicial.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await createAdminCompany(accessToken, {
        tax_id: createDraft.tax_id.trim(),
        legal_name: createDraft.legal_name.trim(),
        trade_name: createDraft.trade_name.trim() || undefined,
        email: createDraft.email.trim() || undefined,
        phone: createDraft.phone.trim() || undefined,
        address: createDraft.address.trim() || undefined,
        vertical_code: createDraft.vertical_code || undefined,
        main_branch_code: createDraft.main_branch_code.trim() || undefined,
        main_branch_name: createDraft.main_branch_name.trim() || undefined,
        create_default_warehouse: createDraft.create_default_warehouse,
        default_warehouse_code: createDraft.default_warehouse_code.trim() || undefined,
        default_warehouse_name: createDraft.default_warehouse_name.trim() || undefined,
        create_default_cash_register: createDraft.create_default_cash_register,
        default_cash_register_code: createDraft.default_cash_register_code.trim() || undefined,
        default_cash_register_name: createDraft.default_cash_register_name.trim() || undefined,
        admin_username: createDraft.admin_username.trim(),
        admin_password: createDraft.admin_password,
        admin_first_name: createDraft.admin_first_name.trim(),
        admin_last_name: createDraft.admin_last_name.trim() || undefined,
        admin_email: createDraft.admin_email.trim() || undefined,
        admin_phone: createDraft.admin_phone.trim() || undefined,
        plan_code: createDraft.plan_code,
        preset_code: createDraft.preset_code,
      });

      await loadMatrix();
      setCreateDraft(prev => ({
        ...prev,
        tax_id: '',
        legal_name: '',
        trade_name: '',
        email: '',
        phone: '',
        address: '',
        admin_username: '',
        admin_password: '',
        admin_first_name: '',
        admin_last_name: '',
        admin_email: '',
        admin_phone: '',
      }));
      setAdminUsernameTouched(false);
      setMessage(`Empresa creada (ID ${result.company_id}) con admin inicial.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo crear la empresa');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  const totalCompanies  = matrix?.companies.length ?? 0;
  const activeCompanies = matrix?.companies.filter(c => c.active_vertical_code).length ?? 0;
  const totalVerticals  = matrix?.verticals.length ?? 0;
  const pendingCompanies = totalCompanies - activeCompanies;
  const filteredCount = filteredCompanies.length;
  const totalCompanyPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const paginatedCompanies = useMemo(() => {
    const start = (currentCompanyPage - 1) * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [currentCompanyPage, filteredCompanies]);
  const detailCompany = useMemo(
    () => (matrix?.companies ?? []).find((company) => company.company_id === detailCompanyId) ?? null,
    [detailCompanyId, matrix?.companies]
  );

  function highlightMatch(text: string | null | undefined) {
    const value = text ?? '—';
    const query = debouncedSearchText.trim();
    if (!query) return <>{value}</>;
    const lower = value.toLowerCase();
    const queryLower = query.toLowerCase();
    const index = lower.indexOf(queryLower);
    if (index === -1) return <>{value}</>;

    const before = value.slice(0, index);
    const match = value.slice(index, index + query.length);
    const after = value.slice(index + query.length);
    return (
      <>
        {before}
        <mark className="adm-mark">{match}</mark>
        {after}
      </>
    );
  }

  const panelMeta: Record<AdminPanelKey, { title: string; subtitle: string }> = {
    companies: {
      title: 'Empresas y accesos',
      subtitle: 'Alta, activación, rubros y credenciales desde una sola vista operativa.',
    },
    operational: {
      title: 'Capacidad operativa',
      subtitle: 'Define límites de sucursales, almacenes y cajas según demanda de cada cliente.',
    },
    rate: {
      title: 'Rate limits',
      subtitle: 'Controla la carga y aísla impacto por empresa para mantener estabilidad.',
    },
    commerce: {
      title: 'Funcionalidades comerciales',
      subtitle: 'Activa o pausa módulos de ventas y compras por compañía.',
    },
    inventory: {
      title: 'Inventario avanzado',
      subtitle: 'Ajusta complejidad, lotes, vencimientos y reglas de stock por empresa.',
    },
  };

  return (
    <>
      <div className="adm-page-header">
        <h2>Control de Empresas</h2>
        <p>Administración centralizada de rubros, límites, reglas comerciales e inventario por empresa.</p>
      </div>

      <div className="adm-workspace-hero">
        <div>
          <div className="adm-workspace-kicker">Centro de operación</div>
          <h3>{panelMeta[activePanel].title}</h3>
          <p>{panelMeta[activePanel].subtitle}</p>
        </div>
        <div className="adm-workspace-actions">
          <button className="adm-btn adm-btn-secondary" type="button" onClick={() => void loadMatrix()} disabled={loading}>
            Refrescar datos
          </button>
          <span className="adm-badge adm-badge-blue">Panel activo: {panelMeta[activePanel].title}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="adm-stats-row">
        <div className="adm-stat-card accent">
          <div className="adm-stat-label">Total empresas</div>
          <div className="adm-stat-value">{totalCompanies}</div>
          <div className="adm-stat-sub">registradas en el sistema</div>
        </div>
        <div className="adm-stat-card ok">
          <div className="adm-stat-label">Con rubro activo</div>
          <div className="adm-stat-value">{activeCompanies}</div>
          <div className="adm-stat-sub">empresas configuradas</div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-label">Rubros disponibles</div>
          <div className="adm-stat-value">{totalVerticals}</div>
          <div className="adm-stat-sub">en el catálogo</div>
        </div>
        <div className="adm-stat-card warn">
          <div className="adm-stat-label">Sin rubro</div>
          <div className="adm-stat-value">{totalCompanies - activeCompanies}</div>
          <div className="adm-stat-sub">pendientes de configurar</div>
        </div>
      </div>

      <div className="adm-panel-nav" role="tablist" aria-label="Paneles administrativos">
        <button type="button" role="tab" aria-selected={activePanel === 'companies'} className={`adm-panel-tab${activePanel === 'companies' ? ' is-active' : ''}`} onClick={() => setActivePanel('companies')}>Empresas</button>
        <button type="button" role="tab" aria-selected={activePanel === 'operational'} className={`adm-panel-tab${activePanel === 'operational' ? ' is-active' : ''}`} onClick={() => setActivePanel('operational')}>Límites operativos</button>
        <button type="button" role="tab" aria-selected={activePanel === 'rate'} className={`adm-panel-tab${activePanel === 'rate' ? ' is-active' : ''}`} onClick={() => setActivePanel('rate')}>Rate limits</button>
        <button type="button" role="tab" aria-selected={activePanel === 'commerce'} className={`adm-panel-tab${activePanel === 'commerce' ? ' is-active' : ''}`} onClick={() => setActivePanel('commerce')}>Funcionalidades</button>
        <button type="button" role="tab" aria-selected={activePanel === 'inventory'} className={`adm-panel-tab${activePanel === 'inventory' ? ' is-active' : ''}`} onClick={() => setActivePanel('inventory')}>Inventario</button>
      </div>

      <div className="adm-kpi-strip">
        <div className="adm-kpi-chip">
          <span className="adm-kpi-chip__label">Empresas filtradas</span>
          <strong>{filteredCount}</strong>
        </div>
        <div className="adm-kpi-chip">
          <span className="adm-kpi-chip__label">Pendientes por rubro</span>
          <strong>{pendingCompanies}</strong>
        </div>
        <div className="adm-kpi-chip">
          <span className="adm-kpi-chip__label">Estado</span>
          <strong>{loading ? 'Sincronizando...' : 'Actualizado'}</strong>
        </div>
      </div>

      {message && (
        <div className={`adm-notice ${isError ? 'adm-notice-err' : 'adm-notice-ok'}`}>
          {message}
        </div>
      )}

      {activePanel === 'companies' && (
      <div className="adm-wizard-card">
        {/* Wizard header */}
        <div className="adm-wizard-header">
          <div className="adm-wizard-title">
            <div className="adm-wizard-icon">&#xFF0B;</div>
            <div>
              <div className="adm-wizard-label">Nueva empresa</div>
              <div className="adm-wizard-sub">Completa los 3 pasos. Todo se crea en una sola operación.</div>
            </div>
          </div>
          <div className="adm-wizard-stepper">
            {([1, 2, 3] as const).map(n => (
              <button
                key={n}
                type="button"
                className={`adm-wizard-step${createStep === n ? ' is-active' : ''}${createStep > n ? ' is-done' : ''}`}
                onClick={() => setCreateStep(n)}
                disabled={loading}
              >
                <span className="adm-wizard-step__num">{createStep > n ? '✓' : n}</span>
                <span className="adm-wizard-step__label">
                  {n === 1 ? 'Empresa' : n === 2 ? 'Estructura' : 'Administrador'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="adm-wizard-body">
          {/* PASO 1 — Datos empresa */}
          {createStep === 1 && (
            <div className="adm-wizard-step-pane">
              <p className="adm-wizard-step-desc">Datos tributarios y de contacto de la empresa cliente.</p>
              <div className="adm-wizard-fields">
                <div className="adm-field-group adm-field-group--required">
                  <label>RUC</label>
                  <input className="adm-input" placeholder="Ej: 20123456789" maxLength={11} value={createDraft.tax_id} onChange={e => setCreateDraft(prev => ({ ...prev, tax_id: e.target.value }))} />
                </div>
                <div className="adm-field-group adm-field-group--required">
                  <label>Razón social</label>
                  <input className="adm-input" placeholder="Nombre legal registrado en SUNAT" value={createDraft.legal_name} onChange={e => setCreateDraft(prev => ({ ...prev, legal_name: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Nombre comercial</label>
                  <input className="adm-input" placeholder="Nombre que usa en el mercado" value={createDraft.trade_name} onChange={e => setCreateDraft(prev => ({ ...prev, trade_name: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Email empresa</label>
                  <input className="adm-input" type="email" placeholder="empresa@ejemplo.com" value={createDraft.email} onChange={e => setCreateDraft(prev => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Teléfono</label>
                  <input className="adm-input" placeholder="+51 ..." value={createDraft.phone} onChange={e => setCreateDraft(prev => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="adm-field-group adm-field-group--wide">
                  <label>Dirección fiscal</label>
                  <input className="adm-input" placeholder="Av. / Jr. / Calle y número" value={createDraft.address} onChange={e => setCreateDraft(prev => ({ ...prev, address: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2 — Estructura y plan */}
          {createStep === 2 && (
            <div className="adm-wizard-step-pane">
              <p className="adm-wizard-step-desc">Define el rubro, plan y estructura operativa inicial (sucursal, almacén, caja).</p>
              <div className="adm-wizard-fields">
                <div className="adm-field-group">
                  <label>Rubro</label>
                  <select className="adm-select" value={createDraft.vertical_code} onChange={e => setCreateDraft(prev => ({ ...prev, vertical_code: e.target.value }))}>
                    <option value="">Rubro por defecto</option>
                    {matrix?.verticals.map(v => <option key={`new-${v.code}`} value={v.code}>{v.name} ({v.code})</option>)}
                  </select>
                </div>
                <div className="adm-field-group">
                  <label>Plan</label>
                  <select className="adm-select" value={createDraft.plan_code} onChange={e => setCreateDraft(prev => ({ ...prev, plan_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM' }))}>
                    <option value="BASIC">BASIC</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>
                <div className="adm-field-group">
                  <label>Preset de límites</label>
                  <select className="adm-select" value={createDraft.preset_code} onChange={e => setCreateDraft(prev => ({ ...prev, preset_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' }))}>
                    <option value="BASIC">BASIC</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>

                <div className="adm-wizard-divider">Sucursal principal</div>
                <div className="adm-field-group">
                  <label>Código sucursal</label>
                  <input className="adm-input" placeholder="001" value={createDraft.main_branch_code} onChange={e => setCreateDraft(prev => ({ ...prev, main_branch_code: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Nombre sucursal</label>
                  <input className="adm-input" placeholder="Sucursal Principal" value={createDraft.main_branch_name} onChange={e => setCreateDraft(prev => ({ ...prev, main_branch_name: e.target.value }))} />
                </div>

                <div className="adm-wizard-divider">Almacén y caja</div>
                <div className="adm-field-group">
                  <label>Almacén inicial</label>
                  <select className="adm-select" value={createDraft.create_default_warehouse ? '1' : '0'} onChange={e => setCreateDraft(prev => ({ ...prev, create_default_warehouse: e.target.value === '1' }))}>
                    <option value="1">Crear almacén inicial</option>
                    <option value="0">No crear</option>
                  </select>
                </div>
                <div className="adm-field-group">
                  <label>Código almacén</label>
                  <input className="adm-input" placeholder="ALM-001" value={createDraft.default_warehouse_code} onChange={e => setCreateDraft(prev => ({ ...prev, default_warehouse_code: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Nombre almacén</label>
                  <input className="adm-input" placeholder="Almacén Principal" value={createDraft.default_warehouse_name} onChange={e => setCreateDraft(prev => ({ ...prev, default_warehouse_name: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Caja inicial</label>
                  <select className="adm-select" value={createDraft.create_default_cash_register ? '1' : '0'} onChange={e => setCreateDraft(prev => ({ ...prev, create_default_cash_register: e.target.value === '1' }))}>
                    <option value="1">Crear caja inicial</option>
                    <option value="0">No crear</option>
                  </select>
                </div>
                <div className="adm-field-group">
                  <label>Código caja</label>
                  <input className="adm-input" placeholder="CAJA-001" value={createDraft.default_cash_register_code} onChange={e => setCreateDraft(prev => ({ ...prev, default_cash_register_code: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Nombre caja</label>
                  <input className="adm-input" placeholder="Caja Principal" value={createDraft.default_cash_register_name} onChange={e => setCreateDraft(prev => ({ ...prev, default_cash_register_name: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* PASO 3 — Administrador */}
          {createStep === 3 && (
            <div className="adm-wizard-step-pane">
              <p className="adm-wizard-step-desc">Crea el usuario administrador que gestionará esta empresa desde el sistema.</p>
              <div className="adm-wizard-fields">
                <div className="adm-field-group adm-field-group--required">
                  <label>Usuario</label>
                  <input
                    className="adm-input"
                    placeholder="admin_20123456789"
                    value={createDraft.admin_username}
                    onChange={e => {
                      setAdminUsernameTouched(true);
                      setCreateDraft(prev => ({ ...prev, admin_username: e.target.value }));
                    }}
                  />
                  <small className="adm-field-help">Sugerido: admin_RUC (puedes cambiarlo manualmente).</small>
                </div>
                <div className="adm-field-group adm-field-group--required">
                  <label>Contraseña inicial</label>
                  <input className="adm-input" type="password" placeholder="Mínimo 8 caracteres" value={createDraft.admin_password} onChange={e => setCreateDraft(prev => ({ ...prev, admin_password: e.target.value }))} />
                </div>
                <div className="adm-field-group adm-field-group--required">
                  <label>Nombre</label>
                  <input className="adm-input" placeholder="Nombre del admin" value={createDraft.admin_first_name} onChange={e => setCreateDraft(prev => ({ ...prev, admin_first_name: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Apellido</label>
                  <input className="adm-input" placeholder="Apellido" value={createDraft.admin_last_name} onChange={e => setCreateDraft(prev => ({ ...prev, admin_last_name: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Email admin</label>
                  <input className="adm-input" type="email" placeholder="admin@empresa.com" value={createDraft.admin_email} onChange={e => setCreateDraft(prev => ({ ...prev, admin_email: e.target.value }))} />
                </div>
                <div className="adm-field-group">
                  <label>Teléfono admin</label>
                  <input className="adm-input" placeholder="+51 ..." value={createDraft.admin_phone} onChange={e => setCreateDraft(prev => ({ ...prev, admin_phone: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="adm-wizard-footer">
          {createStep > 1 && (
            <button className="adm-btn adm-btn-secondary" type="button" disabled={loading} onClick={() => setCreateStep((prev) => (prev - 1) as 1 | 2 | 3)}>
              ← Anterior
            </button>
          )}
          <span style={{ flex: 1 }} />
          {createStep < 3 ? (
            <button className="adm-btn adm-btn-primary" type="button" disabled={loading} onClick={() => setCreateStep((prev) => (prev + 1) as 1 | 2 | 3)}>
              Siguiente →
            </button>
          ) : (
            <button className="adm-btn adm-btn-create" type="button" disabled={loading} onClick={() => void createCompanyFromAdmin()}>
              ✓ Crear empresa
            </button>
          )}
        </div>
      </div>
      )}

      {activePanel === 'companies' && (
      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Empresas registradas</h3>
          <div className="adm-card-header-actions">
            {loading && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Procesando...</span>}
          </div>
        </div>

        <div className="adm-card-body">
          {/* Filtros */}
          <div className="adm-toolbar adm-toolbar-sticky">
            <input
              className="adm-input"
              placeholder="Buscar por empresa o RUC..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select
              className="adm-select"
              value={filterVerticalCode}
              onChange={e => setFilterVerticalCode(e.target.value)}
            >
              <option value="">Todos los rubros</option>
              {matrix?.verticals.map(v => (
                <option key={`filter-${v.code}`} value={v.code}>{v.name} ({v.code})</option>
              ))}
            </select>
            <span className="adm-hint-inline">Tip: aplica filtro antes de ejecutar acciones masivas.</span>
          </div>

          {/* Acción masiva */}
          {matrix && (
            <div className="adm-bulk-bar">
              <span className="adm-bulk-bar-label">Acción masiva</span>
              <select
                className="adm-select"
                value={bulkVerticalCode}
                onChange={e => setBulkVerticalCode(e.target.value)}
                disabled={loading}
              >
                {matrix.verticals.map(v => (
                  <option key={`bulk-${v.code}`} value={v.code}>{v.name} ({v.code})</option>
                ))}
              </select>
              <button
                className="adm-btn adm-btn-success"
                type="button"
                disabled={loading || filteredCompanies.length === 0 || !bulkVerticalCode}
                onClick={() => void toggleBulk(true)}
              >
                ✓ Activar filtradas
              </button>
              <button
                className="adm-btn adm-btn-danger"
                type="button"
                disabled={loading || filteredCompanies.length === 0 || !bulkVerticalCode}
                onClick={() => void toggleBulk(false)}
              >
                ✕ Desactivar filtradas
              </button>
              <span className="adm-bulk-count">
                Mostrando <strong>{paginatedCompanies.length}</strong> de {filteredCompanies.length} filtradas ({totalCompanies} total)
              </span>
            </div>
          )}

          <div className="adm-company-list">
            {!matrix && !loading && (
              <div className="adm-company-empty">Sin datos. Refresca para cargar.</div>
            )}
            {matrix && filteredCompanies.length === 0 && (
              <div className="adm-company-empty">Ninguna empresa coincide con el filtro.</div>
            )}
            {paginatedCompanies.map((company, idx) => {
              const isActive = company.company_status === 1;
              return (
                <button
                  key={company.company_id}
                  type="button"
                  className="adm-company-row"
                  onClick={() => {
                    setDetailTab('general');
                    setDetailCompanyId(company.company_id);
                    setDetailDrawerOpen(true);
                  }}
                >
                  <span className={`adm-row-dot${isActive ? ' adm-row-dot--on' : ' adm-row-dot--off'}`} />
                  <span className="adm-row-num">{(currentCompanyPage - 1) * PAGE_SIZE + idx + 1}</span>
                  <span className="adm-row-main">
                    <span className="adm-row-name">{highlightMatch(company.legal_name)}</span>
                    {company.trade_name && <span className="adm-row-trade">{highlightMatch(company.trade_name)}</span>}
                  </span>
                  <span className="adm-row-ruc">{highlightMatch(company.tax_id)}</span>
                  <span className="adm-row-meta">
                    {company.active_vertical_name
                      ? <span className="adm-badge adm-badge-blue">{company.active_vertical_name}</span>
                      : <span className="adm-badge adm-badge-neutral">Sin rubro</span>
                    }
                  </span>
                  <span className="adm-row-admin">
                    {company.admin_username
                      ? <span className="adm-row-admin-name">{company.admin_username}</span>
                      : <span className="adm-badge adm-badge-neutral">Sin admin</span>
                    }
                  </span>
                  <span className="adm-row-arrow">›</span>
                </button>
              );
            })}
          </div>

          {filteredCompanies.length > PAGE_SIZE && (
            <div className="adm-pagination">
              <button
                className="adm-btn adm-btn-secondary"
                type="button"
                disabled={currentCompanyPage <= 1}
                onClick={() => setCurrentCompanyPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              <span className="adm-pagination__meta">Página {currentCompanyPage} de {totalCompanyPages}</span>
              <button
                className="adm-btn adm-btn-secondary"
                type="button"
                disabled={currentCompanyPage >= totalCompanyPages}
                onClick={() => setCurrentCompanyPage((prev) => Math.min(totalCompanyPages, prev + 1))}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {activePanel === 'operational' && (
      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Límites operativos por empresa</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Defaults mínimos: sucursales 1, almacenes 1, cajas 1, cajas/almacén 1
            </span>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-bulk-bar">
            <span className="adm-bulk-bar-label">Ajuste masivo operativo</span>
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpBranches} onChange={e => setBulkOpBranches(Number(e.target.value || 1))} disabled={loading} title="Sucursales max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpWarehouses} onChange={e => setBulkOpWarehouses(Number(e.target.value || 1))} disabled={loading} title="Almacenes max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpCash} onChange={e => setBulkOpCash(Number(e.target.value || 1))} disabled={loading} title="Cajas max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpCashPerWarehouse} onChange={e => setBulkOpCashPerWarehouse(Number(e.target.value || 1))} disabled={loading} title="Cajas por almacén" />
            <button className="adm-btn adm-btn-primary" type="button" disabled={loading || filteredCompanies.length === 0} onClick={() => void saveOperationalBulk()}>
              Guardar límites operativos filtradas
            </button>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Sucursales max</th>
                  <th>Almacenes max</th>
                  <th>Cajas max</th>
                  <th>Cajas por almacén max</th>
                  <th>Uso actual</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(company => {
                  const opRow = operationalMatrix?.companies.find(r => r.company_id === company.company_id);
                  const draft = opDraftByCompany[company.company_id] ?? {
                    max_branches_enabled: 1,
                    max_warehouses_enabled: 1,
                    max_cash_registers_enabled: 1,
                    max_cash_registers_per_warehouse: 1,
                  };

                  return (
                    <tr key={`op-${company.company_id}`}>
                      <td>
                        <span className="adm-td-label">{company.legal_name}</span>
                        {company.trade_name && <span className="adm-td-sub">{company.trade_name}</span>}
                      </td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_branches_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_branches_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_warehouses_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_warehouses_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_cash_registers_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_cash_registers_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_cash_registers_per_warehouse} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_cash_registers_per_warehouse: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td>
                        <span className="adm-td-sub">S: {opRow?.usage_branches ?? 0} | A: {opRow?.usage_warehouses ?? 0} | C: {opRow?.usage_cash_registers ?? 0}</span>
                      </td>
                      <td>
                        <button className="adm-btn adm-btn-primary" type="button" disabled={loading} onClick={() => void saveOperationalOne(company.company_id)}>
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activePanel === 'rate' && (
      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Límites por empresa (aislamiento de carga)</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {rateMatrix
                ? `Defaults: lectura ${rateMatrix.defaults.requests_per_minute_read}/min, escritura ${rateMatrix.defaults.requests_per_minute_write}/min, reportes ${rateMatrix.defaults.requests_per_minute_reports}/min`
                : 'Cargando defaults...'}
            </span>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-bulk-bar">
            <span className="adm-bulk-bar-label">Ajuste masivo de límites</span>
            <select
              className="adm-select"
              value={bulkPresetCode}
              onChange={e => setBulkPresetCode((e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE'))}
              disabled={loading || !rateMatrix}
              title="Preset de plan"
            >
              {rateMatrix?.presets.map(p => (
                <option key={`preset-${p.code}`} value={p.code}>{p.name}</option>
              ))}
            </select>
            <button
              className="adm-btn adm-btn-secondary"
              type="button"
              disabled={loading || !rateMatrix}
              onClick={applyBulkPreset}
            >
              Aplicar preset
            </button>
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateRead}
              onChange={e => setBulkRateRead(Number(e.target.value || 0))}
              disabled={loading}
              title="Lectura por minuto"
            />
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateWrite}
              onChange={e => setBulkRateWrite(Number(e.target.value || 0))}
              disabled={loading}
              title="Escritura por minuto"
            />
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateReports}
              onChange={e => setBulkRateReports(Number(e.target.value || 0))}
              disabled={loading}
              title="Reportes por minuto"
            />
            <button
              className="adm-btn adm-btn-success"
              type="button"
              disabled={loading || filteredCompanies.length === 0}
              onClick={() => void saveRateBulk(true)}
            >
              Guardar y habilitar filtradas
            </button>
            <button
              className="adm-btn adm-btn-danger"
              type="button"
              disabled={loading || filteredCompanies.length === 0}
              onClick={() => void saveRateBulk(false)}
            >
              Guardar y deshabilitar filtradas
            </button>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>RUC</th>
                  <th>Plan</th>
                  <th>Lectura/min</th>
                  <th>Escritura/min</th>
                  <th>Reportes/min</th>
                  <th>Límite</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(company => {
                  const draft = rateDraftByCompany[company.company_id] ?? {
                    is_enabled: true,
                    requests_per_minute_read: rateMatrix?.defaults.requests_per_minute_read ?? 3600,
                    requests_per_minute_write: rateMatrix?.defaults.requests_per_minute_write ?? 2400,
                    requests_per_minute_reports: rateMatrix?.defaults.requests_per_minute_reports ?? 900,
                    plan_code: 'PRO' as const,
                  };

                  return (
                    <tr key={`rate-${company.company_id}`}>
                      <td>
                        <span className="adm-td-label">{company.legal_name}</span>
                        {company.trade_name && <span className="adm-td-sub">{company.trade_name}</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#475569' }}>{company.tax_id ?? '—'}</td>
                      <td>
                        <select
                          className="adm-select"
                          value={draft.plan_code}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              plan_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM',
                            },
                          }))}
                          disabled={loading}
                        >
                          <option value="BASIC">Basic</option>
                          <option value="PRO">Pro</option>
                          <option value="ENTERPRISE">Enterprise</option>
                          <option value="CUSTOM">Custom</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_read}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_read: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_write}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_write: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_reports}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_reports: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <select
                          className="adm-select"
                          value={draft.is_enabled ? '1' : '0'}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              is_enabled: e.target.value === '1',
                            },
                          }))}
                          disabled={loading}
                        >
                          <option value="1">Habilitado</option>
                          <option value="0">Pausado</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="adm-btn adm-btn-primary"
                          type="button"
                          disabled={loading}
                          onClick={() => void saveRateOne(company.company_id)}
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Commerce features — card-based per-company activation */}
      {activePanel === 'commerce' && (
      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Activación de funcionalidades por empresa</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ventas y compras — configuradas por empresa desde Admin</span>
          </div>
        </div>
        <div className="adm-card-body">
          {/* Company autocomplete selector */}
          <div className="adm-features-company-selector">
            <label>Empresa:</label>
            <div className="adm-autocomplete-wrap" style={{ position: 'relative', flex: '1 1 280px', maxWidth: 480 }}>
              <input
                className="adm-input"
                placeholder="Buscar empresa por nombre o RUC…"
                value={commerceCompanyQuery}
                disabled={loading || !commerceMatrix}
                autoComplete="off"
                onChange={e => {
                  setCommerceCompanyQuery(e.target.value);
                  setCommerceCompanyDropdownOpen(true);
                  if (!e.target.value.trim()) {
                    setSelectedCommerceCompanyId(null);
                  }
                }}
                onFocus={() => setCommerceCompanyDropdownOpen(true)}
                onBlur={() => setTimeout(() => setCommerceCompanyDropdownOpen(false), 150)}
              />
              {commerceCompanyDropdownOpen && commerceMatrix && (() => {
                const q = commerceCompanyQuery.trim().toLowerCase();
                const filtered = q
                  ? commerceMatrix.companies.filter(c =>
                      c.legal_name.toLowerCase().includes(q) ||
                      (c.trade_name ?? '').toLowerCase().includes(q) ||
                      (c.tax_id ?? '').toLowerCase().includes(q)
                    )
                  : commerceMatrix.companies;
                if (filtered.length === 0) return null;
                return (
                  <div className="adm-autocomplete-list">
                    {filtered.slice(0, 20).map(c => (
                      <button
                        key={c.company_id}
                        type="button"
                        className={`adm-autocomplete-item${selectedCommerceCompanyId === c.company_id ? ' adm-autocomplete-item--active' : ''}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setSelectedCommerceCompanyId(c.company_id);
                          setCommerceCompanyQuery(
                            c.legal_name + (c.tax_id ? ` (${c.tax_id})` : '')
                          );
                          setCommerceCompanyDropdownOpen(false);
                        }}
                      >
                        <span className="adm-autocomplete-item__name">{c.legal_name}</span>
                        {c.trade_name && <span className="adm-autocomplete-item__sub">{c.trade_name}</span>}
                        {c.tax_id && <span className="adm-autocomplete-item__ruc">{c.tax_id}</span>}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            {selectedCommerceCompanyId && (
              <button
                className="adm-btn adm-btn-primary"
                type="button"
                disabled={loading}
                onClick={() => void saveCommerceOne(selectedCommerceCompanyId)}
              >
                Guardar cambios
              </button>
            )}
          </div>

          {!selectedCommerceCompanyId && (
            <div className="adm-features-empty">Selecciona una empresa para ver y configurar sus funcionalidades.</div>
          )}

          {selectedCommerceCompanyId && (() => {
            const featureCodes = allCommerceFeatureCodes;
            const companyOriginal = commerceMatrix?.companies.find(c => c.company_id === selectedCommerceCompanyId)?.features;
            const draft = commerceDraftByCompany[selectedCommerceCompanyId]
              ?? normalizeCompanyFeatures(featureCodes, companyOriginal);

            const salesCodes    = featureCodes.filter(c => c.toUpperCase().startsWith('SALES_'));
            const purchasesCodes = featureCodes.filter(c => c.toUpperCase().startsWith('PURCHASES_'));
            const otherCodes    = featureCodes.filter(c => !c.toUpperCase().startsWith('SALES_') && !c.toUpperCase().startsWith('PURCHASES_'));

            const renderSection = (label: string, codes: string[]) => {
              if (codes.length === 0) return null;
              return (
                <div key={label}>
                  <div className="adm-features-section-header">
                    <h4>{label}</h4>
                    <span className="adm-features-section-count">{codes.length} funcionalidades</span>
                  </div>
                  <div className="adm-feature-grid">
                    {codes.map(code => {
                      const enabled = draft[code] ?? false;
                      return (
                        <div
                          key={code}
                          className={`adm-feature-card${enabled ? ' adm-feature-card--on' : ''}`}
                          title={code}
                        >
                          <div className="adm-feature-card__header">
                            <span className="adm-feature-card__name">{featureLabel(code)}</span>
                            <label className="adm-switch">
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={loading}
                                onChange={e => setCommerceDraftByCompany(prev => ({
                                  ...prev,
                                  [selectedCommerceCompanyId]: {
                                    ...(prev[selectedCommerceCompanyId] ?? {}),
                                    [code]: e.target.checked,
                                  },
                                }))}
                              />
                              <span className="adm-switch__slider" />
                            </label>
                          </div>
                          <div className="adm-feature-card__meta">
                            <span className="adm-feature-badge adm-feature-badge--fallback">Fallback empresa/sucursal</span>
                            <span className={`adm-feature-badge${enabled ? ' adm-feature-badge--on' : ''}`}>
                              {enabled ? 'Activo' : 'Inactivo'}
                            </span>
                            <span className="adm-feature-badge adm-feature-badge--admin">Gestionado en Admin por empresa</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            };

            return (
              <>
                {renderSection('VENTAS', salesCodes)}
                {renderSection('COMPRAS', purchasesCodes)}
                {renderSection('OTROS', otherCodes)}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    className="adm-btn adm-btn-primary"
                    type="button"
                    disabled={loading}
                    onClick={() => void saveCommerceOne(selectedCommerceCompanyId)}
                  >
                    Guardar cambios
                  </button>
                  <button
                    className="adm-btn adm-btn-secondary"
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      const original = commerceMatrix?.companies.find(c => c.company_id === selectedCommerceCompanyId)?.features;
                      setCommerceDraftByCompany(prev => ({
                        ...prev,
                        [selectedCommerceCompanyId]: normalizeCompanyFeatures(featureCodes, original),
                      }));
                    }}
                  >
                    Restablecer
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>
      )}

      {/* Inventory settings matrix */}
      {activePanel === 'inventory' && (
      <div className="adm-section">
        <div className="adm-section-header">
          <h3>Configuración de inventario por empresa</h3>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Modo complejidad</th>
                <th>Modo inventario</th>
                <th>Estrategia lotes</th>
                <th>Inv. Pro</th>
                <th>Tracking lotes</th>
                <th>Tracking venc.</th>
                <th>Rep. avanzado</th>
                <th>Dashboard gráf.</th>
                <th>Ubic. control</th>
                <th>Stock neg.</th>
                <th>Exigir lote</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(inventoryMatrix?.companies ?? []).map(company => {
                const s = inventoryDraftByCompany[company.company_id] ?? company.inventory_settings;
                const update = (patch: Partial<InventorySettingsRecord>) =>
                  setInventoryDraftByCompany(prev => ({
                    ...prev,
                    [company.company_id]: { ...(prev[company.company_id] ?? company.inventory_settings), ...patch },
                  }));
                return (
                  <tr key={company.company_id}>
                    <td>
                      <strong>{company.legal_name}</strong>
                      <br />
                      <small>{company.tax_id}</small>
                    </td>
                    <td>
                      <select className="adm-select" value={s.complexity_mode} onChange={e => update({ complexity_mode: e.target.value as InventorySettingsRecord['complexity_mode'] })} disabled={loading}>
                        <option value="BASIC">Básico</option>
                        <option value="ADVANCED">Avanzado</option>
                      </select>
                    </td>
                    <td>
                      <select className="adm-select" value={s.inventory_mode} onChange={e => update({ inventory_mode: e.target.value as InventorySettingsRecord['inventory_mode'] })} disabled={loading}>
                        <option value="KARDEX_SIMPLE">Kardex simple</option>
                        <option value="LOT_TRACKING">Por lotes</option>
                      </select>
                    </td>
                    <td>
                      <select className="adm-select" value={s.lot_outflow_strategy} onChange={e => update({ lot_outflow_strategy: e.target.value as InventorySettingsRecord['lot_outflow_strategy'] })} disabled={loading}>
                        <option value="MANUAL">Manual</option>
                        <option value="FIFO">FIFO</option>
                        <option value="FEFO">FEFO</option>
                      </select>
                    </td>
                    {(['enable_inventory_pro','enable_lot_tracking','enable_expiry_tracking','enable_advanced_reporting','enable_graphical_dashboard','enable_location_control','allow_negative_stock','enforce_lot_for_tracked'] as (keyof InventorySettingsRecord)[]).map(field => (
                      <td key={field} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={s[field] as boolean}
                          onChange={e => update({ [field]: e.target.checked })}
                          disabled={loading}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="adm-btn adm-btn-primary"
                        type="button"
                        disabled={loading}
                        onClick={() => void saveInventoryOne(company.company_id)}
                      >
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      )}

      {detailCompany && detailDrawerOpen && (() => {
        const selected = selectedVerticalByCompany[detailCompany.company_id] ?? detailCompany.active_vertical_code ?? matrix?.verticals[0]?.code ?? '';
        const selectedAssign = detailCompany.assignments.find((assignment) => assignment.vertical_code === selected);
        const isEnabled = Boolean(selectedAssign?.is_enabled);
        const resetPreview = resetPreviewByCompany[detailCompany.company_id];

        const closeDrawer = () => { setDetailDrawerOpen(false); setDetailCompanyId(null); };

        return (
          <div className="adm-drawer-overlay" role="presentation" onClick={closeDrawer}>
            <div className="adm-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="adm-drawer-header">
                <div>
                  <div className="adm-drawer-title">{detailCompany.legal_name}</div>
                  <div className="adm-drawer-sub">{detailCompany.tax_id ?? ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`adm-badge ${detailCompany.company_status === 1 ? 'adm-badge-ok' : 'adm-badge-off'}`}>
                    {detailCompany.company_status === 1 ? 'Activa' : 'Inactiva'}
                  </span>
                  <button type="button" className="adm-btn-close" onClick={closeDrawer} aria-label="Cerrar">×</button>
                </div>
              </div>
              <div className="adm-drawer-body">
                <div className="adm-detail-tabs" role="tablist" aria-label="Detalle empresa">
                  <button type="button" role="tab" aria-selected={detailTab === 'general'} className={`adm-detail-tab${detailTab === 'general' ? ' is-active' : ''}`} onClick={() => setDetailTab('general')}>General</button>
                  <button type="button" role="tab" aria-selected={detailTab === 'access'} className={`adm-detail-tab${detailTab === 'access' ? ' is-active' : ''}`} onClick={() => setDetailTab('access')}>Acceso</button>
                  <button type="button" role="tab" aria-selected={detailTab === 'security'} className={`adm-detail-tab${detailTab === 'security' ? ' is-active' : ''}`} onClick={() => setDetailTab('security')}>Seguridad</button>
                  <button type="button" role="tab" aria-selected={detailTab === 'history'} className={`adm-detail-tab${detailTab === 'history' ? ' is-active' : ''}`} onClick={() => setDetailTab('history')}>Historial</button>
                </div>

                {detailTab === 'general' && (
                  <>
                    <div className="adm-drawer-grid">
                      <div>
                        <span className="adm-drawer-field-label">RUC</span>
                        <div className="adm-drawer-field-value">{detailCompany.tax_id ?? '—'}</div>
                      </div>
                      <div>
                        <span className="adm-drawer-field-label">Administrador</span>
                        {detailCompany.admin_username
                          ? <div className="adm-drawer-field-value">{detailCompany.admin_username}</div>
                          : <span className="adm-badge adm-badge-neutral">Sin admin</span>
                        }
                        {detailCompany.admin_email && <div className="adm-drawer-field-sub">{detailCompany.admin_email}</div>}
                      </div>
                      <div>
                        <span className="adm-drawer-field-label">Rubro activo</span>
                        {detailCompany.active_vertical_name
                          ? <span className="adm-badge adm-badge-blue">{detailCompany.active_vertical_name}</span>
                          : <span className="adm-badge adm-badge-neutral">Sin rubro</span>
                        }
                      </div>
                    </div>

                    <div className="adm-drawer-grid">
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span className="adm-drawer-field-label">Asignar rubro</span>
                        <select
                          className="adm-select"
                          value={selected}
                          onChange={e => setSelectedVerticalByCompany(prev => ({ ...prev, [detailCompany.company_id]: e.target.value }))}
                          disabled={loading}
                        >
                          {matrix?.verticals.map(v => (
                            <option key={`${detailCompany.company_id}-${v.code}`} value={v.code}>
                              {v.name} ({v.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {detailTab === 'access' && (
                  <div className="adm-drawer-grid">
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="adm-drawer-field-label">Link de acceso</span>
                      {detailCompany.access_url ? (
                        <div className="adm-drawer-actions">
                          <a href={detailCompany.access_url} target="_blank" rel="noreferrer" className="adm-link-url adm-link-url-block">
                            {detailCompany.access_url}
                          </a>
                          <button className="adm-btn adm-btn-secondary" type="button" disabled={loading} onClick={() => void copyCompanyAccessLink(detailCompany.company_id)}>
                            Copiar link
                          </button>
                        </div>
                      ) : (
                        <span className="adm-badge adm-badge-neutral">Sin link de acceso</span>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === 'security' && (
                  <div className="adm-drawer-grid">
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="adm-drawer-field-label">Seguridad</span>
                      <div className="adm-drawer-actions">
                        <button
                          className="adm-btn adm-btn-secondary"
                          type="button"
                          disabled={loading || !detailCompany.admin_username}
                          title={detailCompany.admin_username ? 'Generar nueva contraseña para el admin' : 'Esta empresa no tiene admin registrado'}
                          onClick={() => void doResetAdminPassword(detailCompany.company_id, detailCompany.legal_name)}
                        >
                          Reset pass
                        </button>
                        <div className="adm-credential-cell">
                          <span className="adm-badge adm-badge-neutral">Credencial oculta por defecto</span>
                          {resetPreview && (
                            <button
                              className="adm-btn adm-btn-secondary"
                              type="button"
                              disabled={loading}
                              onClick={() => {
                                setResetPasswordCopied(false);
                                setShowResetPassword(false);
                                setResetModal(resetPreview);
                              }}
                            >
                              Ver clave temporal
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'history' && (
                  <div className="adm-drawer-grid">
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="adm-drawer-field-label">Último evento registrado</span>
                      {resetPreview
                        ? <div className="adm-drawer-field-sub">Reset de contraseña temporal en {resetPreview.generatedAtLabel} (Lima).</div>
                        : <div className="adm-drawer-field-sub">Sin eventos recientes en esta sesión.</div>
                      }
                    </div>
                  </div>
                )}

                <div className="adm-drawer-actions">
                  <button className="adm-btn adm-btn-success" type="button" disabled={loading || isEnabled} onClick={() => void toggleOne(detailCompany.company_id, true)}>
                    Activar
                  </button>
                  <button className="adm-btn adm-btn-danger" type="button" disabled={loading || !isEnabled} onClick={() => void toggleOne(detailCompany.company_id, false)}>
                    Desactivar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {resetModal && (
        <div className="adm-cred-modal-overlay" role="presentation" onClick={() => setResetModal(null)}>
          <div className="adm-cred-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="adm-cred-modal-header">
              <h4>Credencial temporal generada</h4>
              <button type="button" className="adm-btn-close" onClick={() => setResetModal(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="adm-cred-modal-body">
              <p className="adm-cred-modal-sub">Comparte esta clave con el cliente y solicita cambio inmediato.</p>
              <div className="adm-cred-row">
                <span className="adm-cred-label">Empresa</span>
                <strong>{resetModal.companyName}</strong>
              </div>
              <div className="adm-cred-row">
                <span className="adm-cred-label">Usuario</span>
                <code>{resetModal.username}</code>
              </div>
              <div className="adm-cred-row">
                <span className="adm-cred-label">Generada en</span>
                <strong>{resetModal.generatedAtLabel} (Lima)</strong>
              </div>
              <div className="adm-cred-row">
                <span className="adm-cred-label">Password</span>
                <div className="adm-cred-password-wrap">
                  <input className="adm-input" readOnly value={showResetPassword ? resetModal.newPassword : '••••••••••••'} />
                  <button type="button" className="adm-btn adm-btn-secondary" onClick={() => setShowResetPassword((prev) => !prev)}>
                    {showResetPassword ? 'Ocultar' : 'Ver'}
                  </button>
                  <button type="button" className="adm-btn adm-btn-primary" onClick={() => void copyResetCredentials(resetModal)}>
                    Copiar
                  </button>
                </div>
              </div>
              {resetPasswordCopied && <div className="adm-copy-ok">Credencial copiada al portapapeles.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
