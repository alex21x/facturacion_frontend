import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/client';
import { fetchInventoryProducts } from '../../inventory/api';
import type { InventoryProduct } from '../../inventory/types';

type ProductsViewProps = {
  accessToken: string;
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

type ProductFormState = {
  sku: string;
  barcode: string;
  name: string;
  unit_id: number | null;
  category_id: number | null;
  sale_price: number;
  cost_price: number;
  is_stockable: boolean;
  lot_tracking: boolean;
  has_expiration: boolean;
  status: number;
};

const EMPTY_FORM: ProductFormState = {
  sku: '',
  barcode: '',
  name: '',
  unit_id: null,
  category_id: null,
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

async function fetchProductLookups(accessToken: string): Promise<{ units: ProductLookup[]; categories: ProductLookup[] }> {
  return apiClient.request('/api/inventory/product-lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
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

export function ProductsView({ accessToken }: ProductsViewProps) {
  const [rows, setRows] = useState<InventoryProduct[]>([]);
  const [units, setUnits] = useState<ProductLookup[]>([]);
  const [categories, setCategories] = useState<ProductLookup[]>([]);
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

  const activeCount = useMemo(() => rows.filter((row) => Number(row.status) === 1).length, [rows]);

  async function loadProducts() {
    setLoading(true);
    setMessage('');

    try {
      const [data, lookups] = await Promise.all([
        fetchInventoryProducts(accessToken, {
          search: search.trim() || undefined,
          status: status === 'all' ? null : Number(status),
        }),
        fetchProductLookups(accessToken),
      ]);
      setRows(data);
      setUnits(lookups.units ?? []);
      setCategories(lookups.categories ?? []);
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

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCommercialConfig(null);
    setCommercialUnits([]);
    setCommercialConversions([]);
    setCommercialWholesale([]);
    setUnitToAdd(null);
  }

  async function startEdit(row: InventoryProduct) {
    setEditingId(row.id);
    setForm({
      sku: row.sku ?? '',
      barcode: row.barcode ?? '',
      name: row.name,
      unit_id: row.unit_id,
      category_id: null,
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

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (editingId) {
        await updateProduct(accessToken, editingId, form);
        setMessage('Producto actualizado correctamente.');
      } else {
        await createProduct(accessToken, form);
        setMessage('Producto creado correctamente.');
      }

      resetForm();
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar producto');
    } finally {
      setLoading(false);
    }
  }

  async function toggleProduct(row: InventoryProduct) {
    try {
      await updateProduct(accessToken, row.id, { status: Number(row.status) === 1 ? 0 : 1 });
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado del producto');
    }
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Productos</h3>
        <button type="button" onClick={() => void loadProducts()} disabled={loading}>
          Refrescar
        </button>
      </div>

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
        <div className="entity-filter-action">
          <button type="button" onClick={() => void loadProducts()} disabled={loading}>
            Buscar
          </button>
        </div>
      </div>

      <form className="grid-form entity-editor" onSubmit={saveProduct}>
        <h4>{editingId ? `Editar producto #${editingId}` : 'Nuevo producto'}</h4>
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
          <input
            type="checkbox"
            checked={form.is_stockable}
            onChange={(event) => setForm((prev) => ({ ...prev, is_stockable: event.target.checked }))}
          />
          Es stockeable
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.lot_tracking}
            onChange={(event) => setForm((prev) => ({ ...prev, lot_tracking: event.target.checked }))}
          />
          Control por lote
        </label>
        <label>
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
        <div className="entity-actions wide">
          <button type="submit" disabled={loading}>{editingId ? 'Guardar cambios' : 'Crear producto'}</button>
          <button type="button" className="danger" onClick={resetForm}>Limpiar</button>
        </div>
      </form>

      {editingId && commercialConfig && (
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

      {message && <p className="notice">{message}</p>}

      <div className="stat-grid">
        <article>
          <span>Total productos</span>
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
      </div>

      <div className="table-wrap">
        <h4>Catalogo de productos</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Unidad</th>
              <th>Precio Venta</th>
              <th>Precio Costo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.sku ?? '-'}</td>
                <td>{row.name}</td>
                <td>{row.unit_code ?? row.unit_name ?? '-'}</td>
                <td>{row.sale_price}</td>
                <td>{row.cost_price}</td>
                <td>{Number(row.status) === 1 ? 'ACTIVO' : 'INACTIVO'}</td>
                <td>
                  <button type="button" onClick={() => startEdit(row)}>Editar</button>{' '}
                  <button type="button" onClick={() => void toggleProduct(row)}>
                    {Number(row.status) === 1 ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>No hay productos para el filtro actual.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
