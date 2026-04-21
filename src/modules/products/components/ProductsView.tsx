import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../../shared/api/client';
import { fetchInventoryProducts, importInventoryProductsBulk, type InventoryBulkImportRow } from '../../inventory/api';
import type { InventoryProduct } from '../../inventory/types';
import '../products.css';

type ProductsViewProps = {
  accessToken: string;
  activeVerticalCode?: string | null;
  uiProfile?: 'RETAIL' | 'RESTAURANT_MENU' | 'RESTAURANT_SUPPLIES';
  defaultNatureFilter?: 'ALL' | 'PRODUCT' | 'SUPPLY';
};

type ProductLookup = {
  id: number;
  code?: string;
  name: string;
  sunat_uom_code?: string | null;
};

type ProductCommercialFeatures = {
  PRODUCT_MULTI_UOM: boolean;
  PRODUCT_UOM_CONVERSIONS: boolean;
  PRODUCT_WHOLESALE_PRICING: boolean;
};

type ProductSaleUnitRow = {
  unit_id: number;
  is_base: boolean;
  status: number;
  code: string;
  name: string;
};

type ProductConversionRow = {
  id?: number;
  from_unit_id: number;
  from_unit_code: string;
  from_unit_name: string;
  to_unit_id: number;
  to_unit_code: string;
  to_unit_name: string;
  conversion_factor: number;
  status: number;
};

type PriceTierOption = {
  id: number;
  code: string;
  name: string;
  min_qty: string;
  max_qty: string | null;
  priority: number;
  status: number;
};

type ProductWholesalePriceRow = {
  id?: number;
  price_tier_id: number;
  tier_code: string;
  tier_name: string;
  min_qty: string;
  max_qty: string | null;
  unit_id: number | null;
  unit_code: string | null;
  unit_name: string | null;
  unit_price: number;
  status: number;
};

type ProductCommercialConfig = {
  product: {
    id: number;
    name: string;
    unit_id: number | null;
    sale_price: number;
  };
  features: ProductCommercialFeatures;
  enabled_units: ProductLookup[];
  product_units: ProductSaleUnitRow[];
  conversions: ProductConversionRow[];
  price_tiers: PriceTierOption[];
  wholesale_prices: ProductWholesalePriceRow[];
};

type ProductMasterEntry = {
  id: number;
  name: string;
  status: number;
};

type MasterKind = 'line' | 'brand' | 'location' | 'warranty';

type ProductFormState = {
  sku: string;
  barcode: string;
  name: string;
  unit_id: number | null;
  category_id: number | null;
  line_id: number | null;
  brand_id: number | null;
  location_id: number | null;
  warranty_id: number | null;
  product_nature: 'PRODUCT' | 'SUPPLY';
  sunat_code: string;
  image_url: string;
  seller_commission_percent: number;
  sale_price: number;
  cost_price: number;
  is_stockable: boolean;
  lot_tracking: boolean;
  has_expiration: boolean;
  status: number;
};

type ProductUiTab = 'catalogo' | 'maestros' | 'comercial';
type ProductFormStep = 1 | 2 | 3;

const PRODUCT_BULK_TEMPLATE_HEADERS = [
  'ID',
  'SKU',
  'CODIGO_BARRAS',
  'NOMBRE',
  'TIPO',
  'PRECIO_VENTA',
  'PRECIO_COSTO',
  'CODIGO_UNIDAD',
  'CODIGO_SUNAT',
  'AFECTO_STOCK',
  'SEGUIMIENTO_LOTE',
  'CON_VENCIMIENTO',
  'ESTADO',
  'STOCK_INICIAL',
  'COSTO_INICIAL',
  'ALMACEN_CODIGO',
];

function normalizeExcelHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeImportRows(rawRows: Array<Record<string, unknown>>): InventoryBulkImportRow[] {
  return rawRows
    .map((raw) => {
      const row = Object.entries(raw).reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[normalizeExcelHeader(key)] = value;
        return acc;
      }, {});

      const idRaw = String(row.ID ?? '').trim();
      const payload: InventoryBulkImportRow = {
        id: idRaw !== '' && Number.isFinite(Number(idRaw)) ? Number(idRaw) : undefined,
        sku: String(row.SKU ?? '').trim() || undefined,
        barcode: String(row.CODIGO_BARRAS ?? row.BARCODE ?? '').trim() || undefined,
        name: String(row.NOMBRE ?? row.NAME ?? '').trim() || undefined,
        product_nature: String(row.TIPO ?? row.NATURALEZA ?? '').trim() || undefined,
        sale_price: String(row.PRECIO_VENTA ?? row.VENTA ?? '').trim() || undefined,
        cost_price: String(row.PRECIO_COSTO ?? row.COSTO ?? '').trim() || undefined,
        unit_code: String(row.CODIGO_UNIDAD ?? row.UNIDAD ?? '').trim() || 'NIU',
        sunat_code: String(row.CODIGO_SUNAT ?? row.SUNAT_CODE ?? '').trim() || undefined,
        is_stockable: String(row.AFECTO_STOCK ?? row.STOCKABLE ?? '').trim() || undefined,
        lot_tracking: String(row.SEGUIMIENTO_LOTE ?? row.LOT_TRACKING ?? '').trim() || undefined,
        has_expiration: String(row.CON_VENCIMIENTO ?? row.HAS_EXPIRATION ?? '').trim() || undefined,
        status: String(row.ESTADO ?? row.STATUS ?? '').trim() || undefined,
        initial_qty: String(row.STOCK_INICIAL ?? row.INITIAL_QTY ?? '').trim() || undefined,
        initial_cost: String(row.COSTO_INICIAL ?? row.INITIAL_COST ?? '').trim() || undefined,
        warehouse_code: String(row.ALMACEN_CODIGO ?? row.WAREHOUSE_CODE ?? '').trim() || undefined,
      };

      const hasData = Object.values(payload).some((value) => value !== undefined && String(value).trim() !== '');
      return hasData ? payload : null;
    })
    .filter((row): row is InventoryBulkImportRow => row !== null);
}

const EMPTY_FORM: ProductFormState = {
  sku: '',
  barcode: '',
  name: '',
  unit_id: null,
  category_id: null,
  line_id: null,
  brand_id: null,
  location_id: null,
  warranty_id: null,
  product_nature: 'PRODUCT',
  sunat_code: '',
  image_url: '',
  seller_commission_percent: 0,
  sale_price: 0,
  cost_price: 0,
  is_stockable: true,
  lot_tracking: false,
  has_expiration: false,
  status: 1,
};

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function fetchProductLookups(accessToken: string): Promise<{
  units: ProductLookup[];
  categories: ProductLookup[];
  permissions?: {
    can_manage_products?: boolean;
    can_manage_product_masters?: boolean;
  };
}> {
  return apiClient.request('/api/inventory/product-lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

async function fetchProductMasters(accessToken: string): Promise<{
  lines: ProductMasterEntry[];
  brands: ProductMasterEntry[];
  locations: ProductMasterEntry[];
  warranties: ProductMasterEntry[];
}> {
  return apiClient.request('/api/inventory/product-masters', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

async function createProductMaster(
  accessToken: string,
  kind: MasterKind,
  name: string
): Promise<ProductMasterEntry> {
  return apiClient.request('/api/inventory/product-masters', {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, name }),
  });
}

async function updateProductMaster(
  accessToken: string,
  id: number,
  payload: { kind: MasterKind; name?: string; status?: number }
): Promise<ProductMasterEntry> {
  return apiClient.request(`/api/inventory/product-masters/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function createProduct(accessToken: string, payload: ProductFormState) {
  return apiClient.request('/api/inventory/products', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

async function updateProduct(accessToken: string, id: number, payload: Partial<ProductFormState>) {
  return apiClient.request(`/api/inventory/products/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

async function fetchProductCommercialConfig(accessToken: string, id: number): Promise<ProductCommercialConfig> {
  return apiClient.request(`/api/inventory/products/${id}/commercial-config`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

async function updateProductCommercialConfig(
  accessToken: string,
  id: number,
  payload: {
    base_unit_id?: number | null;
    units?: Array<{ unit_id: number; is_base: boolean; status: number }>;
    conversions?: Array<{ from_unit_id: number; to_unit_id: number; conversion_factor: number; status: number }>;
    wholesale_prices?: Array<{ price_tier_id: number; unit_id: number | null; unit_price: number; status: number }>;
  }
): Promise<ProductCommercialConfig> {
  return apiClient.request(`/api/inventory/products/${id}/commercial-config`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function ProductsView({
  accessToken,
  activeVerticalCode = null,
  uiProfile,
  defaultNatureFilter = 'ALL',
}: ProductsViewProps) {
  const [rows, setRows] = useState<InventoryProduct[]>([]);
  const [units, setUnits] = useState<ProductLookup[]>([]);
  const [categories, setCategories] = useState<ProductLookup[]>([]);
  const [lines, setLines] = useState<ProductMasterEntry[]>([]);
  const [brands, setBrands] = useState<ProductMasterEntry[]>([]);
  const [locations, setLocations] = useState<ProductMasterEntry[]>([]);
  const [warranties, setWarranties] = useState<ProductMasterEntry[]>([]);
  const [newLineName, setNewLineName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newWarrantyName, setNewWarrantyName] = useState('');
  const [masterSavingKind, setMasterSavingKind] = useState<null | MasterKind>(null);
  const [editingMaster, setEditingMaster] = useState<{ kind: MasterKind; id: number; name: string; status: number } | null>(null);
  const [editingMasterSaving, setEditingMasterSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | '1' | '0'>('1');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [commercialConfig, setCommercialConfig] = useState<ProductCommercialConfig | null>(null);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [commercialUnits, setCommercialUnits] = useState<ProductSaleUnitRow[]>([]);
  const [commercialConversions, setCommercialConversions] = useState<ProductConversionRow[]>([]);
  const [commercialWholesale, setCommercialWholesale] = useState<ProductWholesalePriceRow[]>([]);
  const [unitToAdd, setUnitToAdd] = useState<number | null>(null);
  const [conversionDraft, setConversionDraft] = useState({
    from_unit_id: 0,
    to_unit_id: 0,
    conversion_factor: 1,
  });
  const [wholesaleDraft, setWholesaleDraft] = useState({
    price_tier_id: 0,
    unit_id: 0,
    unit_price: 0,
  });
  const [uiTab, setUiTab] = useState<ProductUiTab>('catalogo');
  const [formStep, setFormStep] = useState<ProductFormStep>(1);
  const [showFormModal, setShowFormModal] = useState(false);
  const [canManageProducts, setCanManageProducts] = useState(true);
  const [canManageProductMasters, setCanManageProductMasters] = useState(true);
  const [natureFilter, setNatureFilter] = useState<'ALL' | 'PRODUCT' | 'SUPPLY'>('ALL');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const productsPerPage = 15;
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedProfile = uiProfile
    ?? (((activeVerticalCode ?? '').toUpperCase() === 'RESTAURANT') ? 'RESTAURANT_SUPPLIES' : 'RETAIL');

  const isRestaurant = resolvedProfile !== 'RETAIL';

  useEffect(() => {
    if (defaultNatureFilter !== 'ALL') {
      setNatureFilter(defaultNatureFilter);
      return;
    }

    if (isRestaurant) {
      setNatureFilter('SUPPLY');
    } else {
      setNatureFilter('ALL');
    }
  }, [isRestaurant, defaultNatureFilter]);

  const activeCount = useMemo(() => rows.filter((row) => Number(row.status) === 1).length, [rows]);

  const filteredRows = useMemo(() => {
    if (natureFilter === 'ALL') {
      return rows;
    }
    return rows.filter((row) => row.product_nature === natureFilter);
  }, [rows, natureFilter]);

  const totalProductsPages = useMemo(() => Math.ceil(filteredRows.length / productsPerPage), [filteredRows.length, productsPerPage]);

  const paginatedProducts = useMemo(() => {
    const start = (productsPage - 1) * productsPerPage;
    const end = start + productsPerPage;
    return filteredRows.slice(start, end);
  }, [filteredRows, productsPage, productsPerPage]);

  const visibleRows = useMemo(() => {
    if (natureFilter === 'ALL') {
      return rows;
    }
    return rows.filter((row) => row.product_nature === natureFilter);
  }, [rows, natureFilter]);

  const lineNameById = useMemo(() => new Map(lines.map((row) => [row.id, row.name])), [lines]);
  const brandNameById = useMemo(() => new Map(brands.map((row) => [row.id, row.name])), [brands]);
  const locationNameById = useMemo(() => new Map(locations.map((row) => [row.id, row.name])), [locations]);
  const warrantyNameById = useMemo(() => new Map(warranties.map((row) => [row.id, row.name])), [warranties]);

  const hasInactiveSelectedMaster = useMemo(() => {
    const selectedLineInactive = form.line_id !== null && !lines.some((row) => row.id === form.line_id && row.status === 1);
    const selectedBrandInactive = form.brand_id !== null && !brands.some((row) => row.id === form.brand_id && row.status === 1);
    const selectedLocationInactive = form.location_id !== null && !locations.some((row) => row.id === form.location_id && row.status === 1);
    const selectedWarrantyInactive = form.warranty_id !== null && !warranties.some((row) => row.id === form.warranty_id && row.status === 1);

    return selectedLineInactive || selectedBrandInactive || selectedLocationInactive || selectedWarrantyInactive;
  }, [form.line_id, form.brand_id, form.location_id, form.warranty_id, lines, brands, locations, warranties]);

  async function loadProducts() {
    setLoading(true);
    setMessage('');

    try {
      const [data, lookups, masters] = await Promise.all([
        fetchInventoryProducts(accessToken, {
          search: search.trim() || undefined,
          status: status === 'all' ? null : Number(status),
        }),
        fetchProductLookups(accessToken),
        fetchProductMasters(accessToken),
      ]);
      setRows(data);
      setUnits(lookups.units ?? []);
      setCategories(lookups.categories ?? []);
      setCanManageProducts(lookups.permissions?.can_manage_products !== false);
      setCanManageProductMasters(lookups.permissions?.can_manage_product_masters !== false);
      setLines(masters.lines ?? []);
      setBrands(masters.brands ?? []);
      setLocations(masters.locations ?? []);
      setWarranties(masters.warranties ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar productos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, status]);

  function resetForm(keepMasters = false) {
    const nextForm = keepMasters
      ? {
          ...EMPTY_FORM,
          line_id: form.line_id,
          brand_id: form.brand_id,
          location_id: form.location_id,
          warranty_id: form.warranty_id,
          product_nature: form.product_nature,
          unit_id: form.unit_id,
          category_id: form.category_id,
        }
      : EMPTY_FORM;

    setEditingId(null);
    setForm(nextForm);
    setCommercialConfig(null);
    setCommercialUnits([]);
    setCommercialConversions([]);
    setCommercialWholesale([]);
    setUnitToAdd(null);
    setFormStep(1);
    setShowFormModal(false);
  }

  function startCreateWithNature(nature: 'PRODUCT' | 'SUPPLY') {
    setShowFormModal(true);
    setFormStep(1);
    setEditingId(null);
    setForm((prev) => ({ ...EMPTY_FORM, product_nature: nature, unit_id: prev.unit_id, category_id: prev.category_id }));
  }

  function openNewProductForm() {
    setShowFormModal(true);
    setFormStep(1);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function startEdit(row: InventoryProduct) {
    setShowFormModal(true);
    setFormStep(1);
    setEditingId(row.id);
    setForm({
      sku: row.sku ?? '',
      barcode: row.barcode ?? '',
      name: row.name,
      unit_id: row.unit_id,
      category_id: null,
      line_id: row.line_id ?? null,
      brand_id: row.brand_id ?? null,
      location_id: row.location_id ?? null,
      warranty_id: row.warranty_id ?? null,
      product_nature: row.product_nature ?? 'PRODUCT',
      sunat_code: row.sunat_code ?? '',
      image_url: row.image_url ?? '',
      seller_commission_percent: Number(row.seller_commission_percent ?? 0),
      sale_price: Number(row.sale_price ?? 0),
      cost_price: Number(row.cost_price ?? 0),
      is_stockable: Boolean(row.is_stockable),
      lot_tracking: Boolean(row.lot_tracking),
      has_expiration: Boolean(row.has_expiration),
      status: Number(row.status) === 1 ? 1 : 0,
    });

    setCommercialLoading(true);
    try {
      const config = await fetchProductCommercialConfig(accessToken, row.id);
      setCommercialConfig(config);
      setCommercialUnits(config.product_units ?? []);
      setCommercialConversions(
        (config.conversions ?? []).map((item) => ({
          ...item,
          conversion_factor: Number(item.conversion_factor),
          status: Number(item.status ?? 1),
        }))
      );
      setCommercialWholesale(
        (config.wholesale_prices ?? []).map((item) => ({
          ...item,
          unit_price: Number(item.unit_price),
          status: Number(item.status ?? 1),
        }))
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar configuracion comercial');
    } finally {
      setCommercialLoading(false);
    }
  }

  function addCommercialUnit() {
    if (!unitToAdd || !commercialConfig) {
      return;
    }

    if (commercialUnits.some((row) => row.unit_id === unitToAdd)) {
      return;
    }

    const unit = commercialConfig.enabled_units.find((row) => row.id === unitToAdd);
    if (!unit) {
      return;
    }

    setCommercialUnits((prev) => [
      ...prev,
      {
        unit_id: unit.id,
        is_base: prev.length === 0,
        status: 1,
        code: unit.code ?? '',
        name: unit.name,
      },
    ]);
    setUnitToAdd(null);
  }

  function setBaseUnit(unitId: number) {
    setCommercialUnits((prev) => prev.map((row) => ({ ...row, is_base: row.unit_id === unitId })));
  }

  function removeCommercialUnit(unitId: number) {
    setCommercialUnits((prev) => {
      const next = prev.filter((row) => row.unit_id !== unitId);
      if (next.length > 0 && !next.some((row) => row.is_base)) {
        next[0].is_base = true;
      }
      return [...next];
    });
  }

  function addConversion() {
    if (!conversionDraft.from_unit_id || !conversionDraft.to_unit_id || conversionDraft.conversion_factor <= 0) {
      return;
    }

    const fromUnit = commercialUnits.find((row) => row.unit_id === conversionDraft.from_unit_id);
    const toUnit = commercialUnits.find((row) => row.unit_id === conversionDraft.to_unit_id);

    if (!fromUnit || !toUnit || fromUnit.unit_id === toUnit.unit_id) {
      return;
    }

    setCommercialConversions((prev) => [
      ...prev.filter(
        (row) => !(row.from_unit_id === fromUnit.unit_id && row.to_unit_id === toUnit.unit_id)
      ),
      {
        from_unit_id: fromUnit.unit_id,
        from_unit_code: fromUnit.code,
        from_unit_name: fromUnit.name,
        to_unit_id: toUnit.unit_id,
        to_unit_code: toUnit.code,
        to_unit_name: toUnit.name,
        conversion_factor: Number(conversionDraft.conversion_factor),
        status: 1,
      },
    ]);

    setConversionDraft({ from_unit_id: 0, to_unit_id: 0, conversion_factor: 1 });
  }

  function addWholesalePrice() {
    if (!commercialConfig || !wholesaleDraft.price_tier_id || wholesaleDraft.unit_price < 0) {
      return;
    }

    const tier = commercialConfig.price_tiers.find((row) => row.id === wholesaleDraft.price_tier_id);
    if (!tier) {
      return;
    }

    const unitId = wholesaleDraft.unit_id > 0 ? wholesaleDraft.unit_id : null;
    const unit = unitId ? commercialUnits.find((row) => row.unit_id === unitId) : null;

    setCommercialWholesale((prev) => [
      ...prev.filter((row) => !(row.price_tier_id === tier.id && row.unit_id === unitId)),
      {
        price_tier_id: tier.id,
        tier_code: tier.code,
        tier_name: tier.name,
        min_qty: tier.min_qty,
        max_qty: tier.max_qty,
        unit_id: unitId,
        unit_code: unit ? unit.code : null,
        unit_name: unit ? unit.name : null,
        unit_price: Number(wholesaleDraft.unit_price),
        status: 1,
      },
    ]);

    setWholesaleDraft({ price_tier_id: 0, unit_id: 0, unit_price: 0 });
  }

  async function saveCommercialConfig() {
    if (!editingId || !commercialConfig) {
      return;
    }

    setCommercialLoading(true);
    setMessage('');

    try {
      const baseUnit = commercialUnits.find((row) => row.is_base);

      const payload: {
        base_unit_id?: number | null;
        units?: Array<{ unit_id: number; is_base: boolean; status: number }>;
        conversions?: Array<{ from_unit_id: number; to_unit_id: number; conversion_factor: number; status: number }>;
        wholesale_prices?: Array<{ price_tier_id: number; unit_id: number | null; unit_price: number; status: number }>;
      } = {
        base_unit_id: baseUnit ? baseUnit.unit_id : null,
      };

      if (commercialConfig.features.PRODUCT_MULTI_UOM) {
        payload.units = commercialUnits.map((row) => ({
          unit_id: row.unit_id,
          is_base: row.is_base,
          status: row.status,
        }));
      }

      if (commercialConfig.features.PRODUCT_UOM_CONVERSIONS) {
        payload.conversions = commercialConversions.map((row) => ({
          from_unit_id: row.from_unit_id,
          to_unit_id: row.to_unit_id,
          conversion_factor: Number(row.conversion_factor),
          status: row.status,
        }));
      }

      if (commercialConfig.features.PRODUCT_WHOLESALE_PRICING) {
        payload.wholesale_prices = commercialWholesale.map((row) => ({
          price_tier_id: row.price_tier_id,
          unit_id: row.unit_id,
          unit_price: Number(row.unit_price),
          status: row.status,
        }));
      }

      const response = await updateProductCommercialConfig(accessToken, editingId, payload);
      setCommercialConfig(response);
      setMessage('Configuracion comercial guardada.');
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar configuracion comercial');
    } finally {
      setCommercialLoading(false);
    }
  }

  async function quickCreateMaster(
    kind: MasterKind,
    name: string,
    setter: React.Dispatch<React.SetStateAction<ProductMasterEntry[]>>,
    formField: keyof ProductFormState,
    clearName: () => void
  ) {
    if (!canManageProductMasters) {
      setMessage('No tienes permiso para crear maestros de producto.');
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('Ingresa un nombre para crear el maestro.');
      return;
    }

    const kindLabels: Record<'line' | 'brand' | 'location' | 'warranty', string> = {
      line: 'Línea',
      brand: 'Marca',
      location: 'Ubicación',
      warranty: 'Garantía',
    };

    try {
      setMasterSavingKind(kind);
      setMessage('');
      const entry = await createProductMaster(accessToken, kind, trimmed);
      const entryId = Number(entry.id);
      setter((prev) => {
        const normalized = {
          id: entryId,
          name: String(entry.name ?? trimmed),
          status: Number(entry.status ?? 1),
        };

        const index = prev.findIndex((r) => r.id === normalized.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = normalized;
          return next.sort((a, b) => a.name.localeCompare(b.name));
        }

        return [...prev, normalized].sort((a, b) => a.name.localeCompare(b.name));
      });
      setForm((prev) => ({ ...prev, [formField]: entryId }));

      // If an existing product is being edited, persist the selected master immediately.
      if (editingId) {
        await updateProduct(accessToken, editingId, { [formField]: entryId });
      }

      const masters = await fetchProductMasters(accessToken);
      setLines(masters.lines ?? []);
      setBrands(masters.brands ?? []);
      setLocations(masters.locations ?? []);
      setWarranties(masters.warranties ?? []);

      clearName();
      setMessage(editingId
        ? `${kindLabels[kind]} agregada y asignada al producto.`
        : `${kindLabels[kind]} agregada correctamente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el maestro');
    } finally {
      setMasterSavingKind(null);
    }
  }

  async function saveEditedMaster() {
    if (!editingMaster) {
      return;
    }

    if (!canManageProductMasters) {
      setMessage('No tienes permiso para editar maestros de producto.');
      return;
    }

    const name = editingMaster.name.trim();
    if (!name) {
      setMessage('El nombre del maestro no puede estar vacío.');
      return;
    }

    try {
      setEditingMasterSaving(true);
      setMessage('');
      await updateProductMaster(accessToken, editingMaster.id, {
        kind: editingMaster.kind,
        name,
        status: Number(editingMaster.status) === 1 ? 1 : 0,
      });

      const masters = await fetchProductMasters(accessToken);
      setLines(masters.lines ?? []);
      setBrands(masters.brands ?? []);
      setLocations(masters.locations ?? []);
      setWarranties(masters.warranties ?? []);

      setMessage('Maestro actualizado correctamente.');
      setEditingMaster(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el maestro');
    } finally {
      setEditingMasterSaving(false);
    }
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageProducts) {
      setMessage('No tienes permiso para guardar productos.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (editingId) {
        await updateProduct(accessToken, editingId, form);
        setMessage('Producto actualizado correctamente.');
        await loadProducts();
      } else {
        await createProduct(accessToken, form);
        setMessage('Producto creado correctamente.');
        resetForm(true);
        await loadProducts();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar producto');
    } finally {
      setLoading(false);
    }
  }

  async function toggleProduct(row: InventoryProduct) {
    if (!canManageProducts) {
      setMessage('No tienes permiso para actualizar productos.');
      return;
    }

    try {
      await updateProduct(accessToken, row.id, { status: Number(row.status) === 1 ? 0 : 1 });
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado del producto');
    }
  }

  async function downloadBulkTemplate() {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const productsSheet = XLSX.utils.aoa_to_sheet([
        PRODUCT_BULK_TEMPLATE_HEADERS,
        ['', 'SKU-001', '7751234567890', 'Producto ejemplo', 'PRODUCT', '12.50', '8.00', 'NIU', '', 'SI', 'NO', 'NO', '1', '10', '8.00', 'PRINCIPAL'],
      ]);
      productsSheet['!cols'] = [
        { wch: 8 },
        { wch: 18 },
        { wch: 18 },
        { wch: 38 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
      ];

      const instructionsSheet = XLSX.utils.aoa_to_sheet([
        ['CAMPO', 'REGLA'],
        ['NOMBRE', 'Obligatorio.'],
        ['TIPO', 'PRODUCT o SUPPLY. Si va vacío, se usa PRODUCT.'],
        ['CODIGO_UNIDAD', 'Si va vacío, se usa NIU (UNIDAD (BIENES)).'],
        ['ESTADO', '1/SI/TRUE para activo, 0/NO/FALSE para inactivo.'],
        ['ID', 'Opcional: si existe, actualiza ese producto.'],
        ['SKU/CODIGO_BARRAS', 'Si coincide con uno existente, se actualiza.'],
        ['STOCK_INICIAL', 'Opcional. Si es > 0, registra una entrada de Kardex.'],
        ['ALMACEN_CODIGO', 'Opcional. Si va vacio y STOCK_INICIAL > 0, se aplica al almacen principal/preferente.'],
        ['COSTO_INICIAL', 'Opcional. Si va vacio, usa PRECIO_COSTO.'],
      ]);
      instructionsSheet['!cols'] = [{ wch: 26 }, { wch: 78 }];

      XLSX.utils.book_append_sheet(workbook, productsSheet, 'PRODUCTOS');
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'INSTRUCCIONES');
      XLSX.writeFile(workbook, 'formato_importacion_productos.xlsx');
      setMessage('Formato Excel descargado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo descargar la plantilla Excel');
    }
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!canManageProducts) {
      setMessage('No tienes permiso para importar productos.');
      return;
    }

    setBulkImporting(true);
    setMessage('');

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheet) {
        throw new Error('El archivo no contiene una hoja válida.');
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      const rows = normalizeImportRows(rawRows);

      if (rows.length === 0) {
        throw new Error('No se encontraron filas válidas para importar.');
      }

      const response = await importInventoryProductsBulk(accessToken, rows, file.name);
      const summary = response.summary;
      const firstError = response.errors[0]?.message;
      const batchRef = response.batch_id ? ` (lote #${response.batch_id})` : '';
      const stockSummary =
        typeof summary.stock_applied === 'number'
          ? ` Stock aplicado: ${summary.stock_applied}${typeof summary.stock_skipped === 'number' ? `, stock omitido: ${summary.stock_skipped}` : ''}.`
          : '';
      setMessage(
        `Importación procesada${batchRef}: ${summary.created} creados, ${summary.updated} actualizados, ${summary.skipped} omitidos.${stockSummary}${firstError ? ` Primer error: ${firstError}` : ''}`
      );
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo Excel');
    } finally {
      setBulkImporting(false);
    }
  }

  return (
    <section className="module-panel products-module">
      <div className="module-header products-module-header">
        <h3>{isRestaurant ? 'Carta e Insumos' : 'Productos'}</h3>
        <div className="entity-actions">
          <button type="button" onClick={() => void downloadBulkTemplate()} className="products-header-btn">
            <span className="products-header-icon">📥</span>
            Descargar formato Excel
          </button>
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={!canManageProducts || bulkImporting}
            className="products-header-btn"
          >
            <span className="products-header-icon">📤</span>
            {bulkImporting ? 'Importando...' : 'Cargar Excel'}
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => void handleImportFileChange(event)}
            style={{ display: 'none' }}
          />
          <button type="button" onClick={openNewProductForm} className="products-header-btn" title="Abrir formulario para crear nuevo producto">
            <span className="products-header-icon">➕</span>
            Nuevo producto
          </button>
          {isRestaurant && (
            <button type="button" onClick={() => startCreateWithNature('SUPPLY')} disabled={!canManageProducts} className="products-header-btn">
              <span className="products-header-icon">🧂</span>
              Nuevo insumo
            </button>
          )}
          {isRestaurant && (
            <button type="button" onClick={() => startCreateWithNature('PRODUCT')} disabled={!canManageProducts} className="products-header-btn">
              <span className="products-header-icon">🍽️</span>
              Nuevo plato/bebida
            </button>
          )}
          <button type="button" onClick={() => void loadProducts()} disabled={loading} className="products-header-btn">
            <span className="products-header-icon">🔄</span>
            Refrescar
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}
      {!canManageProducts && (
        <p className="notice">Tu perfil no tiene permiso para guardar productos. Puedes consultar información.</p>
      )}

      <div className="products-summary-strip">
        <article>
          <span>Total</span>
          <strong>{rows.length}</strong>
        </article>
        <article>
          <span>Activos</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <span>Inactivos</span>
          <strong>{rows.length - activeCount}</strong>
        </article>
        <article>
          <span>Modo</span>
          <strong>{editingId ? `Editando #${editingId}` : 'Creación'}</strong>
        </article>
      </div>

      <nav className="sub-tabs products-subtabs products-module-subtabs">
        <button type="button" className={uiTab === 'catalogo' ? 'active' : ''} onClick={() => setUiTab('catalogo')}>
          <span className="products-tab-icon">📦</span>
          <span className="products-tab-label">Catálogo</span>
        </button>
        <button type="button" className={uiTab === 'maestros' ? 'active' : ''} onClick={() => setUiTab('maestros')}>
          <span className="products-tab-icon">🏷️</span>
          <span className="products-tab-label">Maestros</span>
        </button>
        <button
          type="button"
          className={uiTab === 'comercial' ? 'active' : ''}
          onClick={() => setUiTab('comercial')}
          title={editingId ? 'Configuración comercial del producto en edición' : 'Selecciona un producto para editar'}
          disabled={!editingId || !canManageProducts}
        >
          <span className="products-tab-icon">💰</span>
          <span className="products-tab-label">Comercial</span>
        </button>
      </nav>

      {uiTab === 'catalogo' && (
        <>
          <div className="grid-form entity-filters">
            <label>
              Buscar
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SKU, codigo de barras o nombre"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void loadProducts();
                  }
                }}
              />
            </label>
            <label>
              Estado
              <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | '1' | '0')}>
                <option value="all">Todos</option>
                <option value="1">Activos</option>
                <option value="0">Inactivos</option>
              </select>
            </label>
            <label>
              Tipo
              <select value={natureFilter} onChange={(event) => setNatureFilter(event.target.value as 'ALL' | 'PRODUCT' | 'SUPPLY')}>
                <option value="ALL">Todos</option>
                <option value="SUPPLY">Insumos</option>
                <option value="PRODUCT">Producto/Carta</option>
              </select>
            </label>
            <div className="entity-filter-action">
              <button type="button" onClick={() => void loadProducts()} disabled={loading}>
                Buscar
              </button>
            </div>
          </div>

          <div className="table-wrap products-table-wrap">
            <h4>{isRestaurant ? 'Catalogo de carta e insumos' : 'Catalogo de productos'}</h4>
            <table className="inventory-table products-catalog-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Línea</th>
                  <th>Marca</th>
                  <th>Unidad</th>
                  <th>Precio Venta</th>
                  <th>Precio Costo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.sku ?? '-'}</td>
                    <td>{row.name}</td>
                    <td>{row.product_nature === 'SUPPLY' ? 'Insumo' : 'Producto'}</td>
                    <td>{row.line_name ?? '-'}</td>
                    <td>{row.brand_name ?? '-'}</td>
                    <td>{row.unit_code ?? row.unit_name ?? '-'}</td>
                    <td>{row.sale_price}</td>
                    <td>{row.cost_price}</td>
                    <td>{Number(row.status) === 1 ? 'ACTIVO' : 'INACTIVO'}</td>
                    <td>
                      <div className="products-catalog-actions">
                      <button type="button" className="products-row-action products-row-action-edit" onClick={() => void startEdit(row)} title="Editar" aria-label="Editar producto">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
                        </svg>
                      </button>{' '}
                      <button type="button" className={Number(row.status) === 1 ? 'products-row-action products-row-action-toggle is-danger' : 'products-row-action products-row-action-toggle is-ok'} onClick={() => void toggleProduct(row)} title={Number(row.status) === 1 ? 'Desactivar' : 'Activar'} aria-label={Number(row.status) === 1 ? 'Desactivar producto' : 'Activar producto'}>
                        {Number(row.status) === 1 ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 6l12 12"></path>
                            <path d="M18 6L6 18"></path>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedProducts.length === 0 && (
                  <tr>
                    <td colSpan={11}>No hay registros para el filtro actual.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalProductsPages > 1 && (
              <div className="inventory-pagination">
                <button
                  type="button"
                  onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
                  disabled={productsPage === 1}
                >
                  ← Anterior
                </button>
                <span className="pagination-info">
                  Página {productsPage} de {totalProductsPages}
                </span>
                <button
                  type="button"
                  onClick={() => setProductsPage((p) => Math.min(totalProductsPages, p + 1))}
                  disabled={productsPage === totalProductsPages}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {showFormModal && (
        <div className="products-form-modal-overlay" onClick={() => !loading && resetForm()}>
          <div className="products-form-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="products-form-modal-close" onClick={() => resetForm()}>✕</button>
            <form className="grid-form entity-editor products-editor products-modal-editor" onSubmit={saveProduct}>
              <h4>{editingId ? `Editar producto #${editingId}` : 'Nuevo producto'}</h4>
              <p className="products-form-help products-field-span-full">
                Completa primero la información base y luego la clasificación comercial.
              </p>
              <div className="products-form-stepper products-field-span-full">
                <button type="button" className={formStep === 1 ? 'active' : ''} onClick={() => setFormStep(1)}>1. Identificación</button>
                <button type="button" className={formStep === 2 ? 'active' : ''} onClick={() => setFormStep(2)}>2. Clasificación</button>
                <button type="button" className={formStep === 3 ? 'active' : ''} onClick={() => setFormStep(3)}>3. Precios y cierre</button>
              </div>
              {hasInactiveSelectedMaster && (
                <p className="notice products-field-span-full" style={{ marginTop: '-2px' }}>
                  Este producto tiene un maestro asociado inactivo o no disponible. Se muestra como valor actual para que puedas mantenerlo o cambiarlo.
                </p>
              )}
              {formStep === 1 && (
                <>
              <div className="products-section-title products-field-span-full">Identificación</div>
              <label>
                SKU
                <input value={form.sku} onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))} />
              </label>
              <label>
                Codigo de barras
                <input value={form.barcode} onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))} />
              </label>
              <label>
                Nombre
                <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
                </>
              )}

              {formStep === 2 && (
                <>
              <div className="products-section-title products-field-span-full">Clasificación</div>
              <label>
                Unidad
                <select
                  value={form.unit_id ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, unit_id: event.target.value ? Number(event.target.value) : null }))}
                >
                  <option value="">Seleccionar</option>
                  {units.map((row) => (
                    <option key={row.id} value={row.id}>{(row.code ?? '').trim()} {row.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Categoria
                <select
                  value={form.category_id ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value ? Number(event.target.value) : null }))}
                >
                  <option value="">Seleccionar</option>
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Tipo
                <select
                  value={form.product_nature}
                  onChange={(event) => setForm((prev) => ({ ...prev, product_nature: event.target.value as 'PRODUCT' | 'SUPPLY' }))}
                >
                  <option value="PRODUCT">{isRestaurant ? 'Producto de carta (plato/bebida)' : 'Producto'}</option>
                  <option value="SUPPLY">Insumo</option>
                </select>
              </label>

              <div className="master-select-row products-master-field">
                <label>
                  Línea
                  <select
                    value={form.line_id ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, line_id: event.target.value ? Number(event.target.value) : null }))}
                  >
                    <option value="">Sin línea</option>
                    {form.line_id !== null && !lines.some((r) => r.id === form.line_id && r.status === 1) && (
                      <option value={form.line_id}>Actual: {lineNameById.get(form.line_id) ?? `ID ${form.line_id}`} (inactiva)</option>
                    )}
                    {lines.filter((r) => r.status === 1).map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </label>
                <div className="master-quick-add">
                  <input
                    placeholder="Nueva línea..."
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void quickCreateMaster('line', newLineName, setLines, 'line_id', () => setNewLineName('')); } }}
                  />
                  <button
                    type="button"
                    disabled={!canManageProductMasters || masterSavingKind !== null || !newLineName.trim()}
                    onClick={() => void quickCreateMaster('line', newLineName, setLines, 'line_id', () => setNewLineName(''))}
                  >
              {masterSavingKind === 'line' ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>

        <div className="products-section-title products-field-span-full">Precios y datos adicionales</div>

        <div className="master-select-row products-master-field">
          <label>
            Marca
            <select
              value={form.brand_id ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, brand_id: event.target.value ? Number(event.target.value) : null }))}
            >
              <option value="">Sin marca</option>
              {form.brand_id !== null && !brands.some((r) => r.id === form.brand_id && r.status === 1) && (
                <option value={form.brand_id}>Actual: {brandNameById.get(form.brand_id) ?? `ID ${form.brand_id}`} (inactiva)</option>
              )}
              {brands.filter((r) => r.status === 1).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <div className="master-quick-add">
            <input
              placeholder="Nueva marca..."
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void quickCreateMaster('brand', newBrandName, setBrands, 'brand_id', () => setNewBrandName('')); } }}
            />
            <button
              type="button"
              disabled={!canManageProductMasters || masterSavingKind !== null || !newBrandName.trim()}
              onClick={() => void quickCreateMaster('brand', newBrandName, setBrands, 'brand_id', () => setNewBrandName(''))}
            >
              {masterSavingKind === 'brand' ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>

        <div className="master-select-row products-master-field">
          <label>
            Ubicación
            <select
              value={form.location_id ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, location_id: event.target.value ? Number(event.target.value) : null }))}
            >
              <option value="">Sin ubicación</option>
              {form.location_id !== null && !locations.some((r) => r.id === form.location_id && r.status === 1) && (
                <option value={form.location_id}>Actual: {locationNameById.get(form.location_id) ?? `ID ${form.location_id}`} (inactiva)</option>
              )}
              {locations.filter((r) => r.status === 1).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <div className="master-quick-add">
            <input
              placeholder="Nueva ubicación..."
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void quickCreateMaster('location', newLocationName, setLocations, 'location_id', () => setNewLocationName('')); } }}
            />
            <button
              type="button"
              disabled={!canManageProductMasters || masterSavingKind !== null || !newLocationName.trim()}
              onClick={() => void quickCreateMaster('location', newLocationName, setLocations, 'location_id', () => setNewLocationName(''))}
            >
              {masterSavingKind === 'location' ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>

        <div className="master-select-row products-master-field">
          <label>
            Garantía
            <select
              value={form.warranty_id ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, warranty_id: event.target.value ? Number(event.target.value) : null }))}
            >
              <option value="">Sin garantía</option>
              {form.warranty_id !== null && !warranties.some((r) => r.id === form.warranty_id && r.status === 1) && (
                <option value={form.warranty_id}>Actual: {warrantyNameById.get(form.warranty_id) ?? `ID ${form.warranty_id}`} (inactiva)</option>
              )}
              {warranties.filter((r) => r.status === 1).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <div className="master-quick-add">
            <input
              placeholder="Nueva garantía..."
              value={newWarrantyName}
              onChange={(e) => setNewWarrantyName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void quickCreateMaster('warranty', newWarrantyName, setWarranties, 'warranty_id', () => setNewWarrantyName('')); } }}
            />
            <button
              type="button"
              disabled={!canManageProductMasters || masterSavingKind !== null || !newWarrantyName.trim()}
              onClick={() => void quickCreateMaster('warranty', newWarrantyName, setWarranties, 'warranty_id', () => setNewWarrantyName(''))}
            >
              {masterSavingKind === 'warranty' ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>
          </>
        )}

        {formStep === 3 && (
          <>
        <div className="products-section-title products-field-span-full">Precios y datos adicionales</div>
        <label>
          Código SUNAT
          <input
            value={form.sunat_code}
            maxLength={40}
            onChange={(event) => setForm((prev) => ({ ...prev, sunat_code: event.target.value }))}
          />
        </label>
        <label>
          Comisión vendedor (%)
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.seller_commission_percent}
            onChange={(event) => setForm((prev) => ({ ...prev, seller_commission_percent: Number(event.target.value) }))}
          />
        </label>
        <label>
          Precio venta
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.sale_price}
            onChange={(event) => setForm((prev) => ({ ...prev, sale_price: Number(event.target.value) }))}
          />
        </label>
        <label>
          Precio costo
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.cost_price}
            onChange={(event) => setForm((prev) => ({ ...prev, cost_price: Number(event.target.value) }))}
          />
        </label>
        <label>
          URL Imagen
          <input
            value={form.image_url}
            maxLength={500}
            placeholder="https://..."
            onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
          />
        </label>
        {form.image_url && (
          <div className="product-image-preview products-field-span-full">
            <img src={form.image_url} alt="Vista previa" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <label className="products-checkbox-field">
          <input
            type="checkbox"
            checked={form.is_stockable}
            onChange={(event) => setForm((prev) => ({ ...prev, is_stockable: event.target.checked }))}
          />
          Es stockeable
        </label>
        <label className="products-checkbox-field">
          <input
            type="checkbox"
            checked={form.lot_tracking}
            onChange={(event) => setForm((prev) => ({ ...prev, lot_tracking: event.target.checked }))}
          />
          Control por lote
        </label>
        <label className="products-checkbox-field">
          <input
            type="checkbox"
            checked={form.has_expiration}
            onChange={(event) => setForm((prev) => ({ ...prev, has_expiration: event.target.checked }))}
          />
          Control de vencimiento
        </label>
        <label>
          Estado
          <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: Number(event.target.value) }))}>
            <option value={1}>ACTIVO</option>
            <option value={0}>INACTIVO</option>
          </select>
        </label>
          </>
        )}
        <div className="entity-actions wide products-modal-actions">
          {formStep > 1 && (
            <button type="button" onClick={() => setFormStep((prev) => (Math.max(1, prev - 1) as ProductFormStep))}>
              Anterior
            </button>
          )}
          {formStep < 3 && (
            <button
              type="button"
              onClick={() => setFormStep((prev) => (Math.min(3, prev + 1) as ProductFormStep))}
              disabled={formStep === 1 && !form.name.trim()}
            >
              Siguiente
            </button>
          )}
          {formStep === 3 && (
            <button type="submit" disabled={loading || !canManageProducts}>{editingId ? 'Guardar cambios' : 'Crear producto'}</button>
          )}
          <button type="button" onClick={() => resetForm()}>Limpiar</button>
          <button type="button" className="danger" onClick={() => resetForm()}>Cerrar</button>
        </div>
            </form>
          </div>
        </div>
      )}

      {uiTab === 'maestros' && (
      <section className="entity-editor product-masters-admin">
        <h4>Configurar maestros de producto</h4>
        {!canManageProductMasters && (
          <p className="notice">Tu perfil no tiene permiso para editar maestros. Solo puedes consultar.</p>
        )}

        <div className="master-admin-grid">
          <article>
            <h5>Líneas <small>{lines.length}</small></h5>
            <ul>
              {lines.map((row) => (
                <li key={`line-${row.id}`}>
                  <div className="master-item-main">
                    <span className="master-item-name">{row.name}</span>
                    <span className="master-item-status">{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</span>
                  </div>
                  <button type="button" disabled={!canManageProductMasters} onClick={() => setEditingMaster({ kind: 'line', id: row.id, name: row.name, status: row.status })}>Editar</button>
                </li>
              ))}
              {lines.length === 0 && <li className="empty">Sin líneas</li>}
            </ul>
          </article>

          <article>
            <h5>Marcas <small>{brands.length}</small></h5>
            <ul>
              {brands.map((row) => (
                <li key={`brand-${row.id}`}>
                  <div className="master-item-main">
                    <span className="master-item-name">{row.name}</span>
                    <span className="master-item-status">{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</span>
                  </div>
                  <button type="button" disabled={!canManageProductMasters} onClick={() => setEditingMaster({ kind: 'brand', id: row.id, name: row.name, status: row.status })}>Editar</button>
                </li>
              ))}
              {brands.length === 0 && <li className="empty">Sin marcas</li>}
            </ul>
          </article>

          <article>
            <h5>Ubicaciones <small>{locations.length}</small></h5>
            <ul>
              {locations.map((row) => (
                <li key={`location-${row.id}`}>
                  <div className="master-item-main">
                    <span className="master-item-name">{row.name}</span>
                    <span className="master-item-status">{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</span>
                  </div>
                  <button type="button" disabled={!canManageProductMasters} onClick={() => setEditingMaster({ kind: 'location', id: row.id, name: row.name, status: row.status })}>Editar</button>
                </li>
              ))}
              {locations.length === 0 && <li className="empty">Sin ubicaciones</li>}
            </ul>
          </article>

          <article>
            <h5>Garantías <small>{warranties.length}</small></h5>
            <ul>
              {warranties.map((row) => (
                <li key={`warranty-${row.id}`}>
                  <div className="master-item-main">
                    <span className="master-item-name">{row.name}</span>
                    <span className="master-item-status">{row.status === 1 ? 'ACTIVO' : 'INACTIVO'}</span>
                  </div>
                  <button type="button" disabled={!canManageProductMasters} onClick={() => setEditingMaster({ kind: 'warranty', id: row.id, name: row.name, status: row.status })}>Editar</button>
                </li>
              ))}
              {warranties.length === 0 && <li className="empty">Sin garantías</li>}
            </ul>
          </article>
        </div>

        {editingMaster && canManageProductMasters && (
          <div className="master-editor-inline">
            <strong>Editar {editingMaster.kind === 'line' ? 'Línea' : editingMaster.kind === 'brand' ? 'Marca' : editingMaster.kind === 'location' ? 'Ubicación' : 'Garantía'}</strong>
            <div className="master-editor-fields">
              <input
                value={editingMaster.name}
                onChange={(event) => setEditingMaster((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                maxLength={120}
              />
              <select
                value={editingMaster.status}
                onChange={(event) => setEditingMaster((prev) => (prev ? { ...prev, status: Number(event.target.value) } : prev))}
              >
                <option value={1}>ACTIVO</option>
                <option value={0}>INACTIVO</option>
              </select>
              <button type="button" onClick={() => void saveEditedMaster()} disabled={editingMasterSaving}>
                {editingMasterSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" className="danger" onClick={() => setEditingMaster(null)} disabled={editingMasterSaving}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
      )}

      {uiTab === 'comercial' && editingId && commercialConfig && (
        <section className="entity-editor product-commerce-panel">
          <h4>Configuracion comercial avanzada</h4>
          <p className="commerce-hint">
            Define unidades de venta, conversiones y precios mayoristas para este producto.
          </p>

          <div className="commerce-flags">
            <span className={commercialConfig.features.PRODUCT_MULTI_UOM ? 'flag-on' : 'flag-off'}>
              Multiples unidades: {commercialConfig.features.PRODUCT_MULTI_UOM ? 'ACTIVO' : 'INACTIVO'}
            </span>
            <span className={commercialConfig.features.PRODUCT_UOM_CONVERSIONS ? 'flag-on' : 'flag-off'}>
              Conversiones: {commercialConfig.features.PRODUCT_UOM_CONVERSIONS ? 'ACTIVO' : 'INACTIVO'}
            </span>
            <span className={commercialConfig.features.PRODUCT_WHOLESALE_PRICING ? 'flag-on' : 'flag-off'}>
              Precio mayorista: {commercialConfig.features.PRODUCT_WHOLESALE_PRICING ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>

          {commercialConfig.features.PRODUCT_MULTI_UOM && (
            <div className="commerce-block">
              <h5>Unidades de venta del producto</h5>
              <div className="grid-form">
                <label>
                  Agregar unidad
                  <select
                    value={unitToAdd ?? ''}
                    onChange={(event) => setUnitToAdd(event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">Seleccionar</option>
                    {commercialConfig.enabled_units.map((row) => (
                      <option key={row.id} value={row.id}>
                        {(row.code ?? '').trim()} {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="entity-actions">
                  <button type="button" onClick={addCommercialUnit}>Agregar unidad</button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Base</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialUnits.map((row) => (
                      <tr key={row.unit_id}>
                        <td>{row.code} - {row.name}</td>
                        <td>
                          <input
                            type="radio"
                            name="base_unit"
                            checked={row.is_base}
                            onChange={() => setBaseUnit(row.unit_id)}
                          />
                        </td>
                        <td>
                          <select
                            value={row.status}
                            onChange={(event) =>
                              setCommercialUnits((prev) =>
                                prev.map((item) =>
                                  item.unit_id === row.unit_id ? { ...item, status: Number(event.target.value) } : item
                                )
                              )
                            }
                          >
                            <option value={1}>ACTIVO</option>
                            <option value={0}>INACTIVO</option>
                          </select>
                        </td>
                        <td>
                          <button type="button" className="danger" onClick={() => removeCommercialUnit(row.unit_id)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {commercialUnits.length === 0 && (
                      <tr>
                        <td colSpan={4}>No hay unidades de venta configuradas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {commercialConfig.features.PRODUCT_UOM_CONVERSIONS && (
            <div className="commerce-block">
              <h5>Conversiones por producto</h5>
              <div className="grid-form">
                <label>
                  Desde unidad
                  <select
                    value={conversionDraft.from_unit_id || ''}
                    onChange={(event) =>
                      setConversionDraft((prev) => ({ ...prev, from_unit_id: Number(event.target.value) || 0 }))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {commercialUnits.map((row) => (
                      <option key={row.unit_id} value={row.unit_id}>{row.code} - {row.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Hacia unidad
                  <select
                    value={conversionDraft.to_unit_id || ''}
                    onChange={(event) =>
                      setConversionDraft((prev) => ({ ...prev, to_unit_id: Number(event.target.value) || 0 }))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {commercialUnits.map((row) => (
                      <option key={row.unit_id} value={row.unit_id}>{row.code} - {row.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Factor
                  <input
                    type="number"
                    step="0.000001"
                    min="0.000001"
                    value={conversionDraft.conversion_factor}
                    onChange={(event) =>
                      setConversionDraft((prev) => ({ ...prev, conversion_factor: Number(event.target.value) || 0 }))
                    }
                  />
                </label>
                <div className="entity-actions">
                  <button type="button" onClick={addConversion}>Agregar conversion</button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Desde</th>
                      <th>Hacia</th>
                      <th>Factor</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialConversions.map((row, index) => (
                      <tr key={`${row.from_unit_id}-${row.to_unit_id}-${index}`}>
                        <td>{row.from_unit_code} - {row.from_unit_name}</td>
                        <td>{row.to_unit_code} - {row.to_unit_name}</td>
                        <td>{Number(row.conversion_factor).toFixed(6)}</td>
                        <td>
                          <select
                            value={row.status}
                            onChange={(event) =>
                              setCommercialConversions((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, status: Number(event.target.value) } : item
                                )
                              )
                            }
                          >
                            <option value={1}>ACTIVO</option>
                            <option value={0}>INACTIVO</option>
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setCommercialConversions((prev) => prev.filter((_, idx) => idx !== index))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {commercialConversions.length === 0 && (
                      <tr>
                        <td colSpan={5}>No hay conversiones configuradas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {commercialConfig.features.PRODUCT_WHOLESALE_PRICING && (
            <div className="commerce-block">
              <h5>Precios por mayor</h5>
              <div className="grid-form">
                <label>
                  Escala
                  <select
                    value={wholesaleDraft.price_tier_id || ''}
                    onChange={(event) =>
                      setWholesaleDraft((prev) => ({ ...prev, price_tier_id: Number(event.target.value) || 0 }))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {(commercialConfig.price_tiers ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.min_qty} - {row.max_qty ?? '...'} )
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidad (opcional)
                  <select
                    value={wholesaleDraft.unit_id || ''}
                    onChange={(event) =>
                      setWholesaleDraft((prev) => ({ ...prev, unit_id: Number(event.target.value) || 0 }))
                    }
                  >
                    <option value="">Todas</option>
                    {commercialUnits.map((row) => (
                      <option key={row.unit_id} value={row.unit_id}>{row.code} - {row.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Precio unitario
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={wholesaleDraft.unit_price}
                    onChange={(event) =>
                      setWholesaleDraft((prev) => ({ ...prev, unit_price: Number(event.target.value) || 0 }))
                    }
                  />
                </label>
                <div className="entity-actions">
                  <button type="button" onClick={addWholesalePrice}>Agregar precio</button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Escala</th>
                      <th>Unidad</th>
                      <th>Precio</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialWholesale.map((row, index) => (
                      <tr key={`${row.price_tier_id}-${row.unit_id ?? 'all'}-${index}`}>
                        <td>{row.tier_name} ({row.min_qty} - {row.max_qty ?? '...'})</td>
                        <td>{row.unit_code ? `${row.unit_code} - ${row.unit_name}` : 'Todas'}</td>
                        <td>{Number(row.unit_price).toFixed(4)}</td>
                        <td>
                          <select
                            value={row.status}
                            onChange={(event) =>
                              setCommercialWholesale((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, status: Number(event.target.value) } : item
                                )
                              )
                            }
                          >
                            <option value={1}>ACTIVO</option>
                            <option value={0}>INACTIVO</option>
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => setCommercialWholesale((prev) => prev.filter((_, idx) => idx !== index))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {commercialWholesale.length === 0 && (
                      <tr>
                        <td colSpan={5}>No hay precios por mayor configurados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="entity-actions wide">
            <button type="button" onClick={() => void saveCommercialConfig()} disabled={commercialLoading}>
              {commercialLoading ? 'Guardando...' : 'Guardar configuracion comercial'}
            </button>
          </div>
        </section>
      )}

      {uiTab === 'comercial' && (!editingId || !commercialConfig) && (
        <section className="entity-editor product-commerce-panel">
          <h4>Configuración comercial avanzada</h4>
          <p className="commerce-hint">Selecciona un producto desde Catálogo y pulsa Editar para habilitar esta sección.</p>
          <div className="entity-actions">
            <button type="button" onClick={() => setUiTab('catalogo')}>Ir al catálogo</button>
          </div>
        </section>
      )}
    </section>
  );
}
