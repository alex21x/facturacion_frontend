import { useEffect, useMemo, useRef, useState } from 'react';
import { todayLima } from '../../../shared/utils/lima';
import {
  createFunctionalProfile,
  createRole,
  createUser,
  createCashRegister,
  createDocumentKind,
  createPosStation,
  fetchAccessControl,
  fetchCommerceSettings,
  createLot,
  createPaymentMethod,
  createPriceTier,
  createSeries,
  createWarehouse,
  fetchPriceTiers,
  fetchMastersDashboard,
  updateCommerceSettings,
  updateCashRegister,
  updateDocumentKind,
  updateFunctionalProfile,
  updateInventorySettings,
  updatePaymentMethod,
  updatePosStation,
  updatePriceTier,
  updateRole,
  updateSeries,
  updateUser,
  updateUnits,
  updateWarehouse,
} from '../api';
import type {
  AccessFunctionalProfileRow,
  AccessModuleRow,
  AccessRoleRow,
  AccessUserRow,
  CashRegisterRow,
  CommerceFeatureRow,
  DocumentKindRow,
  InventorySettings,
  LotRow,
  MasterOptionsResponse,
  MastersDashboardResponse,
  PaymentMethodRow,
  PosStationRow,
  PriceTierRow,
  SeriesRow,
  UnitRow,
  WarehouseRow,
} from '../types';

type MastersViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  currentUserRoleCode: string | null;
  activeVerticalCode: string | null;
};

type MasterSection = 'warehouse' | 'cash' | 'stations' | 'payment' | 'series' | 'price-tier' | 'lot' | 'units' | 'settings' | 'doc-kinds' | 'commerce' | 'access';

function commerceCategoryKey(row: { feature_category_key?: string | null; feature_code: string }): string {
  const key = String(row.feature_category_key ?? '').trim().toLowerCase();
  if (key !== '') {
    return key;
  }

  const code = String(row.feature_code ?? '').trim().toUpperCase();
  const firstToken = code.split('_')[0]?.toLowerCase() ?? '';
  return firstToken !== '' ? firstToken : 'general';
}

function commerceCategoryLabel(row: { feature_category_label?: string | null; feature_category_key?: string | null; feature_code: string }): string {
  const apiLabel = String(row.feature_category_label ?? '').trim();
  if (apiLabel !== '') {
    return apiLabel;
  }

  return commerceCategoryKey(row)
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function commerceFeatureLabel(row: { feature_code: string; feature_label?: string | null }): string {
  const apiLabel = (row.feature_label ?? '').trim();
  if (apiLabel !== '' && apiLabel.toUpperCase() !== row.feature_code.toUpperCase()) {
    return apiLabel;
  }

  return row.feature_code
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function operationTypesToText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const code = String((item as Record<string, unknown>).code ?? '').trim();
      const name = String((item as Record<string, unknown>).name ?? '').trim();
      if (!code || !name) {
        return '';
      }

      const regime = String((item as Record<string, unknown>).regime ?? '').trim().toUpperCase();
      return regime ? `${code}:${name}:${regime}` : `${code}:${name}`;
    })
    .filter((row) => row !== '')
    .join(' | ');
}

function parseOperationTypesText(value: string): Array<{ code: string; name: string; regime?: string }> {
  return value
    .split('|')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((token) => {
      const [codeRaw, nameRaw = '', regimeRaw = ''] = token.split(':');
      const code = (codeRaw ?? '').trim().toUpperCase();
      const name = nameRaw.trim() || code;
      const regime = regimeRaw.trim().toUpperCase();
      return { code, name, regime: regime || undefined };
    })
    .filter((row) => row.code !== '');
}

function taxTypesToText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const code = String((item as Record<string, unknown>).code ?? '').trim();
      const name = String((item as Record<string, unknown>).name ?? '').trim();
      const rate = String((item as Record<string, unknown>).rate_percent ?? '').trim();
      if (!code || !name) {
        return '';
      }

      return `${code}:${name}:${rate || '0'}`;
    })
    .filter((row) => row !== '')
    .join(' | ');
}

function parseTaxTypesText(value: string): Array<{ code: string; name: string; rate_percent: number }> {
  return value
    .split('|')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((token) => {
      const [codeRaw, nameRaw = '', rateRaw = '0'] = token.split(':');
      return {
        code: (codeRaw ?? '').trim().toUpperCase(),
        name: nameRaw.trim() || (codeRaw ?? '').trim().toUpperCase(),
        rate_percent: Number(rateRaw || 0),
      };
    })
    .filter((row) => row.code !== '');
}

function defaultOperationTypesText(): string {
  return '0101:Venta interna:NONE | 1001:Operación sujeta a detracción:DETRACCION | 2001:Operación sujeta a retención:RETENCION | 3001:Operación sujeta a percepción:PERCEPCION';
}

function defaultTaxTypesText(featureCode: string): string {
  if (featureCode === 'SALES_RETENCION_ENABLED' || featureCode === 'PURCHASES_RETENCION_COMPRADOR_ENABLED' || featureCode === 'PURCHASES_RETENCION_PROVEEDOR_ENABLED') {
    return 'RET_IGV_3:Retención IGV:3';
  }

  if (featureCode === 'SALES_PERCEPCION_ENABLED' || featureCode === 'PURCHASES_PERCEPCION_ENABLED') {
    return 'PERC_IGV_2:Percepción IGV:2';
  }

  return '';
}

function isMasterAdvancedCommerceFeature(featureCode: string): boolean {
  return [
    'SALES_DETRACCION_ENABLED',
    'SALES_RETENCION_ENABLED',
    'SALES_PERCEPCION_ENABLED',
    'PURCHASES_DETRACCION_ENABLED',
    'PURCHASES_RETENCION_COMPRADOR_ENABLED',
    'PURCHASES_RETENCION_PROVEEDOR_ENABLED',
    'PURCHASES_PERCEPCION_ENABLED',
    'INVENTORY_PRODUCT_MASTERS_BY_PROFILE',
    'INVENTORY_PRODUCTS_BY_PROFILE',
  ].includes(String(featureCode ?? '').toUpperCase());
}

export function MastersView({ accessToken, branchId, warehouseId, currentUserRoleCode, activeVerticalCode }: MastersViewProps) {
  const [options, setOptions] = useState<MasterOptionsResponse | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterRow[]>([]);
  const [posStations, setPosStations] = useState<PosStationRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTierRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [inventorySettings, setInventorySettings] = useState<InventorySettings | null>(null);
  const [documentKinds, setDocumentKinds] = useState<DocumentKindRow[]>([]);
  const [commerceFeatures, setCommerceFeatures] = useState<CommerceFeatureRow[]>([]);
  const [accessModules, setAccessModules] = useState<AccessModuleRow[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRoleRow[]>([]);
  const [accessUsers, setAccessUsers] = useState<AccessUserRow[]>([]);
  const [accessFunctionalProfiles, setAccessFunctionalProfiles] = useState<AccessFunctionalProfileRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleEditorName, setRoleEditorName] = useState('');
  const [roleEditorProfile, setRoleEditorProfile] = useState<string>('');
  const [roleEditorPermissions, setRoleEditorPermissions] = useState<AccessRoleRow['permissions']>([]);
  const [stats, setStats] = useState<MastersDashboardResponse['stats'] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<MasterSection>('warehouse');
  const [accessSubTab, setAccessSubTab] = useState<'users' | 'roles' | 'catalog' | 'permissions'>('users');
  const [activeCommerceTab, setActiveCommerceTab] = useState<string>('all');
  const [sectionSearch, setSectionSearch] = useState('');

  const warehouseFormRef = useRef<HTMLFormElement | null>(null);
  const cashFormRef = useRef<HTMLFormElement | null>(null);
  const stationFormRef = useRef<HTMLFormElement | null>(null);
  const paymentFormRef = useRef<HTMLFormElement | null>(null);
  const seriesFormRef = useRef<HTMLFormElement | null>(null);
  const lotFormRef = useRef<HTMLFormElement | null>(null);
  const settingsFormRef = useRef<HTMLFormElement | null>(null);
  const documentKindFormRef = useRef<HTMLFormElement | null>(null);
  const accessRoleFormRef = useRef<HTMLFormElement | null>(null);
  const accessUserFormRef = useRef<HTMLFormElement | null>(null);

  const [warehouseForm, setWarehouseForm] = useState({
    branch_id: branchId,
    code: '',
    name: '',
    address: '',
  });
  const [warehouseEditingId, setWarehouseEditingId] = useState<number | null>(null);

  const [cashForm, setCashForm] = useState({
    branch_id: branchId,
    code: '',
    name: '',
  });

  const [stationForm, setStationForm] = useState({
    cash_register_id: null as number | null,
    code: '',
    name: '',
    device_id: '',
    device_name: '',
  });
  const [stationEditingId, setStationEditingId] = useState<number | null>(null);

  const [paymentForm, setPaymentForm] = useState({
    code: '',
    name: '',
  });

  const [seriesForm, setSeriesForm] = useState({
    branch_id: branchId,
    warehouse_id: warehouseId,
    document_kind: '' as SeriesRow['document_kind'],
    series: '',
    current_number: 0,
  });
  const [seriesEditingId, setSeriesEditingId] = useState<number | null>(null);

  const [priceTierForm, setPriceTierForm] = useState({
    code: '',
    name: '',
    min_qty: 1,
    max_qty: '',
    priority: 1,
  });
  const [priceTierEditingId, setPriceTierEditingId] = useState<number | null>(null);

  const [lotForm, setLotForm] = useState({
    product_id: 0,
    warehouse_id: warehouseId ?? 0,
    lot_code: '',
    expires_at: '',
    unit_cost: 0,
  });

  const [accessRoleForm, setAccessRoleForm] = useState({
    code: '',
    name: '',
    functional_profile: '' as string,
  });
  const [accessRoleEditingId, setAccessRoleEditingId] = useState<number | null>(null);

  const [functionalProfileForm, setFunctionalProfileForm] = useState({
    code: '',
    label: '',
    status: 1,
    sort_order: 100,
  });
  const [functionalProfileEditingCode, setFunctionalProfileEditingCode] = useState<string | null>(null);

  const [newRoleModules, setNewRoleModules] = useState<Record<string, boolean>>({});

  const [accessUserForm, setAccessUserForm] = useState({
    branch_id: branchId,
    preferred_warehouse_id: null as number | null,
    preferred_cash_register_id: null as number | null,
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role_id: 0,
  });
  const [accessUserEditingId, setAccessUserEditingId] = useState<number | null>(null);

  const [documentKindForm, setDocumentKindForm] = useState({
    code: '',
    label: '',
    is_enabled: true,
  });
  const [documentKindEditingId, setDocumentKindEditingId] = useState<number | null>(null);

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

  const filteredPosStations = useMemo(
    () =>
      posStations.filter(
        (row) =>
          includesSearch(row.code)
          || includesSearch(row.name)
          || includesSearch(row.device_id)
          || includesSearch(row.device_name)
          || includesSearch(row.cash_register_name)
      ),
    [posStations, normalizedSearch]
  );

  const filteredPaymentMethods = useMemo(
    () => paymentMethods.filter((row) => includesSearch(row.code) || includesSearch(row.name)),
    [paymentMethods, normalizedSearch]
  );

  const filteredSeriesRows = useMemo(
    () =>
      seriesRows.filter(
        (row) =>
          includesSearch(row.document_kind)
          || includesSearch(documentKindLabel(row.document_kind))
          || includesSearch(row.series)
          || includesSearch(row.current_number)
      ),
    [seriesRows, normalizedSearch]
  );

  const seriesDocumentKindOptions = useMemo(() => {
    return (documentKinds ?? []).map((row) => ({ code: row.code, label: row.label }));
  }, [documentKinds]);

  const defaultSeriesDocumentKind = useMemo(() => {
    return seriesDocumentKindOptions[0]?.code ?? 'RECEIPT';
  }, [seriesDocumentKindOptions]);

  function documentKindLabel(code: string): string {
    const normalized = String(code ?? '').trim().toUpperCase();
    const found = seriesDocumentKindOptions.find((row) => row.code.trim().toUpperCase() === normalized);
    return found?.label ?? code;
  }

  const availableSeriesWarehouses = useMemo(
    () =>
      (options?.warehouses ?? []).filter(
        (row) => seriesForm.branch_id == null || row.branch_id == null || row.branch_id === seriesForm.branch_id
      ),
    [options?.warehouses, seriesForm.branch_id]
  );

  const filteredPriceTiers = useMemo(
    () =>
      priceTiers.filter(
        (row) =>
          includesSearch(row.code)
          || includesSearch(row.name)
          || includesSearch(row.min_qty)
          || includesSearch(row.max_qty)
      ),
    [priceTiers, normalizedSearch]
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

  const filteredCommerceFeatures = useMemo(() => {
    return commerceFeatures.filter((row) => {
      const matchesSearch = includesSearch(row.feature_code) || includesSearch(commerceFeatureLabel(row));
      if (!matchesSearch) {
        return false;
      }
      if (activeCommerceTab === 'all') {
        return true;
      }
      return commerceCategoryKey(row) === activeCommerceTab;
    });
  }, [commerceFeatures, includesSearch, activeCommerceTab]);

  const masterAdvancedCommerceFeatures = useMemo(() => {
    return filteredCommerceFeatures.filter((row) => isMasterAdvancedCommerceFeature(row.feature_code));
  }, [filteredCommerceFeatures]);

  const accessModuleMap = useMemo(
    () => Object.fromEntries(accessModules.map((m) => [m.code, m.name])),
    [accessModules]
  );

  const activeFunctionalProfiles = useMemo(
    () => accessFunctionalProfiles.filter((row) => row.status === 1),
    [accessFunctionalProfiles]
  );

  const functionalProfileLabelMap = useMemo(
    () => Object.fromEntries(accessFunctionalProfiles.map((row) => [row.code, row.label])),
    [accessFunctionalProfiles]
  );

  const accessSummary = useMemo(() => {
    const activeRoles = accessRoles.filter((row) => row.status === 1).length;
    const usersWithoutWarehouse = accessUsers.filter((row) => row.preferred_warehouse_id == null).length;
    const usersWithoutCash = accessUsers.filter((row) => row.preferred_cash_register_id == null).length;

    return {
      activeRoles,
      usersWithoutWarehouse,
      usersWithoutCash,
    };
  }, [accessRoles, accessUsers]);

  const sectionSearchPlaceholder = useMemo(() => {
    switch (activeSection) {
      case 'warehouse':
        return 'Buscar almacen por codigo, nombre o direccion';
      case 'cash':
        return 'Buscar caja por codigo o nombre';
      case 'stations':
        return 'Buscar estacion por codigo, nombre, dispositivo o caja';
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
        return 'Buscar funcion comercial por nombre';
      case 'access':
        return 'Buscar usuario, rol o modulo';
      default:
        return 'Buscar';
    }
  }, [activeSection]);

  const isAdminUser = useMemo(() => {
    const roleCode = (currentUserRoleCode ?? '').trim().toUpperCase();
    return roleCode === 'ADMIN' || roleCode === 'ADMINISTRADOR' || roleCode === 'SUPERADMIN' || roleCode === 'SUPER_ADMIN';
  }, [currentUserRoleCode]);

  const COMMERCE_CATEGORY_TABS = useMemo(() => {
    const categories = new Map<string, string>();
    for (const row of commerceFeatures) {
      const key = commerceCategoryKey(row);
      if (!categories.has(key)) {
        categories.set(key, commerceCategoryLabel(row));
      }
    }

    return [
      { id: 'all', label: 'Todas' },
      ...Array.from(categories.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [commerceFeatures]);

  const canManagePriceTiers = isAdminUser;

  const availableSections = useMemo<MasterSection[]>(() => {
    const sections: MasterSection[] = [
      'warehouse',
      'cash',
      'stations',
      'payment',
      'series',
      'price-tier',
      'lot',
      'settings',
      'units',
      'doc-kinds',
    ];

    if (isAdminUser) {
      sections.push('commerce', 'access');
    }

    return sections;
  }, [isAdminUser]);

  const canCreateInSection =
    activeSection === 'warehouse' ||
    activeSection === 'cash' ||
    activeSection === 'stations' ||
    activeSection === 'payment' ||
    activeSection === 'series' ||
    (activeSection === 'price-tier' && canManagePriceTiers) ||
    activeSection === 'lot' ||
    activeSection === 'doc-kinds';

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
    const dateTag = todayLima();
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

    if (activeSection === 'stations') {
      lines = [
        'codigo,nombre,device_id,device_name,caja,estado',
        ...filteredPosStations.map((row) =>
          [
            toCsvCell(row.code),
            toCsvCell(row.name),
            toCsvCell(row.device_id),
            toCsvCell(row.device_name),
            toCsvCell(`${row.cash_register_code} - ${row.cash_register_name}`),
            toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO'),
          ].join(',')
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
            toCsvCell(documentKindLabel(row.document_kind)),
            toCsvCell(row.series),
            toCsvCell(row.current_number),
            toCsvCell(row.is_enabled ? 'SI' : 'NO'),
          ].join(',')
        ),
      ];
    }

    if (activeSection === 'price-tier') {
      lines = [
        'codigo,nombre,min_qty,max_qty,prioridad,estado',
        ...filteredPriceTiers.map((row) =>
          [
            toCsvCell(row.code),
            toCsvCell(row.name),
            toCsvCell(row.min_qty),
            toCsvCell(row.max_qty ?? ''),
            toCsvCell(row.priority),
            toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO'),
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
        'funcion_comercial,habilitado',
        ...commerceFeatures.map((row) => [toCsvCell(commerceFeatureLabel(row)), toCsvCell(row.is_enabled ? 'SI' : 'NO')].join(',')),
      ];
    }

    if (activeSection === 'access') {
      lines = [
        'username,first_name,last_name,role_code,status',
        ...accessUsers
          .filter((row) => includesSearch(row.username) || includesSearch(row.first_name) || includesSearch(row.role_code))
          .map((row) => [
            toCsvCell(row.username),
            toCsvCell(row.first_name),
            toCsvCell(row.last_name),
            toCsvCell(row.role_code),
            toCsvCell(row.status === 1 ? 'ACTIVO' : 'INACTIVO'),
          ].join(',')),
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

    if (activeSection === 'stations') {
      setStationEditingId(null);
      setStationForm({ cash_register_id: null, code: '', name: '', device_id: '', device_name: '' });
      focusFirstField(stationFormRef);
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
        document_kind: defaultSeriesDocumentKind,
        series: '',
        current_number: 0,
      });
      focusFirstField(seriesFormRef);
      return;
    }

    if (activeSection === 'price-tier') {
      if (!canManagePriceTiers) {
        return;
      }
      setPriceTierForm({ code: '', name: '', min_qty: 1, max_qty: '', priority: 1 });
      setPriceTierEditingId(null);
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

    if (activeSection === 'doc-kinds') {
      setDocumentKindForm({ code: '', label: '', is_enabled: true });
      setDocumentKindEditingId(null);
      focusFirstField(documentKindFormRef);
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

    if (activeSection === 'stations') {
      stationFormRef.current?.requestSubmit();
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

    if (activeSection === 'price-tier') {
      void savePriceTier();
      return;
    }

    if (activeSection === 'lot') {
      lotFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'settings') {
      // Inventory settings are read-only; managed from Admin portal per company
      return;
    }

    if (activeSection === 'units') {
      void saveUnits();
      return;
    }

    if (activeSection === 'doc-kinds') {
      documentKindFormRef.current?.requestSubmit();
      return;
    }

    if (activeSection === 'commerce') {
      void saveCommerceSettings();
      return;
    }

    if (activeSection === 'access') {
      accessRoleFormRef.current?.requestSubmit();
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
  }, [activeSection, canCreateInSection, sectionSearch, inventorySettings, documentKinds, units, commerceFeatures, defaultSeriesDocumentKind]);

  async function loadAll() {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const dashboard = await fetchMastersDashboard(accessToken);
      setOptions(dashboard.options);
      setWarehouses(dashboard.warehouses);
      setCashRegisters(dashboard.cash_registers);
      setPosStations(dashboard.pos_stations ?? []);
      setPaymentMethods(dashboard.payment_methods);
      setSeriesRows(dashboard.series);
      setPriceTiers(dashboard.price_tiers ?? []);
      setLots(dashboard.lots);
      setUnits(dashboard.units);
      setInventorySettings(dashboard.inventory_settings);
      setDocumentKinds(dashboard.document_kinds ?? []);
      setStats(dashboard.stats);

      if (isAdminUser) {
        const [commerce, access] = await Promise.all([
          fetchCommerceSettings(accessToken),
          fetchAccessControl(accessToken),
        ]);

        setCommerceFeatures(commerce.features ?? []);
        setAccessModules(access.modules ?? []);
        setAccessRoles(access.roles ?? []);
        setAccessUsers(access.users ?? []);
        setAccessFunctionalProfiles(access.functional_profiles ?? []);

        const selectedRole =
          access.roles?.find((role) => role.id === selectedRoleId)
          ?? access.roles?.[0]
          ?? null;
        setSelectedRoleId(selectedRole?.id ?? null);
        setRoleEditorName(selectedRole?.name ?? '');
        setRoleEditorProfile(selectedRole?.functional_profile ?? '');
        setRoleEditorPermissions(selectedRole?.permissions ?? []);

        const defaultFunctionalProfile = (access.functional_profiles ?? []).find((row) => row.status === 1)?.code ?? '';
        setAccessRoleForm((prev) => ({
          ...prev,
          functional_profile: prev.functional_profile || defaultFunctionalProfile,
        }));

        setAccessUserForm((prev) => ({
          ...prev,
          role_id: prev.role_id || (access.roles?.[0]?.id ?? 0),
        }));
      } else {
        setCommerceFeatures([]);
        setAccessModules([]);
        setAccessRoles([]);
        setAccessUsers([]);
        setAccessFunctionalProfiles([]);
        setSelectedRoleId(null);
        setRoleEditorName('');
        setRoleEditorProfile('');
        setRoleEditorPermissions([]);
      }

      if (!dashboard.price_tiers) {
        const standalonePriceTiers = await fetchPriceTiers(accessToken);
        setPriceTiers(standalonePriceTiers);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cargar maestros');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAdminUser]);

  useEffect(() => {
    setWarehouseForm((prev) => ({ ...prev, branch_id: branchId }));
    setCashForm((prev) => ({ ...prev, branch_id: branchId }));
    setSeriesForm((prev) => (seriesEditingId === null ? { ...prev, branch_id: branchId, warehouse_id: warehouseId } : prev));
    setLotForm((prev) => ({ ...prev, warehouse_id: warehouseId ?? prev.warehouse_id }));
    setAccessUserForm((prev) => ({ ...prev, branch_id: branchId }));
  }, [branchId, warehouseId, seriesEditingId]);

  useEffect(() => {
    if (seriesEditingId !== null) {
      return;
    }

    setSeriesForm((prev) => {
      const hasCurrent = seriesDocumentKindOptions.some((row) => row.code === prev.document_kind);
      if (hasCurrent) {
        return prev;
      }

      return {
        ...prev,
        document_kind: defaultSeriesDocumentKind,
      };
    });
  }, [seriesDocumentKindOptions, defaultSeriesDocumentKind, seriesEditingId]);

  useEffect(() => {
    setSectionSearch('');
  }, [activeSection]);

  useEffect(() => {
    if (!availableSections.includes(activeSection)) {
      setActiveSection(availableSections[0] ?? 'warehouse');
    }
  }, [activeSection, availableSections]);

  async function saveWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (warehouseEditingId) {
        await updateWarehouse(accessToken, warehouseEditingId, warehouseForm);
        setMessage('Almacen actualizado.');
      } else {
        await createWarehouse(accessToken, warehouseForm);
        setMessage('Almacen creado.');
      }
      setWarehouseEditingId(null);
      setWarehouseForm({ branch_id: branchId, code: '', name: '', address: '' });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear almacen');
    }
  }

  function editWarehouse(row: WarehouseRow) {
    setWarehouseEditingId(row.id);
    setWarehouseForm({
      branch_id: row.branch_id,
      code: row.code,
      name: row.name,
      address: row.address ?? '',
    });
    setMessage(`Editando almacen ${row.code}.`);
    setError('');
    focusFirstField(warehouseFormRef);
  }

  function cancelWarehouseEdit() {
    setWarehouseEditingId(null);
    setWarehouseForm({ branch_id: branchId, code: '', name: '', address: '' });
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

  async function saveStation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = {
        cash_register_id: Number(stationForm.cash_register_id),
        code: stationForm.code,
        name: stationForm.name,
        device_id: stationForm.device_id,
        device_name: stationForm.device_name || null,
      };

      if (stationEditingId) {
        await updatePosStation(accessToken, stationEditingId, payload);
        setMessage('Estacion POS actualizada.');
      } else {
        await createPosStation(accessToken, payload);
        setMessage('Estacion POS creada.');
      }

      setStationEditingId(null);
      setStationForm({ cash_register_id: null, code: '', name: '', device_id: '', device_name: '' });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar estacion POS');
    }
  }

  function editStation(row: PosStationRow) {
    setStationEditingId(row.id);
    setStationForm({
      cash_register_id: row.cash_register_id,
      code: row.code,
      name: row.name,
      device_id: row.device_id,
      device_name: row.device_name ?? '',
    });
    setMessage(`Editando estacion ${row.code}.`);
    setError('');
    focusFirstField(stationFormRef);
  }

  function cancelStationEdit() {
    setStationEditingId(null);
    setStationForm({ cash_register_id: null, code: '', name: '', device_id: '', device_name: '' });
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
      if (seriesEditingId) {
        await updateSeries(accessToken, seriesEditingId, seriesForm);
        setMessage('Serie actualizada.');
      } else {
        await createSeries(accessToken, seriesForm);
        setMessage('Serie creada.');
      }
      setSeriesEditingId(null);
      setSeriesForm({
        branch_id: branchId,
        warehouse_id: warehouseId,
        document_kind: defaultSeriesDocumentKind,
        series: '',
        current_number: 0,
      });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar serie');
    }
  }

  function editSeries(row: SeriesRow) {
    setSeriesEditingId(row.id);
    setSeriesForm({
      branch_id: row.branch_id,
      warehouse_id: row.warehouse_id,
      document_kind: row.document_kind,
      series: row.series,
      current_number: Number(row.current_number) || 0,
    });
    setMessage(`Editando serie ${row.series}.`);
    setError('');
  }

  function cancelSeriesEdit() {
    setSeriesEditingId(null);
    setSeriesForm({
      branch_id: branchId,
      warehouse_id: warehouseId,
      document_kind: defaultSeriesDocumentKind,
      series: '',
      current_number: 0,
    });
  }

  async function savePriceTier() {
    if (!canManagePriceTiers) {
      setError('No tienes permiso para gestionar escalas de precio.');
      return;
    }

    try {
      if (priceTierEditingId) {
        await updatePriceTier(accessToken, priceTierEditingId, {
          code: priceTierForm.code,
          name: priceTierForm.name,
          min_qty: Number(priceTierForm.min_qty),
          max_qty: priceTierForm.max_qty === '' ? null : Number(priceTierForm.max_qty),
          priority: Number(priceTierForm.priority) || 1,
        });
        setMessage('Escala de precio actualizada.');
      } else {
        await createPriceTier(accessToken, {
          code: priceTierForm.code,
          name: priceTierForm.name,
          min_qty: Number(priceTierForm.min_qty),
          max_qty: priceTierForm.max_qty === '' ? null : Number(priceTierForm.max_qty),
          priority: Number(priceTierForm.priority) || 1,
          status: 1,
        });
        setMessage('Escala de precio creada.');
      }
      setPriceTierForm({ code: '', name: '', min_qty: 1, max_qty: '', priority: 1 });
      setPriceTierEditingId(null);
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar escala de precio');
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

  async function toggleStation(row: PosStationRow) {
    try {
      await updatePosStation(accessToken, row.id, { status: row.status === 1 ? 0 : 1 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar estacion POS');
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

  async function togglePriceTier(row: PriceTierRow) {
    if (!canManagePriceTiers) {
      setError('No tienes permiso para gestionar escalas de precio.');
      return;
    }

    try {
      await updatePriceTier(accessToken, row.id, { status: row.status === 1 ? 0 : 1 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar escala de precio');
    }
  }

  function editPriceTier(row: PriceTierRow) {
    if (!canManagePriceTiers) {
      setError('No tienes permiso para gestionar escalas de precio.');
      return;
    }

    setPriceTierEditingId(row.id);
    setPriceTierForm({
      code: row.code,
      name: row.name,
      min_qty: Number(row.min_qty),
      max_qty: row.max_qty === null ? '' : String(row.max_qty),
      priority: Number(row.priority) || 1,
    });
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

  async function saveDocumentKind(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (documentKindEditingId) {
        await updateDocumentKind(accessToken, documentKindEditingId, {
          code: documentKindForm.code.trim().toUpperCase(),
          label: documentKindForm.label.trim(),
          is_enabled: documentKindForm.is_enabled,
        });
        setMessage('Tipo de comprobante actualizado.');
      } else {
        await createDocumentKind(accessToken, {
          code: documentKindForm.code.trim().toUpperCase(),
          label: documentKindForm.label.trim(),
          is_enabled: documentKindForm.is_enabled,
        });
        setMessage('Tipo de comprobante creado.');
      }
      setDocumentKindEditingId(null);
      setDocumentKindForm({ code: '', label: '', is_enabled: true });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear tipo de comprobante');
    }
  }

  function editDocumentKind(row: DocumentKindRow) {
    setDocumentKindEditingId(row.id);
    setDocumentKindForm({
      code: row.code,
      label: row.label,
      is_enabled: row.is_enabled,
    });
    setMessage(`Editando tipo de comprobante ${row.code}.`);
    setError('');
  }

  async function toggleDocumentKind(row: DocumentKindRow) {
    try {
      await updateDocumentKind(accessToken, row.id, {
        is_enabled: !row.is_enabled,
      });
      setMessage('Estado de tipo de comprobante actualizado.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar tipo de comprobante');
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

  async function saveAccessRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (accessRoleEditingId) {
        await updateRole(accessToken, accessRoleEditingId, {
          name: accessRoleForm.name,
          functional_profile: accessRoleForm.functional_profile || null,
        });
        setMessage('Perfil actualizado correctamente.');
      } else {
        const permissions = accessModules.map((module) => {
          const enabled = newRoleModules[module.code] ?? false;
          return {
            module_code: module.code,
            can_view: enabled,
            can_create: enabled,
            can_update: false,
            can_delete: false,
            can_export: enabled,
            can_approve: false,
          };
        });

        await createRole(accessToken, {
          code: accessRoleForm.code,
          name: accessRoleForm.name,
          functional_profile: accessRoleForm.functional_profile || null,
          permissions,
        });
        setMessage('Perfil creado. Puedes asignarlo al crear usuarios.');
      }

      setAccessRoleEditingId(null);
      setAccessRoleForm({
        code: '',
        name: '',
        functional_profile: activeFunctionalProfiles[0]?.code ?? '',
      });
      setNewRoleModules({});
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : accessRoleEditingId ? 'No se pudo actualizar perfil' : 'No se pudo crear perfil');
    }
  }

  function startAccessRoleEdit(row: AccessRoleRow) {
    setAccessRoleEditingId(row.id);
    setAccessRoleForm({
      code: row.code,
      name: row.name,
      functional_profile: row.functional_profile ?? '',
    });
    setNewRoleModules(
      Object.fromEntries(
        row.permissions.map((item) => [
          item.module_code,
          item.can_view || item.can_create || item.can_update || item.can_delete || item.can_export || item.can_approve,
        ])
      )
    );
    accessRoleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAccessRoleEditor() {
    setAccessRoleEditingId(null);
    setAccessRoleForm({
      code: '',
      name: '',
      functional_profile: activeFunctionalProfiles[0]?.code ?? '',
    });
    setNewRoleModules({});
  }

  async function toggleAccessRole(row: AccessRoleRow) {
    try {
      await updateRole(accessToken, row.id, {
        status: row.status === 1 ? 0 : 1,
      });
      setMessage('Estado del perfil actualizado.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar estado del perfil');
    }
  }

  async function saveFunctionalProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (functionalProfileEditingCode) {
        await updateFunctionalProfile(accessToken, functionalProfileEditingCode, {
          label: functionalProfileForm.label,
          status: Number(functionalProfileForm.status),
          sort_order: Number(functionalProfileForm.sort_order),
        });
        setMessage('Perfil funcional actualizado.');
      } else {
        await createFunctionalProfile(accessToken, {
          code: functionalProfileForm.code,
          label: functionalProfileForm.label,
          status: Number(functionalProfileForm.status),
          sort_order: Number(functionalProfileForm.sort_order),
        });
        setMessage('Perfil funcional creado.');
      }

      setFunctionalProfileEditingCode(null);
      setFunctionalProfileForm({ code: '', label: '', status: 1, sort_order: 100 });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el perfil funcional');
    }
  }

  function startFunctionalProfileEdit(row: AccessFunctionalProfileRow) {
    setFunctionalProfileEditingCode(row.code);
    setFunctionalProfileForm({
      code: row.code,
      label: row.label,
      status: row.status,
      sort_order: row.sort_order,
    });
  }

  function resetFunctionalProfileEditor() {
    setFunctionalProfileEditingCode(null);
    setFunctionalProfileForm({ code: '', label: '', status: 1, sort_order: 100 });
  }

  async function saveAccessUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (accessUserEditingId) {
        await updateUser(accessToken, accessUserEditingId, {
          branch_id: accessUserForm.branch_id,
          preferred_warehouse_id: accessUserForm.preferred_warehouse_id,
          preferred_cash_register_id: accessUserForm.preferred_cash_register_id,
          first_name: accessUserForm.first_name,
          last_name: accessUserForm.last_name || null,
          email: accessUserForm.email || null,
          phone: accessUserForm.phone || null,
          role_id: Number(accessUserForm.role_id),
          ...(accessUserForm.password.trim() ? { password: accessUserForm.password } : {}),
        });
        setMessage('Usuario actualizado correctamente.');
      } else {
        await createUser(accessToken, {
          branch_id: accessUserForm.branch_id,
          preferred_warehouse_id: accessUserForm.preferred_warehouse_id,
          preferred_cash_register_id: accessUserForm.preferred_cash_register_id,
          username: accessUserForm.username,
          password: accessUserForm.password,
          first_name: accessUserForm.first_name,
          last_name: accessUserForm.last_name || null,
          email: accessUserForm.email || null,
          phone: accessUserForm.phone || null,
          role_id: Number(accessUserForm.role_id),
        });
        setMessage('Usuario creado correctamente.');
      }

      setAccessUserEditingId(null);
      setAccessUserForm({
        branch_id: branchId,
        preferred_warehouse_id: null,
        preferred_cash_register_id: null,
        username: '',
        password: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role_id: 0,
      });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : accessUserEditingId ? 'No se pudo actualizar usuario' : 'No se pudo crear usuario');
    }
  }

  function startAccessUserEdit(row: AccessUserRow) {
    setAccessUserEditingId(row.id);
    setAccessUserForm({
      branch_id: row.branch_id,
      preferred_warehouse_id: row.preferred_warehouse_id ?? null,
      preferred_cash_register_id: row.preferred_cash_register_id ?? null,
      username: row.username,
      password: '',
      first_name: row.first_name,
      last_name: row.last_name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      role_id: row.role_id ?? 0,
    });
    accessUserFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAccessUserEditor() {
    setAccessUserEditingId(null);
    setAccessUserForm({
      branch_id: branchId,
      preferred_warehouse_id: null,
      preferred_cash_register_id: null,
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role_id: 0,
    });
  }

  async function toggleAccessUser(row: AccessUserRow) {
    try {
      await updateUser(accessToken, row.id, {
        status: row.status === 1 ? 0 : 1,
      });
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar usuario');
    }
  }

  function selectRoleForEditing(roleIdValue: number) {
    if (!roleIdValue) {
      setSelectedRoleId(null);
      setRoleEditorName('');
      setRoleEditorProfile('');
      setRoleEditorPermissions([]);
      return;
    }

    const role = accessRoles.find((item) => item.id === roleIdValue) ?? null;
    setSelectedRoleId(roleIdValue);
    setRoleEditorName(role?.name ?? '');
    setRoleEditorProfile(role?.functional_profile ?? '');
    setRoleEditorPermissions(role?.permissions ?? []);
  }

  function updateRolePermission(
    moduleCode: string,
    field: 'can_view' | 'can_create' | 'can_update' | 'can_delete' | 'can_export' | 'can_approve',
    value: boolean
  ) {
    setRoleEditorPermissions((prev) =>
      prev.map((row) => {
        if (row.module_code !== moduleCode) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  async function saveRoleEditor() {
    if (!selectedRoleId) {
      return;
    }

    try {
      await updateRole(accessToken, selectedRoleId, {
        name: roleEditorName,
        functional_profile: roleEditorProfile || null,
        permissions: roleEditorPermissions,
      });
      setMessage('Perfil actualizado correctamente.');
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar el perfil');
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
          <article><span>Estaciones POS</span><strong>{stats.pos_stations_total ?? 0}</strong></article>
          <article><span>Pagos</span><strong>{stats.payment_methods_total}</strong></article>
          <article><span>Series</span><strong>{stats.series_total}</strong></article>
          <article><span>Escalas</span><strong>{stats.price_tiers_total ?? 0}</strong></article>
          <article><span>Lotes</span><strong>{stats.lots_total}</strong></article>
          <article><span>Unidades habilitadas</span><strong>{stats.units_enabled_total}</strong></article>
        </div>
      )}

      <div className="masters-layout">
        <nav className="master-nav">
          <div className="master-nav-group">
            <span className="master-nav-group-label">Operacion</span>
            <button type="button" className={activeSection === 'warehouse' ? 'active' : ''} onClick={() => setActiveSection('warehouse')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6 12 2l8 4-8 4zM4 10l8 4 8-4M4 14l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Almacenes
            </button>
            <button type="button" className={activeSection === 'cash' ? 'active' : ''} onClick={() => setActiveSection('cash')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Cajas
            </button>
            <button type="button" className={activeSection === 'stations' ? 'active' : ''} onClick={() => setActiveSection('stations')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6zM9 9h6M9 13h3M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Estaciones POS
            </button>
            <button type="button" className={activeSection === 'payment' ? 'active' : ''} onClick={() => setActiveSection('payment')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM7 11h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Tipos de Pago
            </button>
          </div>
          <div className="master-nav-group">
            <span className="master-nav-group-label">Documentos</span>
            <button type="button" className={activeSection === 'series' ? 'active' : ''} onClick={() => setActiveSection('series')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM15 3v5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Series
            </button>
            <button type="button" className={activeSection === 'price-tier' ? 'active' : ''} onClick={() => setActiveSection('price-tier')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M6 14h4M10 10h4M14 6h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Escalas de precio
            </button>
            <button type="button" className={activeSection === 'doc-kinds' ? 'active' : ''} onClick={() => setActiveSection('doc-kinds')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M10 6v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Comprobantes
            </button>
          </div>
          <div className="master-nav-group">
            <span className="master-nav-group-label">Inventario</span>
            <button type="button" className={activeSection === 'lot' ? 'active' : ''} onClick={() => setActiveSection('lot')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4l-2 2v8l-3 2-3-2v-8L7 8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Lotes
            </button>
            <button type="button" className={activeSection === 'units' ? 'active' : ''} onClick={() => setActiveSection('units')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 12h16M4 16h16M8 6v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Unidades
            </button>
            <button type="button" className={activeSection === 'settings' ? 'active' : ''} onClick={() => setActiveSection('settings')}>
              <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5zM3 12h2m14 0h2M12 3v2m0 14v2M5.7 5.7l1.4 1.4m9.8 9.8 1.4 1.4M18.3 5.7l-1.4 1.4m-9.8 9.8-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Reglas
            </button>
          </div>
          {isAdminUser && (
            <div className="master-nav-group">
              <span className="master-nav-group-label">Administracion</span>
              <button type="button" className={activeSection === 'commerce' ? 'active' : ''} onClick={() => setActiveSection('commerce')}>
                <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10M7 7h10M7 17h10M4 7h.01M4 12h.01M4 17h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                Funciones
              </button>
              <button type="button" className={activeSection === 'access' ? 'active' : ''} onClick={() => setActiveSection('access')}>
                <svg className="master-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm10 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5 5 0 0 1 8 0M13 20a5 5 0 0 1 8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Usuarios y perfiles
              </button>
            </div>
          )}
        </nav>
        <div className="masters-main">
        <div className="master-nav-mobile-control">
        <label>
          Ir a seccion
          <select value={activeSection} onChange={(e) => setActiveSection(e.target.value as MasterSection)}>
            <option value="warehouse">Almacenes</option>
            <option value="cash">Cajas</option>
            <option value="stations">Estaciones POS</option>
            <option value="payment">Tipos de Pago</option>
            <option value="series">Series</option>
            <option value="price-tier">Escalas de precio</option>
            <option value="lot">Lotes</option>
            <option value="units">Unidades</option>
            <option value="settings">Inventario</option>
            <option value="doc-kinds">Comprobantes</option>
            {isAdminUser && <option value="commerce">Funciones comerciales</option>}
            {isAdminUser && <option value="access">Usuarios y perfiles</option>}
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
            <h4>{warehouseEditingId ? `Editar Almacen #${warehouseEditingId}` : 'Nuevo Almacen'}</h4>
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
            <button className="wide" type="submit">{warehouseEditingId ? 'Guardar cambios' : 'Crear almacen'}</button>
            {warehouseEditingId && (
              <button type="button" onClick={cancelWarehouseEdit}>
                Cancelar edicion
              </button>
            )}
          </form>

          <div className="table-wrap master-card">
            <h4>Almacenes</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Estado</th><th></th><th></th></tr></thead>
              <tbody>
                {filteredWarehouses.map((row) => (
                  <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td><td><button type="button" onClick={() => editWarehouse(row)}>Editar</button></td><td><button type="button" onClick={() => void toggleWarehouse(row)}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredWarehouses.length === 0 && (
                  <tr><td colSpan={5}>Sin resultados para la busqueda actual.</td></tr>
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

      {activeSection === 'stations' && (
        <div className="master-section-grid">
          <form ref={stationFormRef} className="grid-form master-card" onSubmit={saveStation}>
            <h4>{stationEditingId ? 'Editar Estacion POS' : 'Nueva Estacion POS'}</h4>
            <label>
              Caja fija
              <select
                value={stationForm.cash_register_id ?? ''}
                onChange={(e) => setStationForm((prev) => ({ ...prev, cash_register_id: e.target.value ? Number(e.target.value) : null }))}
                required
              >
                <option value="">Seleccionar caja</option>
                {cashRegisters
                  .filter((row) => row.status === 1)
                  .map((row) => (
                    <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                  ))}
              </select>
            </label>
            <label>
              Codigo
              <input value={stationForm.code} onChange={(e) => setStationForm((prev) => ({ ...prev, code: e.target.value }))} required />
            </label>
            <label>
              Nombre
              <input value={stationForm.name} onChange={(e) => setStationForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </label>
            <label>
              Device ID
              <input value={stationForm.device_id} onChange={(e) => setStationForm((prev) => ({ ...prev, device_id: e.target.value }))} required />
            </label>
            <label>
              Nombre del equipo
              <input value={stationForm.device_name} onChange={(e) => setStationForm((prev) => ({ ...prev, device_name: e.target.value }))} />
            </label>
            <p className="notice" style={{ margin: 0 }}>
              Esta estacion vincula el `device_id` del login con una caja fija del POS.
            </p>
            <div className="grid-inline-actions">
              <button className="wide" type="submit">{stationEditingId ? 'Guardar cambios' : 'Crear estacion'}</button>
              {stationEditingId && <button type="button" onClick={cancelStationEdit}>Cancelar</button>}
            </div>
          </form>

          <div className="table-wrap master-card">
            <h4>Estaciones POS</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Dispositivo</th><th>Caja</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredPosStations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>
                      <strong>{row.device_id}</strong>
                      <div>{row.device_name ?? '-'}</div>
                    </td>
                    <td>{row.cash_register_code} - {row.cash_register_name}</td>
                    <td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td>
                    <td>
                      <button type="button" onClick={() => editStation(row)}>Editar</button>
                      <button type="button" onClick={() => void toggleStation(row)}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button>
                    </td>
                  </tr>
                ))}
                {filteredPosStations.length === 0 && (
                  <tr><td colSpan={6}>Sin resultados para la busqueda actual.</td></tr>
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
            <h4>{seriesEditingId ? `Editar Serie #${seriesEditingId}` : 'Nueva Serie'}</h4>
            <label>
              Sucursal
              <select
                value={seriesForm.branch_id ?? ''}
                onChange={(e) =>
                  setSeriesForm((prev) => ({
                    ...prev,
                    branch_id: e.target.value ? Number(e.target.value) : null,
                    warehouse_id: null,
                  }))
                }
              >
                <option value="">Sin sucursal</option>
                {(options?.branches ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Almacen
              <select
                value={seriesForm.warehouse_id ?? ''}
                onChange={(e) => setSeriesForm((prev) => ({ ...prev, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Sin almacen</option>
                {availableSeriesWarehouses.map((row) => (
                  <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo comprobante
              <select
                value={seriesForm.document_kind}
                onChange={(e) =>
                  setSeriesForm((prev) => ({ ...prev, document_kind: e.target.value as SeriesRow['document_kind'] }))
                }
              >
                {seriesDocumentKindOptions.map((row) => (
                  <option key={row.code} value={row.code}>{row.label}</option>
                ))}
              </select>
            </label>
            <label>
              Serie
              <input value={seriesForm.series} onChange={(e) => setSeriesForm((prev) => ({ ...prev, series: e.target.value.toUpperCase() }))} required />
            </label>
            <label>
              Correlativo actual
              <input type="number" min={0} value={seriesForm.current_number} onChange={(e) => setSeriesForm((prev) => ({ ...prev, current_number: Number(e.target.value) }))} />
            </label>
            <button className="wide" type="submit">{seriesEditingId ? 'Guardar cambios' : 'Crear serie'}</button>
            {seriesEditingId && (
              <button type="button" onClick={cancelSeriesEdit}>
                Cancelar edicion
              </button>
            )}
          </form>

          <div className="table-wrap master-card">
            <h4>Series</h4>
            <table>
              <thead><tr><th>Tipo</th><th>Serie</th><th>Correlativo</th><th>Activo</th><th></th><th></th></tr></thead>
              <tbody>
                {filteredSeriesRows.map((row) => (
                  <tr key={row.id}><td>{documentKindLabel(row.document_kind)}</td><td>{row.series}</td><td>{row.current_number}</td><td>{row.is_enabled ? 'SI' : 'NO'}</td><td><button type="button" onClick={() => editSeries(row)}>Editar</button></td><td><button type="button" onClick={() => void toggleSeries(row)}>{row.is_enabled ? 'Desactivar' : 'Activar'}</button></td></tr>
                ))}
                {filteredSeriesRows.length === 0 && (
                  <tr><td colSpan={6}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'price-tier' && (
        <div className="master-section-grid">
          <form className="grid-form master-card" onSubmit={(e) => { e.preventDefault(); void savePriceTier(); }}>
            <h4>{priceTierEditingId ? `Editar Escala #${priceTierEditingId}` : 'Nueva Escala de Precio'}</h4>
            <label>
              Codigo
              <input value={priceTierForm.code} onChange={(e) => setPriceTierForm((prev) => ({ ...prev, code: e.target.value }))} required disabled={!canManagePriceTiers} />
            </label>
            <label>
              Nombre
              <input value={priceTierForm.name} onChange={(e) => setPriceTierForm((prev) => ({ ...prev, name: e.target.value }))} required disabled={!canManagePriceTiers} />
            </label>
            <label>
              Cantidad minima
              <input type="number" min={0.001} step="0.001" value={priceTierForm.min_qty} onChange={(e) => setPriceTierForm((prev) => ({ ...prev, min_qty: Number(e.target.value) || 1 }))} required disabled={!canManagePriceTiers} />
            </label>
            <label>
              Cantidad maxima (opcional)
              <input type="number" min={0.001} step="0.001" value={priceTierForm.max_qty} onChange={(e) => setPriceTierForm((prev) => ({ ...prev, max_qty: e.target.value }))} disabled={!canManagePriceTiers} />
            </label>
            <label>
              Prioridad
              <input type="number" min={1} step={1} value={priceTierForm.priority} onChange={(e) => setPriceTierForm((prev) => ({ ...prev, priority: Number(e.target.value) || 1 }))} disabled={!canManagePriceTiers} />
            </label>
            <button className="wide" type="submit" disabled={!canManagePriceTiers}>{priceTierEditingId ? 'Guardar cambios' : 'Crear escala'}</button>
            {priceTierEditingId && (
              <button type="button" onClick={() => { setPriceTierEditingId(null); setPriceTierForm({ code: '', name: '', min_qty: 1, max_qty: '', priority: 1 }); }} disabled={!canManagePriceTiers}>
                Cancelar edicion
              </button>
            )}
            {!canManagePriceTiers && (
              <p className="notice">Solo un perfil autorizado puede crear o editar escalas.</p>
            )}
          </form>

          <div className="table-wrap master-card">
            <h4>Escalas de Precio</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Rango</th><th>Prioridad</th><th>Estado</th><th></th><th></th></tr></thead>
              <tbody>
                {filteredPriceTiers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{Number(row.min_qty)} - {row.max_qty === null ? '...' : Number(row.max_qty)}</td>
                    <td>{row.priority}</td>
                    <td>{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</td>
                    <td><button type="button" onClick={() => editPriceTier(row)} disabled={!canManagePriceTiers}>Editar</button></td>
                    <td><button type="button" onClick={() => void togglePriceTier(row)} disabled={!canManagePriceTiers}>{row.status === 1 ? 'Desactivar' : 'Activar'}</button></td>
                  </tr>
                ))}
                {filteredPriceTiers.length === 0 && (
                  <tr><td colSpan={7}>Sin resultados para la busqueda actual.</td></tr>
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
          <p className="notice" style={{ marginTop: 0, marginBottom: '10px' }}>
            Esta configuracion se administra desde el portal Admin por empresa. Solo lectura.
          </p>
          <label>
            Perfil de complejidad
            <select value={inventorySettings.complexity_mode} disabled onChange={(e) => setInventorySettings((prev) => {
              if (!prev) return prev;
              const nextMode = e.target.value as InventorySettings['complexity_mode'];
              if (nextMode === 'BASIC') {
                return {
                  ...prev,
                  complexity_mode: 'BASIC',
                  inventory_mode: 'KARDEX_SIMPLE',
                  lot_outflow_strategy: 'MANUAL',
                  enable_inventory_pro: false,
                  enable_lot_tracking: false,
                  enable_expiry_tracking: false,
                  enable_advanced_reporting: false,
                  enable_graphical_dashboard: false,
                  enable_location_control: false,
                  enforce_lot_for_tracked: false,
                };
              }
              return {
                ...prev,
                complexity_mode: 'ADVANCED',
                enable_inventory_pro: true,
                enable_lot_tracking: true,
                enable_advanced_reporting: true,
              };
            })}>
              <option value="BASIC">BASICO</option>
              <option value="ADVANCED">AVANZADO</option>
            </select>
          </label>
          <label>
            Modo inventario
            <select value={inventorySettings.inventory_mode} disabled onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, inventory_mode: e.target.value as InventorySettings['inventory_mode'] } : prev)}>
              <option value="KARDEX_SIMPLE">KARDEX_SIMPLE</option>
              <option value="LOT_TRACKING">LOT_TRACKING</option>
            </select>
          </label>
          <label>
            Estrategia salida lote
            <select value={inventorySettings.lot_outflow_strategy} disabled onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, lot_outflow_strategy: e.target.value as InventorySettings['lot_outflow_strategy'] } : prev)}>
              <option value="MANUAL">MANUAL</option>
              <option value="FIFO">FIFO</option>
              <option value="FEFO">FEFO</option>
            </select>
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_inventory_pro} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enable_inventory_pro: e.target.checked } : prev)} /> Habilitar Inventory Pro
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_lot_tracking} onChange={(e) => setInventorySettings((prev) => prev ? {
              ...prev,
              enable_lot_tracking: e.target.checked,
              inventory_mode: e.target.checked ? prev.inventory_mode : 'KARDEX_SIMPLE',
              enforce_lot_for_tracked: e.target.checked ? prev.enforce_lot_for_tracked : false,
              enable_expiry_tracking: e.target.checked ? prev.enable_expiry_tracking : false,
            } : prev)} /> Habilitar control por lotes
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_expiry_tracking} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enable_expiry_tracking: e.target.checked, enable_lot_tracking: e.target.checked ? true : prev.enable_lot_tracking } : prev)} /> Habilitar control de vencimiento
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_advanced_reporting} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enable_advanced_reporting: e.target.checked, enable_inventory_pro: e.target.checked ? true : prev.enable_inventory_pro } : prev)} /> Habilitar reportes avanzados
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_graphical_dashboard} onChange={(e) => setInventorySettings((prev) => prev ? {
              ...prev,
              enable_graphical_dashboard: e.target.checked,
              enable_inventory_pro: e.target.checked ? true : prev.enable_inventory_pro,
              complexity_mode: e.target.checked ? 'ADVANCED' : prev.complexity_mode,
            } : prev)} /> Habilitar dashboard grafico
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enable_location_control} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enable_location_control: e.target.checked } : prev)} /> Habilitar control por ubicacion
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.allow_negative_stock} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, allow_negative_stock: e.target.checked } : prev)} /> Permitir stock negativo
          </label>
          <label>
            <input type="checkbox" disabled checked={inventorySettings.enforce_lot_for_tracked} onChange={(e) => setInventorySettings((prev) => prev ? { ...prev, enforce_lot_for_tracked: e.target.checked } : prev)} /> Exigir lote para tracking
          </label>
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
        <div className="master-section-grid">
          <form ref={documentKindFormRef} className="grid-form master-card" onSubmit={saveDocumentKind}>
            <h4>{documentKindEditingId ? `Editar Tipo Comprobante #${documentKindEditingId}` : 'Nuevo Tipo de Comprobante'}</h4>
            <label>
              Codigo
              <input
                value={documentKindForm.code}
                onChange={(e) => setDocumentKindForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ej: PROFORMA"
                maxLength={30}
                required
              />
            </label>
            <label>
              Nombre
              <input
                value={documentKindForm.label}
                onChange={(e) => setDocumentKindForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Ej: Proforma"
                maxLength={120}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={documentKindForm.is_enabled}
                onChange={(e) => setDocumentKindForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
              /> Habilitado
            </label>
            <button className="wide" type="submit">{documentKindEditingId ? 'Guardar cambios' : 'Crear tipo comprobante'}</button>
          </form>

          <div className="table-wrap master-card">
            <h4>Tipos de Comprobante</h4>
            <table>
              <thead><tr><th>Codigo</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {filteredDocumentKinds.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td className="master-doc-kind-label">{row.label}</td>
                    <td>{row.is_enabled ? 'ACTIVO' : 'INACTIVO'}</td>
                    <td>
                      <div className="master-row-actions">
                        <button type="button" onClick={() => editDocumentKind(row)}>Editar</button>
                        <button type="button" onClick={() => void toggleDocumentKind(row)}>{row.is_enabled ? 'Desactivar' : 'Activar'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDocumentKinds.length === 0 && (
                  <tr><td colSpan={4}>Sin resultados para la busqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'commerce' && (
        <div className="mfunc-shell">
          <div className="mfunc-header master-card">
            <h4>Funciones comerciales</h4>
            <p className="mfunc-hint">Aquí se administran parámetros avanzados (cuentas y reglas tributarias/perfiles). Los toggles generales se gestionan en Configuración &gt; Comercial.</p>
          </div>

          <div className="mfunc-tabs" role="tablist" aria-label="Categorías de funciones comerciales">
            {COMMERCE_CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`mfunc-tab ${activeCommerceTab === tab.id ? 'is-active' : ''}`}
                onClick={() => setActiveCommerceTab(tab.id)}
                role="tab"
                aria-selected={activeCommerceTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mfunc-group master-card">
            <div className="mfunc-list">
              {masterAdvancedCommerceFeatures.map((row) => {
                const index = commerceFeatures.findIndex((item) => item.feature_code === row.feature_code);
                const profileConfig = (row.feature_code === 'INVENTORY_PRODUCT_MASTERS_BY_PROFILE' || row.feature_code === 'INVENTORY_PRODUCTS_BY_PROFILE')
                  ? {
                      allow_seller: row.config?.allow_seller !== false,
                      allow_cashier: row.config?.allow_cashier !== false,
                      allow_admin: row.config?.allow_admin !== false,
                    }
                  : null;
                const isTaxFeature = row.feature_code === 'SALES_DETRACCION_ENABLED'
                  || row.feature_code === 'SALES_RETENCION_ENABLED'
                  || row.feature_code === 'SALES_PERCEPCION_ENABLED'
                  || row.feature_code === 'PURCHASES_DETRACCION_ENABLED'
                  || row.feature_code === 'PURCHASES_RETENCION_COMPRADOR_ENABLED'
                  || row.feature_code === 'PURCHASES_RETENCION_PROVEEDOR_ENABLED'
                  || row.feature_code === 'PURCHASES_PERCEPCION_ENABLED';
                const isRetencionFeature = row.feature_code === 'SALES_RETENCION_ENABLED'
                  || row.feature_code === 'PURCHASES_RETENCION_COMPRADOR_ENABLED'
                  || row.feature_code === 'PURCHASES_RETENCION_PROVEEDOR_ENABLED';
                const isPercepcionFeature = row.feature_code === 'SALES_PERCEPCION_ENABLED'
                  || row.feature_code === 'PURCHASES_PERCEPCION_ENABLED';
                const taxConfig = isTaxFeature
                  ? {
                      bank_name: String((row.config?.bank_name ?? '') as string),
                      account_number: String((row.config?.account_number ?? '') as string),
                      account_holder: String((row.config?.account_holder ?? '') as string),
                      min_amount: row.feature_code === 'SALES_DETRACCION_ENABLED' || row.feature_code === 'PURCHASES_DETRACCION_ENABLED'
                        ? String((row.config?.min_amount ?? '700') as string)
                        : '',
                      operation_types_text: operationTypesToText(row.config?.sunat_operation_types) || defaultOperationTypesText(),
                      tax_types_text: isRetencionFeature
                        ? (taxTypesToText(row.config?.retencion_types) || defaultTaxTypesText(row.feature_code))
                        : isPercepcionFeature
                          ? (taxTypesToText(row.config?.percepcion_types) || defaultTaxTypesText(row.feature_code))
                          : '',
                    }
                  : null;

                return (
                  <div key={row.feature_code} className="mfunc-item">
                    <div className="mfunc-item-head">
                      <label className="mfunc-toggle">
                        <input
                          type="checkbox"
                          checked={row.is_enabled}
                          onChange={(e) =>
                            setCommerceFeatures((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, is_enabled: e.target.checked } : item))
                            )
                          }
                        />
                        <span className={`mfunc-toggle-chip ${row.is_enabled ? 'is-on' : 'is-off'}`}>{row.is_enabled ? 'ON' : 'OFF'}</span>
                        <span className="mfunc-item-label">{commerceFeatureLabel(row)}</span>
                      </label>
                    </div>

                    {taxConfig && (
                      <details className="mfunc-config-panel">
                        <summary className="mfunc-config-summary">Configurar cuenta y tipos SUNAT</summary>
                        <div className="mfunc-config-body">
                          <label className="mfunc-field">
                            Número de cuenta
                            <input
                              value={taxConfig.account_number}
                              onChange={(e) =>
                                setCommerceFeatures((prev) =>
                                  prev.map((item, i) => i === index
                                    ? { ...item, config: { ...(item.config ?? {}), account_number: e.target.value } }
                                    : item)
                                )
                              }
                              placeholder="Ej. 00-123-456789"
                            />
                          </label>
                          <label className="mfunc-field">
                            Banco
                            <input
                              value={taxConfig.bank_name}
                              onChange={(e) =>
                                setCommerceFeatures((prev) =>
                                  prev.map((item, i) => i === index
                                    ? { ...item, config: { ...(item.config ?? {}), bank_name: e.target.value } }
                                    : item)
                                )
                              }
                              placeholder="Ej. Banco de la Nacion"
                            />
                          </label>
                          <label className="mfunc-field">
                            Titular de cuenta
                            <input
                              value={taxConfig.account_holder}
                              onChange={(e) =>
                                setCommerceFeatures((prev) =>
                                  prev.map((item, i) => i === index
                                    ? { ...item, config: { ...(item.config ?? {}), account_holder: e.target.value } }
                                    : item)
                                )
                              }
                              placeholder="Razón social o nombre"
                            />
                          </label>
                          {(row.feature_code === 'SALES_DETRACCION_ENABLED' || row.feature_code === 'PURCHASES_DETRACCION_ENABLED') && (
                            <label className="mfunc-field">
                              Monto umbral detracción (PEN)
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={taxConfig.min_amount}
                                onChange={(e) =>
                                  setCommerceFeatures((prev) =>
                                    prev.map((item, i) => i === index
                                      ? { ...item, config: { ...(item.config ?? {}), min_amount: Number(e.target.value || 0) } }
                                      : item)
                                  )
                                }
                              />
                            </label>
                          )}
                          <label className="mfunc-field mfunc-field-wide">
                            Tipos de operación SUNAT
                            <small className="mfunc-field-hint">Formato: codigo:nombre:regimen | codigo:nombre:regimen</small>
                            <input
                              value={taxConfig.operation_types_text}
                              onChange={(e) =>
                                setCommerceFeatures((prev) =>
                                  prev.map((item, i) => i === index
                                    ? { ...item, config: { ...(item.config ?? {}), sunat_operation_types: parseOperationTypesText(e.target.value) } }
                                    : item)
                                )
                              }
                              placeholder="0101:Venta interna:NONE | 1001:Operacion sujeta a detraccion:DETRACCION"
                            />
                          </label>
                          {(isRetencionFeature || isPercepcionFeature) && (
                            <label className="mfunc-field mfunc-field-wide">
                              Tipos tributarios
                              <small className="mfunc-field-hint">Formato: codigo:nombre:tasa | codigo:nombre:tasa</small>
                              <input
                                value={taxConfig.tax_types_text}
                                onChange={(e) =>
                                  setCommerceFeatures((prev) =>
                                    prev.map((item, i) => i === index
                                      ? {
                                          ...item,
                                          config: {
                                            ...(item.config ?? {}),
                                            [isRetencionFeature ? 'retencion_types' : 'percepcion_types']: parseTaxTypesText(e.target.value),
                                          },
                                        }
                                      : item)
                                  )
                                }
                                placeholder="RET_IGV_3:Retencion IGV:3 | PERC_IGV_2:Percepcion IGV:2"
                              />
                            </label>
                          )}
                        </div>
                      </details>
                    )}

                    {profileConfig && (
                      <div className="mfunc-profile-group">
                        <span className="mfunc-profile-label">Perfiles con acceso:</span>
                        <label className="mfunc-profile-check">
                          <input
                            type="checkbox"
                            checked={profileConfig.allow_seller}
                            onChange={(e) =>
                              setCommerceFeatures((prev) =>
                                prev.map((item, i) => i === index
                                  ? { ...item, config: { ...(item.config ?? {}), allow_seller: e.target.checked, allow_cashier: (item.config?.allow_cashier ?? true) !== false, allow_admin: (item.config?.allow_admin ?? true) !== false } }
                                  : item)
                              )
                            }
                          />
                          Vendedor
                        </label>
                        <label className="mfunc-profile-check">
                          <input
                            type="checkbox"
                            checked={profileConfig.allow_cashier}
                            onChange={(e) =>
                              setCommerceFeatures((prev) =>
                                prev.map((item, i) => i === index
                                  ? { ...item, config: { ...(item.config ?? {}), allow_seller: (item.config?.allow_seller ?? true) !== false, allow_cashier: e.target.checked, allow_admin: (item.config?.allow_admin ?? true) !== false } }
                                  : item)
                              )
                            }
                          />
                          Cajero
                        </label>
                        <label className="mfunc-profile-check">
                          <input
                            type="checkbox"
                            checked={profileConfig.allow_admin}
                            onChange={(e) =>
                              setCommerceFeatures((prev) =>
                                prev.map((item, i) => i === index
                                  ? { ...item, config: { ...(item.config ?? {}), allow_seller: (item.config?.allow_seller ?? true) !== false, allow_cashier: (item.config?.allow_cashier ?? true) !== false, allow_admin: e.target.checked } }
                                  : item)
                              )
                            }
                          />
                          Admin/General
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}

              {masterAdvancedCommerceFeatures.length === 0 && (
                <p className="mfunc-empty">No hay configuraciones avanzadas en esta pestaña o búsqueda.</p>
              )}
            </div>
          </div>

          <div className="mfunc-footer">
            <button type="button" className="mfunc-save-btn" onClick={() => void saveCommerceSettings()}>Guardar funciones comerciales</button>
          </div>
        </div>
      )}

      {activeSection === 'access' && (
        <div className="master-section-grid access-grid">

          {/* ── Encabezado de sección ── */}
          <div className="access-section-header" style={{ gridColumn: '1 / -1' }}>
            <div className="access-section-title">
              <div className="access-section-icon" aria-hidden="true">AC</div>
              <div>
                <h3>Usuarios y Perfiles de Acceso</h3>
                <p>Administra usuarios, perfiles, permisos por modulo y contexto operativo de trabajo.</p>
              </div>
            </div>
            <div className="access-section-stats">
              <div className="access-stat">
                <strong>{accessUsers.length}</strong>
                Usuarios
              </div>
              <div className="access-stat">
                <strong>{accessSummary.activeRoles}</strong>
                Perfiles activos
              </div>
              <div className="access-stat">
                <strong>{accessSummary.usersWithoutWarehouse}</strong>
                Sin almacen
              </div>
              <div className="access-stat">
                <strong>{accessSummary.usersWithoutCash}</strong>
                Sin caja
              </div>
            </div>
          </div>

          <div className="master-card access-subtabs" style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              className={accessSubTab === 'users' ? 'active' : ''}
              onClick={() => setAccessSubTab('users')}
            >
              Usuarios
            </button>
            <button
              type="button"
              className={accessSubTab === 'roles' ? 'active' : ''}
              onClick={() => setAccessSubTab('roles')}
            >
              Perfiles
            </button>
            <button
              type="button"
              className={accessSubTab === 'catalog' ? 'active' : ''}
              onClick={() => setAccessSubTab('catalog')}
            >
              Catalogo Funcional
            </button>
            <button
              type="button"
              className={accessSubTab === 'permissions' ? 'active' : ''}
              onClick={() => setAccessSubTab('permissions')}
            >
              Permisos
            </button>
          </div>

          <div className="access-tab-content" style={{ gridColumn: '1 / -1' }}>

          {/* ── Formulario: Nuevo Perfil ── */}
          {accessSubTab === 'roles' && (
            <>
          <form ref={accessRoleFormRef} className="grid-form master-card access-form-card role-card access-card-role-form" onSubmit={saveAccessRole}>
            <div className="access-form-subtitle">
              <h4>{accessRoleEditingId ? 'Editar Perfil' : 'Nuevo Perfil'}</h4>
              <span className="afs-badge">Rol</span>
            </div>
            <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
              El perfil funcional ahora sale de un catalogo configurable por empresa. Puedes administrarlo en la tarjeta de catalogo funcional de esta misma vista.
            </p>

            <span className="access-group-label">Identificación</span>
            <label>
              Código
              <input
                value={accessRoleForm.code}
                onChange={(e) => setAccessRoleForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ej. VENDEDOR_EVENTO"
                required
                disabled={accessRoleEditingId !== null}
              />
            </label>
            <label>
              Nombre del perfil
              <input
                value={accessRoleForm.name}
                onChange={(e) => setAccessRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej. Vendedor Evento"
                required
              />
            </label>
            <label>
              Perfil funcional
              <select
                value={accessRoleForm.functional_profile}
                onChange={(e) => setAccessRoleForm((prev) => ({ ...prev, functional_profile: e.target.value }))}
              >
                <option value="">Sin perfil funcional</option>
                {activeFunctionalProfiles.map((row) => (
                  <option key={row.code} value={row.code}>{row.label}</option>
                ))}
              </select>
            </label>

            {!accessRoleEditingId && (
              <>
                <span className="access-group-label">Módulos habilitados</span>
                <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
                  Al crear el perfil, estos checks generan el set inicial de permisos por modulo. Si mañana aparece un modulo nuevo en la configuracion maestra, se mostrara aqui automaticamente.
                </p>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {accessModules.map((mod) => (
                    <label
                      key={mod.code}
                      style={{
                        display: 'flex', gap: '6px', alignItems: 'center',
                        fontWeight: 'normal', cursor: 'pointer',
                        background: newRoleModules[mod.code] ? '#edf3f9' : '#f9fafb',
                        border: `1px solid ${newRoleModules[mod.code] ? '#c7d8ea' : '#e5e7eb'}`,
                        borderRadius: '6px', padding: '5px 10px', fontSize: '0.82rem',
                        color: newRoleModules[mod.code] ? '#2f5579' : '#6b7280',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newRoleModules[mod.code] ?? false}
                        onChange={(e) => setNewRoleModules((prev) => ({ ...prev, [mod.code]: e.target.checked }))}
                        style={{ accentColor: '#2f5579' }}
                      />
                      {mod.name}
                    </label>
                  ))}
                </div>
              </>
            )}

            {accessRoleEditingId && (
              <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
                Para ajustar permisos finos (ver, crear, editar, aprobar) usa la tabla de permisos de la parte inferior.
              </p>
            )}

            <div className="access-form-actions">
              <button className="wide access-button access-button-primary" type="submit" style={{ marginTop: '8px' }}>
                <span>{accessRoleEditingId ? 'Guardar perfil' : 'Crear perfil'}</span>
                <small>{accessRoleEditingId ? 'Actualiza nombre, perfil funcional y permisos' : 'Genera el rol con permisos iniciales'}</small>
              </button>
              {accessRoleEditingId && (
                <button className="wide access-button access-button-secondary" type="button" style={{ marginTop: '8px' }} onClick={resetAccessRoleEditor}>
                  <span>Cancelar edicion</span>
                  <small>Volver a alta de perfil</small>
                </button>
              )}
            </div>
          </form>

          <div className="table-wrap master-card access-card-roles">
            <div className="access-table-header">
              <h4>Perfiles registrados</h4>
              <span className="access-count-badge">{accessRoles.length} registros</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nombre</th>
                  <th>Perfil funcional</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accessRoles.map((row) => (
                  <tr key={row.id}>
                    <td><span className="access-username">{row.code}</span></td>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td>{row.functional_profile ? (functionalProfileLabelMap[row.functional_profile] ?? row.functional_profile) : <span className="access-cell-dim">—</span>}</td>
                    <td>
                      <span className={`status-badge ${row.status === 1 ? 'active' : 'inactive'}`}>
                        {row.status === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="access-row-actions">
                        <button type="button" className="access-button access-button-tertiary access-row-button" onClick={() => startAccessRoleEdit(row)}>
                          <span>Editar</span>
                          <small>Perfil</small>
                        </button>
                        <button
                          type="button"
                          className={`access-button ${row.status === 1 ? 'access-button-warn' : 'access-button-success'} access-row-button`}
                          onClick={() => void toggleAccessRole(row)}
                        >
                          <span>{row.status === 1 ? 'Desactivar' : 'Activar'}</span>
                          <small>{row.status === 1 ? 'Bloquea asignacion' : 'Habilita asignacion'}</small>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {accessRoles.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>No hay perfiles creados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
            </>
          )}

          {accessSubTab === 'catalog' && (
          <form className="grid-form master-card access-form-card access-catalog-card" onSubmit={saveFunctionalProfile}>
            <div className="access-form-subtitle">
              <h4>{functionalProfileEditingCode ? 'Editar Catalogo Funcional' : 'Catalogo de Perfil Funcional'}</h4>
              <span className="afs-badge">Catalogo</span>
            </div>
            <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
              Este catalogo define la lista de perfil funcional disponible para asignar a los perfiles de acceso.
            </p>

            <label>
              Codigo
              <input
                value={functionalProfileForm.code}
                onChange={(e) => setFunctionalProfileForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                disabled={functionalProfileEditingCode !== null}
                required
              />
            </label>
            <label>
              Nombre visible
              <input
                value={functionalProfileForm.label}
                onChange={(e) => setFunctionalProfileForm((prev) => ({ ...prev, label: e.target.value }))}
                required
              />
            </label>
            <label>
              Orden
              <input
                type="number"
                min={0}
                value={functionalProfileForm.sort_order}
                onChange={(e) => setFunctionalProfileForm((prev) => ({ ...prev, sort_order: Number(e.target.value || 0) }))}
              />
            </label>
            <label>
              Estado
              <select
                value={functionalProfileForm.status}
                onChange={(e) => setFunctionalProfileForm((prev) => ({ ...prev, status: Number(e.target.value) }))}
              >
                <option value={1}>Activo</option>
                <option value={0}>Inactivo</option>
              </select>
            </label>

            <div className="access-form-actions">
              <button className="wide access-button access-button-primary" type="submit">
                <span>{functionalProfileEditingCode ? 'Guardar item' : 'Agregar item'}</span>
                <small>{functionalProfileEditingCode ? 'Actualiza catalogo funcional' : 'Incorpora nuevo perfil funcional'}</small>
              </button>
              {functionalProfileEditingCode && (
                <button className="wide access-button access-button-secondary" type="button" onClick={resetFunctionalProfileEditor}>
                  <span>Cancelar edicion</span>
                  <small>Volver a alta</small>
                </button>
              )}
            </div>

            <div className="table-wrap" style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th>Orden</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accessFunctionalProfiles.map((row) => (
                    <tr key={row.code}>
                      <td><span className="access-username">{row.code}</span></td>
                      <td>{row.label}</td>
                      <td>{row.sort_order}</td>
                      <td>
                        <span className={`status-badge ${row.status === 1 ? 'active' : 'inactive'}`}>
                          {row.status === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="access-button access-button-tertiary access-row-button" onClick={() => startFunctionalProfileEdit(row)}>
                          <span>Editar</span>
                          <small>Catalogo</small>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {accessFunctionalProfiles.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '14px' }}>No hay items en el catalogo funcional.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </form>
          )}

          {/* ── Formulario: Nuevo Usuario ── */}
          {accessSubTab === 'users' && (
            <>
          <form ref={accessUserFormRef} className="grid-form master-card access-form-card user-card access-card-user-form" onSubmit={saveAccessUser}>
            <div className="access-form-subtitle">
              <h4>{accessUserEditingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h4>
              <span className="afs-badge user">{accessUserEditingId ? 'Edicion' : 'Cuenta'}</span>
            </div>
            <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
              Desde aqui puedes crear una cuenta nueva o reconfigurar sucursal, almacen y caja de una cuenta ya creada.
              La caja preferida es opcional y funciona como sugerencia de contexto; en Punto de Venta la caja operativa se elige al aperturar sesion.
            </p>

            <span className="access-group-label">Contexto operativo</span>
            <label>
              Sucursal
              <select
                value={accessUserForm.branch_id ?? ''}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : null, preferred_warehouse_id: null, preferred_cash_register_id: null }))}
              >
                <option value="">— Sin sucursal —</option>
                {(options?.branches ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
                ))}
              </select>
            </label>
            <label>
              Almacén preferido
              <select
                value={accessUserForm.preferred_warehouse_id ?? ''}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, preferred_warehouse_id: e.target.value ? Number(e.target.value) : null, preferred_cash_register_id: null }))}
              >
                <option value="">— Sin almacén —</option>
                {warehouses
                  .filter((w) => !accessUserForm.branch_id || w.branch_id === accessUserForm.branch_id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
                  ))}
              </select>
            </label>
            <label>
              Caja preferida (opcional)
              <select
                value={accessUserForm.preferred_cash_register_id ?? ''}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, preferred_cash_register_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">— Sin caja —</option>
                {cashRegisters
                  .filter((cr) => !accessUserForm.branch_id || cr.branch_id === accessUserForm.branch_id)
                  .map((cr) => (
                    <option key={cr.id} value={cr.id}>{cr.code} · {cr.name}</option>
                  ))}
              </select>
            </label>
            <label>
              Perfil de acceso
              <select
                value={accessUserForm.role_id}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, role_id: Number(e.target.value) }))}
                required
              >
                <option value={0} disabled>— Seleccionar perfil —</option>
                {accessRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.code} · {role.name}</option>
                ))}
              </select>
            </label>

            <span className="access-group-label">Credenciales</span>
            <label>
              Usuario
              <input
                value={accessUserForm.username}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="nombre.usuario"
                required
                disabled={accessUserEditingId !== null}
              />
            </label>
            <label>
              {accessUserEditingId ? 'Nueva contraseña' : 'Contraseña'}
              <input
                type="password"
                value={accessUserForm.password}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={accessUserEditingId ? 'Opcional. Deja vacio para conservar la actual' : 'Minimo 6 caracteres'}
                required={accessUserEditingId === null}
              />
            </label>
            {accessUserEditingId && (
              <p className="access-inline-note" style={{ gridColumn: '1 / -1' }}>
                El nombre de usuario no se modifica desde esta pantalla. Aqui actualizas el contexto operativo, el perfil y los datos del usuario.
              </p>
            )}

            <span className="access-group-label">Datos personales</span>
            <label>
              Nombres
              <input
                value={accessUserForm.first_name}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, first_name: e.target.value }))}
                placeholder="Nombres"
                required
              />
            </label>
            <label>
              Apellidos
              <input
                value={accessUserForm.last_name}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, last_name: e.target.value }))}
                placeholder="Apellidos"
              />
            </label>
            <label>
              Correo electrónico
              <input
                type="email"
                value={accessUserForm.email}
                onChange={(e) => setAccessUserForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="correo@empresa.com"
              />
            </label>

            <div className="access-form-actions">
              <button className="wide access-button access-button-primary" type="submit" style={{ marginTop: '8px' }}>
                <span>{accessUserEditingId ? 'Guardar cambios' : 'Crear usuario'}</span>
                <small>{accessUserEditingId ? 'Actualiza sucursal, almacen, caja y perfil' : 'Registra la cuenta con su contexto operativo'}</small>
              </button>
              {accessUserEditingId && (
                <button className="wide access-button access-button-secondary" type="button" style={{ marginTop: '8px' }} onClick={resetAccessUserEditor}>
                  <span>Cancelar edicion</span>
                  <small>Vuelve al modo de alta</small>
                </button>
              )}
            </div>
          </form>

          {/* ── Tabla de Usuarios ── */}
          <div className="table-wrap master-card" style={{ gridColumn: '1 / -1' }}>
            <div className="access-table-header">
              <h4>Usuarios del sistema</h4>
              <span className="access-count-badge">
                {accessUsers.filter((row) => includesSearch(row.username) || includesSearch(row.first_name) || includesSearch(row.role_code)).length} registros
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre completo</th>
                  <th>Sucursal</th>
                  <th>Almacén</th>
                  <th>Caja</th>
                  <th>Perfil</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accessUsers
                  .filter((row) => includesSearch(row.username) || includesSearch(row.first_name) || includesSearch(row.role_code))
                  .map((row) => {
                    const branchName = (options?.branches ?? []).find((b) => b.id === row.branch_id)?.name ?? null;
                    const warehouseName = warehouses.find((w) => w.id === row.preferred_warehouse_id)?.name ?? null;
                    const cashName = cashRegisters.find((cr) => cr.id === row.preferred_cash_register_id)?.name ?? null;
                    return (
                      <tr key={row.id}>
                        <td><span className="access-username">@{row.username}</span></td>
                        <td style={{ fontWeight: 500 }}>{`${row.first_name} ${row.last_name ?? ''}`.trim()}</td>
                        <td>{branchName ?? <span className="access-cell-dim">—</span>}</td>
                        <td>{warehouseName ?? <span className="access-cell-dim">—</span>}</td>
                        <td>{cashName ?? <span className="access-cell-dim">—</span>}</td>
                        <td>
                          <span className={`profile-badge${row.role_code ? '' : ' no-profile'}`}>
                            {row.role_code ?? 'Sin perfil'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${row.status === 1 ? 'active' : 'inactive'}`}>
                            {row.status === 1 ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="access-row-actions">
                            <button type="button" className="access-button access-button-tertiary access-row-button" onClick={() => startAccessUserEdit(row)}>
                              <span>Editar</span>
                              <small>Cuenta</small>
                            </button>
                            <button
                              type="button"
                              className={`access-button ${row.status === 1 ? 'access-button-warn' : 'access-button-success'} access-row-button`}
                              onClick={() => void toggleAccessUser(row)}
                            >
                              <span>{row.status === 1 ? 'Desactivar' : 'Activar'}</span>
                              <small>{row.status === 1 ? 'Bloquea acceso' : 'Habilita acceso'}</small>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {accessUsers.filter((row) => includesSearch(row.username) || includesSearch(row.first_name) || includesSearch(row.role_code)).length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>Sin resultados para la búsqueda actual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
            </>
          )}

          {/* ── Editor de Permisos por Perfil ── */}
          {accessSubTab === 'permissions' && (
          <div className="master-card" style={{ gridColumn: '1 / -1' }}>
            <div className="perm-section-header">
              <div>
                <h4>Permisos por perfil</h4>
                <p className="perm-hint">Selecciona un perfil para editar sus permisos de acceso a cada módulo.</p>
              </div>
              <button type="button" onClick={() => void saveRoleEditor()} disabled={!selectedRoleId} style={{ whiteSpace: 'nowrap' }}>
                Guardar cambios
              </button>
            </div>

            <div className="role-permissions-toolbar">
              <label>
                Perfil a editar
                <select
                  value={selectedRoleId ?? ''}
                  onChange={(e) => selectRoleForEditing(Number(e.target.value))}
                >
                  <option value="">— Seleccionar perfil —</option>
                  {accessRoles.map((role) => (
                    <option key={role.id} value={role.id}>{role.code} · {role.name} ({role.functional_profile ? (functionalProfileLabelMap[role.functional_profile] ?? role.functional_profile) : 'Sin perfil'})</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="role-permissions-fields">
              <label>
                Nombre del perfil
                <input
                  value={roleEditorName}
                  onChange={(e) => setRoleEditorName(e.target.value)}
                  placeholder="Nombre visible del perfil"
                  disabled={!selectedRoleId}
                />
              </label>
              <label>
                Perfil funcional
                <select
                  value={roleEditorProfile}
                  onChange={(e) => setRoleEditorProfile(e.target.value)}
                  disabled={!selectedRoleId}
                >
                  <option value="">No definido</option>
                  {activeFunctionalProfiles.map((row) => (
                    <option key={row.code} value={row.code}>{row.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <table className="perm-table">
              <thead>
                <tr>
                  <th>Modulo</th>
                  <th>Ver</th>
                  <th>Crear</th>
                  <th>Editar</th>
                  <th>Eliminar</th>
                  <th>Exportar</th>
                  <th>Aprobar</th>
                </tr>
              </thead>
              <tbody>
                {roleEditorPermissions.map((row) => (
                  <tr key={row.module_code}>
                    <td>{accessModuleMap[row.module_code] ?? row.module_code}</td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_view}   onChange={(e) => updateRolePermission(row.module_code, 'can_view',   e.target.checked)} /></td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_create} onChange={(e) => updateRolePermission(row.module_code, 'can_create', e.target.checked)} /></td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_update} onChange={(e) => updateRolePermission(row.module_code, 'can_update', e.target.checked)} /></td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_delete} onChange={(e) => updateRolePermission(row.module_code, 'can_delete', e.target.checked)} /></td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_export} onChange={(e) => updateRolePermission(row.module_code, 'can_export', e.target.checked)} /></td>
                    <td><input className="perm-check" type="checkbox" checked={row.can_approve} onChange={(e) => updateRolePermission(row.module_code, 'can_approve', e.target.checked)} /></td>
                  </tr>
                ))}
                {roleEditorPermissions.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>Selecciona un perfil para ver y editar sus permisos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}
          </div>
        </div>
      )}
        </div>
      </div>
    </section>
  );
}

