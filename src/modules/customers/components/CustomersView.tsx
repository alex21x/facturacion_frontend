import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/client';
import '../customers.css';

type CustomerRow = {
  id: number;
  doc_type: string | null;
  customer_type_id: number | null;
  customer_type_name?: string | null;
  customer_type_sunat_code?: number | null;
  doc_number: string | null;
  name: string;
  trade_name: string | null;
  plate: string | null;
  address: string | null;
  status: number;
  default_tier_id: number | null;
  default_tier_code: string | null;
  default_tier_name: string | null;
  discount_percent: number;
  price_profile_status: number;
};

type PriceTierOption = {
  id: number;
  code: string;
  name: string;
  status: number;
};

type CustomerTypeOption = {
  id: number;
  name: string;
  sunat_code: number;
  sunat_abbr: string | null;
  is_active: boolean;
};

type CustomerFormState = {
  doc_type: string;
  customer_type_id: number | null;
  doc_number: string;
  legal_name: string;
  trade_name: string;
  first_name: string;
  last_name: string;
  plate: string;
  address: string;
  status: number;
  default_tier_id: number | null;
  discount_percent: number;
  price_profile_status: number;
};

type CommerceFeatureRow = {
  feature_code: string;
  is_enabled: boolean;
};

type CustomerVehicleRow = {
  id: number;
  customer_id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  is_default: boolean;
  status: number;
};

type CustomerVehicleFormState = {
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  vin: string;
  is_default: boolean;
};

type CustomersViewProps = {
  accessToken: string;
};

const PAGE_SIZE = 10;

function PlusColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#E8F9F0" stroke="#86D2A7" strokeWidth="1.4" />
      <path d="M12 7v10M7 12h10" stroke="#1C9B5F" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function RefreshColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.1-5.4" stroke="#2A77D8" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 5v6h-6" stroke="#18A0FB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.1" fill="#8ED1FF" />
    </svg>
  );
}

function EditColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4z" fill="#FCE7A4" stroke="#C0840A" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 6l4 4" stroke="#9A3412" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 20h8" stroke="#CA8A04" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ToggleOffColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#FEE2E2" stroke="#F87171" strokeWidth="1.6" />
      <path d="M8 8l8 8" stroke="#B91C1C" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function ToggleOnColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#DCFCE7" stroke="#4ADE80" strokeWidth="1.6" />
      <path d="M8 12l2.6 2.6L16.6 9" stroke="#15803D" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VehicleColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 14l1.4-4.3A2.8 2.8 0 0 1 7.6 7h8.8a2.8 2.8 0 0 1 2.7 2.2l1.4 4.8" fill="#DBEAFE" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 14h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z" fill="#BFDBFE" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="15.5" r="1.2" fill="#1D4ED8" />
      <circle cx="17" cy="15.5" r="1.2" fill="#1D4ED8" />
    </svg>
  );
}

function DeleteColorIcon() {
  return (
    <svg className="customers-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14" stroke="#DC2626" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 7V5h6v2" fill="#FCA5A5" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 7l1 12h6l1-12" fill="#FEE2E2" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" stroke="#B91C1C" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const EMPTY_FORM: CustomerFormState = {
  doc_type: '',
  customer_type_id: null,
  doc_number: '',
  legal_name: '',
  trade_name: '',
  first_name: '',
  last_name: '',
  plate: '',
  address: '',
  status: 1,
  default_tier_id: null,
  discount_percent: 0,
  price_profile_status: 1,
};

const EMPTY_VEHICLE_FORM: CustomerVehicleFormState = {
  plate: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  vin: '',
  is_default: false,
};

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function fetchCustomers(
  accessToken: string,
  params?: { q?: string; status?: number | null; limit?: number }
): Promise<CustomerRow[]> {
  const query = new URLSearchParams();
  query.set('limit', String(params?.limit ?? 120));

  if (params?.q) {
    query.set('q', params.q);
  }

  if (params?.status === 0 || params?.status === 1) {
    query.set('status', String(params.status));
  }

  const response = await apiClient.request<{ data: CustomerRow[] }>(`/api/sales/customers?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

async function createCustomer(accessToken: string, payload: CustomerFormState) {
  return apiClient.request('/api/sales/customers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

async function fetchPriceTiers(accessToken: string): Promise<PriceTierOption[]> {
  const response = await apiClient.request<{ data: PriceTierOption[] }>('/api/sales/price-tiers', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return (response.data ?? []).filter((row) => Number(row.status) === 1);
}

async function updateCustomer(accessToken: string, id: number, payload: Partial<CustomerFormState>) {
  return apiClient.request(`/api/sales/customers/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

async function fetchCustomerTypes(accessToken: string): Promise<CustomerTypeOption[]> {
  const response = await apiClient.request<{ data: CustomerTypeOption[] }>('/api/sales/customer-types', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data ?? [];
}

async function fetchWorkshopVehicleFeature(accessToken: string): Promise<boolean> {
  const response = await apiClient.request<{ commerce_features?: CommerceFeatureRow[] }>('/api/sales/lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return Boolean((response.commerce_features ?? []).find((row) => row.feature_code === 'SALES_WORKSHOP_MULTI_VEHICLE')?.is_enabled);
}

async function fetchCustomerVehicles(accessToken: string, customerId: number): Promise<CustomerVehicleRow[]> {
  const response = await apiClient.request<{ data: CustomerVehicleRow[] }>(`/api/sales/customers/${customerId}/vehicles`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data ?? [];
}

async function createCustomerVehicle(accessToken: string, customerId: number, payload: CustomerVehicleFormState) {
  return apiClient.request(`/api/sales/customers/${customerId}/vehicles`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      plate: payload.plate,
      brand: payload.brand || null,
      model: payload.model || null,
      year: payload.year ? Number(payload.year) : null,
      color: payload.color || null,
      vin: payload.vin || null,
      is_default: payload.is_default,
    }),
  });
}

async function updateCustomerVehicle(accessToken: string, customerId: number, vehicleId: number, payload: CustomerVehicleFormState) {
  return apiClient.request(`/api/sales/customers/${customerId}/vehicles/${vehicleId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      plate: payload.plate,
      brand: payload.brand || null,
      model: payload.model || null,
      year: payload.year ? Number(payload.year) : null,
      color: payload.color || null,
      vin: payload.vin || null,
      is_default: payload.is_default,
    }),
  });
}

async function deleteCustomerVehicle(accessToken: string, customerId: number, vehicleId: number) {
  return apiClient.request(`/api/sales/customers/${customerId}/vehicles/${vehicleId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

function inferFormFromRow(row: CustomerRow, customerTypes: CustomerTypeOption[]): CustomerFormState {
  const nameParts = (row.name ?? '').trim().split(/\s+/).filter(Boolean);
  const matchedType = customerTypes.find((type) => type.id === row.customer_type_id) ?? null;

  return {
    doc_type: row.doc_type ?? (matchedType ? String(matchedType.sunat_code) : ''),
    customer_type_id: row.customer_type_id ?? null,
    doc_number: row.doc_number ?? '',
    legal_name: row.name ?? '',
    trade_name: row.trade_name ?? '',
    first_name: nameParts[0] ?? '',
    last_name: nameParts.slice(1).join(' '),
    plate: row.plate ?? '',
    address: row.address ?? '',
    status: Number(row.status) === 1 ? 1 : 0,
    default_tier_id: row.default_tier_id ?? null,
    discount_percent: Number(row.discount_percent ?? 0),
    price_profile_status: Number(row.price_profile_status) === 0 ? 0 : 1,
  };
}

export function CustomersView({ accessToken }: CustomersViewProps) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | '1' | '0'>('1');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [priceTiers, setPriceTiers] = useState<PriceTierOption[]>([]);
  const [customerTypes, setCustomerTypes] = useState<CustomerTypeOption[]>([]);
  const [workshopVehiclesEnabled, setWorkshopVehiclesEnabled] = useState(false);
  const [vehicleRows, setVehicleRows] = useState<CustomerVehicleRow[]>([]);
  const [vehicleForm, setVehicleForm] = useState<CustomerVehicleFormState>(EMPTY_VEHICLE_FORM);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehiclesCustomer, setVehiclesCustomer] = useState<CustomerRow | null>(null);
  const [page, setPage] = useState(1);

  const activeCount = useMemo(() => rows.filter((row) => Number(row.status) === 1).length, [rows]);
  const inactiveCount = rows.length - activeCount;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);
  const searchHints = useMemo(() => {
    const suggestions = new Set<string>();

    rows.forEach((row) => {
      const doc = (row.doc_number ?? '').trim();
      const name = (row.name ?? '').trim();
      const trade = (row.trade_name ?? '').trim();
      const plate = (row.plate ?? '').trim();

      if (doc) {
        suggestions.add(doc);
      }
      if (name) {
        suggestions.add(name);
      }
      if (trade) {
        suggestions.add(trade);
      }
      if (plate) {
        suggestions.add(plate);
      }
      if (doc && name) {
        suggestions.add(`${doc} - ${name}`);
      }
    });

    return Array.from(suggestions).slice(0, 120);
  }, [rows]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  async function loadCustomers() {
    setLoading(true);
    setMessage('');

    try {
      const data = await fetchCustomers(accessToken, {
        q: search.trim() || undefined,
        status: status === 'all' ? null : Number(status),
      });
      setRows(data);
      setPage(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, status]);

  useEffect(() => {
    (async () => {
      try {
        const tiers = await fetchPriceTiers(accessToken);
        setPriceTiers(tiers);
      } catch {
        setPriceTiers([]);
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    (async () => {
      try {
        const types = await fetchCustomerTypes(accessToken);
        setCustomerTypes(types);
      } catch {
        setCustomerTypes([]);
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    (async () => {
      try {
        const enabled = await fetchWorkshopVehicleFeature(accessToken);
        setWorkshopVehiclesEnabled(enabled);
      } catch {
        setWorkshopVehiclesEnabled(false);
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    if (!workshopVehiclesEnabled || !isVehicleModalOpen || !vehiclesCustomer) {
      setVehicleRows([]);
      setVehicleForm(EMPTY_VEHICLE_FORM);
      setEditingVehicleId(null);
      return;
    }

    (async () => {
      try {
        const rowsData = await fetchCustomerVehicles(accessToken, vehiclesCustomer.id);
        setVehicleRows(rowsData);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo cargar vehiculos del cliente');
      }
    })();
  }, [accessToken, workshopVehiclesEnabled, isVehicleModalOpen, vehiclesCustomer]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function closeCustomerModal() {
    resetForm();
    setIsCustomerModalOpen(false);
  }

  function openCreateCustomerModal() {
    resetForm();
    setMessage('');
    setIsCustomerModalOpen(true);
  }

  function closeVehiclesModal() {
    setVehicleRows([]);
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setEditingVehicleId(null);
    setVehiclesCustomer(null);
    setIsVehicleModalOpen(false);
  }

  function startEdit(row: CustomerRow) {
    setEditingId(row.id);
    setForm(inferFormFromRow(row, customerTypes));
    setMessage('');
    setIsCustomerModalOpen(true);
  }

  function openVehiclesModal(row: CustomerRow) {
    setVehiclesCustomer(row);
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setEditingVehicleId(null);
    setMessage('');
    setIsVehicleModalOpen(true);
  }

  function startEditVehicle(row: CustomerVehicleRow) {
    setEditingVehicleId(row.id);
    setVehicleForm({
      plate: row.plate ?? '',
      brand: row.brand ?? '',
      model: row.model ?? '',
      year: row.year ? String(row.year) : '',
      color: row.color ?? '',
      vin: row.vin ?? '',
      is_default: Boolean(row.is_default),
    });
  }

  function resetVehicleForm() {
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setEditingVehicleId(null);
  }

  async function saveCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    if (!form.customer_type_id) {
      setMessage('Selecciona un tipo de cliente.');
      setLoading(false);
      return;
    }

    try {
      if (editingId) {
        await updateCustomer(accessToken, editingId, form);
        setMessage('Cliente actualizado correctamente.');
      } else {
        await createCustomer(accessToken, form);
        setMessage('Cliente creado correctamente.');
      }

      closeCustomerModal();
      await loadCustomers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar cliente');
    } finally {
      setLoading(false);
    }
  }

  async function toggleCustomer(row: CustomerRow) {
    try {
      await updateCustomer(accessToken, row.id, { status: Number(row.status) === 1 ? 0 : 1 });
      await loadCustomers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado del cliente');
    }
  }

  async function saveVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!vehiclesCustomer) {
      setMessage('Primero selecciona un cliente para gestionar vehiculos.');
      return;
    }

    if (!vehicleForm.plate.trim()) {
      setMessage('La placa es obligatoria.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (editingVehicleId) {
        await updateCustomerVehicle(accessToken, vehiclesCustomer.id, editingVehicleId, vehicleForm);
        setMessage('Vehiculo actualizado correctamente.');
      } else {
        await createCustomerVehicle(accessToken, vehiclesCustomer.id, vehicleForm);
        setMessage('Vehiculo creado correctamente.');
      }

      const rowsData = await fetchCustomerVehicles(accessToken, vehiclesCustomer.id);
      setVehicleRows(rowsData);
      resetVehicleForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar vehiculo');
    } finally {
      setLoading(false);
    }
  }

  async function removeVehicle(row: CustomerVehicleRow) {
    if (!vehiclesCustomer) {
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await deleteCustomerVehicle(accessToken, vehiclesCustomer.id, row.id);
      const rowsData = await fetchCustomerVehicles(accessToken, vehiclesCustomer.id);
      setVehicleRows(rowsData);
      if (editingVehicleId === row.id) {
        resetVehicleForm();
      }
      setMessage('Vehiculo eliminado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo eliminar vehiculo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-panel customers-module">
      <div className="module-header customers-module-header">
        <h3>Clientes</h3>
        <div className="workspace-mode-switch customers-header-actions">
          <button type="button" className="mode-btn mode-btn-active customers-header-btn" onClick={openCreateCustomerModal} disabled={loading}>
            <PlusColorIcon />
            Nuevo
          </button>
          <button type="button" className="mode-btn customers-header-btn" onClick={() => void loadCustomers()} disabled={loading}>
            <RefreshColorIcon />
            Refrescar
          </button>
        </div>
      </div>

      <div className="stat-grid customers-stat-grid">
        <article>
          <span>Total clientes</span>
          <strong>{rows.length}</strong>
        </article>
        <article>
          <span>Activos</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <span>Inactivos</span>
          <strong>{inactiveCount}</strong>
        </article>
      </div>

      <div className="grid-form entity-filters">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            list="customers-search-hints"
            autoComplete="off"
            placeholder="Documento, razon social, nombre, placa, marca o modelo"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void loadCustomers();
              }
            }}
          />
          <datalist id="customers-search-hints">
            {searchHints.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
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
          <button type="button" onClick={() => void loadCustomers()} disabled={loading}>
            Buscar
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      <div className="table-wrap customers-table-wrap">
        <h4>Catalogo de clientes</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Doc.</th>
              <th>Nombre</th>
              <th>Comercial</th>
              <th>Placa</th>
              <th>Direccion</th>
              <th>Perfil precio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.doc_type ?? '-'} {row.doc_number ?? ''}</td>
                <td>{row.name}</td>
                <td>{row.trade_name ?? '-'}</td>
                <td>{row.plate ?? '-'}</td>
                <td>{row.address ?? '-'}</td>
                <td>
                  {(row.default_tier_code || row.default_tier_name)
                    ? `${row.default_tier_code ?? ''} ${row.default_tier_name ?? ''}`.trim()
                    : 'Sin escala'}
                  {' | '}Dscto: {Number(row.discount_percent ?? 0).toFixed(2)}%
                  {' | '}{Number(row.price_profile_status) === 1 ? 'ACTIVO' : 'INACTIVO'}
                </td>
                <td>{Number(row.status) === 1 ? 'ACTIVO' : 'INACTIVO'}</td>
                <td>
                  <div className="customers-table-actions">
                    <button type="button" className="customers-icon-btn customers-icon-btn-edit" title="Editar cliente" onClick={() => startEdit(row)}>
                      <EditColorIcon />
                    </button>
                    <button
                      type="button"
                      className={Number(row.status) === 1 ? 'customers-icon-btn customers-icon-btn-toggle is-off' : 'customers-icon-btn customers-icon-btn-toggle is-on'}
                      title={Number(row.status) === 1 ? 'Desactivar cliente' : 'Activar cliente'}
                      aria-label={Number(row.status) === 1 ? 'Desactivar cliente' : 'Activar cliente'}
                      onClick={() => void toggleCustomer(row)}
                    >
                      {Number(row.status) === 1 ? (
                        <ToggleOffColorIcon />
                      ) : (
                        <ToggleOnColorIcon />
                      )}
                    </button>
                    {workshopVehiclesEnabled && (
                      <button type="button" className="customers-icon-btn customers-icon-btn-vehicles" title="Gestionar vehiculos" aria-label="Gestionar vehiculos" onClick={() => openVehiclesModal(row)}>
                        <VehicleColorIcon />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>No hay clientes para el filtro actual.</td>
              </tr>
            )}
          </tbody>
        </table>

        {rows.length > 0 && (
          <div className="ds-pagination customers-pagination">
            <button type="button" className="ds-btn-secondary" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
              Anterior
            </button>
            <span className="ds-hint">Pagina {page} de {totalPages}</span>
            <button type="button" className="ds-btn-secondary" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
              Siguiente
            </button>
          </div>
        )}
      </div>

      {isCustomerModalOpen && (
        <div className="ds-modal-overlay" role="presentation" onClick={closeCustomerModal}>
          <div className="ds-modal customers-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ds-modal__header">
              <h3>{editingId ? `Editar cliente #${editingId}` : 'Nuevo cliente'}</h3>
              <button type="button" className="ds-btn-close" onClick={closeCustomerModal}>×</button>
            </div>
            <div className="ds-modal__body">
              <form className="grid-form entity-editor customers-modal-form" onSubmit={saveCustomer}>
                <label>
                  Tipo documento
                  <select
                    value={form.customer_type_id ?? ''}
                    onChange={(event) => {
                      const selectedId = Number(event.target.value || 0);
                      const selectedType = customerTypes.find((type) => type.id === selectedId) ?? null;

                      setForm((prev) => ({
                        ...prev,
                        customer_type_id: selectedType ? selectedType.id : null,
                        doc_type: selectedType ? String(selectedType.sunat_code) : prev.doc_type,
                      }));
                    }}
                  >
                    <option value="">Selecciona tipo</option>
                    {customerTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.sunat_code} - {type.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Numero documento
                  <input value={form.doc_number} onChange={(event) => setForm((prev) => ({ ...prev, doc_number: event.target.value }))} />
                </label>
                <label>
                  Razon social / Nombre
                  <input value={form.legal_name} onChange={(event) => setForm((prev) => ({ ...prev, legal_name: event.target.value }))} />
                </label>
                <label>
                  Nombre comercial
                  <input value={form.trade_name} onChange={(event) => setForm((prev) => ({ ...prev, trade_name: event.target.value }))} />
                </label>
                <label>
                  Nombres
                  <input value={form.first_name} onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))} />
                </label>
                <label>
                  Apellidos
                  <input value={form.last_name} onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))} />
                </label>
                <label>
                  Placa
                  <input value={form.plate} onChange={(event) => setForm((prev) => ({ ...prev, plate: event.target.value }))} />
                </label>
                <label>
                  Direccion
                  <input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
                </label>
                <label>
                  Estado
                  <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: Number(event.target.value) }))}>
                    <option value={1}>ACTIVO</option>
                    <option value={0}>INACTIVO</option>
                  </select>
                </label>
                <label>
                  Escala precio cliente
                  <select
                    value={form.default_tier_id ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setForm((prev) => ({
                        ...prev,
                        default_tier_id: raw ? Number(raw) : null,
                      }));
                    }}
                  >
                    <option value="">Sin escala</option>
                    {priceTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>{tier.code} - {tier.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Descuento perfil (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.discount_percent}
                    onChange={(event) => setForm((prev) => ({ ...prev, discount_percent: Number(event.target.value || 0) }))}
                  />
                </label>
                <label>
                  Estado perfil precio
                  <select
                    value={form.price_profile_status}
                    onChange={(event) => setForm((prev) => ({ ...prev, price_profile_status: Number(event.target.value) }))}
                  >
                    <option value={1}>ACTIVO</option>
                    <option value={0}>INACTIVO</option>
                  </select>
                </label>
                <div className="entity-actions wide">
                  <button type="submit" disabled={loading}>{editingId ? 'Guardar cambios' : 'Crear cliente'}</button>
                  <button type="button" className="danger" onClick={closeCustomerModal}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {workshopVehiclesEnabled && isVehicleModalOpen && vehiclesCustomer && (
        <div className="ds-modal-overlay" role="presentation" onClick={closeVehiclesModal}>
          <div className="ds-modal customers-modal customers-vehicles-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ds-modal__header">
              <h3>Vehiculos de {vehiclesCustomer.name}</h3>
              <button type="button" className="ds-btn-close" onClick={closeVehiclesModal}>×</button>
            </div>
            <div className="ds-modal__body">
              <form className="grid-form entity-editor customers-modal-form" onSubmit={saveVehicle}>
                <label>
                  Placa
                  <input
                    value={vehicleForm.plate}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, plate: event.target.value }))}
                    placeholder="ABC123"
                  />
                </label>
                <label>
                  Marca
                  <input
                    value={vehicleForm.brand}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, brand: event.target.value }))}
                    placeholder="Toyota"
                  />
                </label>
                <label>
                  Modelo
                  <input
                    value={vehicleForm.model}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, model: event.target.value }))}
                    placeholder="Corolla"
                  />
                </label>
                <label>
                  Anio
                  <input
                    value={vehicleForm.year}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, year: event.target.value.replace(/[^0-9]/g, '') }))}
                    placeholder="2022"
                  />
                </label>
                <label>
                  Color
                  <input
                    value={vehicleForm.color}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, color: event.target.value }))}
                    placeholder="Blanco"
                  />
                </label>
                <label>
                  VIN
                  <input
                    value={vehicleForm.vin}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, vin: event.target.value }))}
                    placeholder="Opcional"
                  />
                </label>
                <label>
                  Predeterminado
                  <select
                    value={vehicleForm.is_default ? '1' : '0'}
                    onChange={(event) => setVehicleForm((prev) => ({ ...prev, is_default: event.target.value === '1' }))}
                  >
                    <option value="0">No</option>
                    <option value="1">Si</option>
                  </select>
                </label>
                <div className="entity-actions wide">
                  <button type="submit" disabled={loading}>{editingVehicleId ? 'Guardar vehiculo' : 'Agregar vehiculo'}</button>
                  <button type="button" className="danger" onClick={resetVehicleForm}>Limpiar vehiculo</button>
                </div>
              </form>

              <table>
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Anio</th>
                    <th>Predeterminado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.plate}</td>
                      <td>{row.brand ?? '-'}</td>
                      <td>{row.model ?? '-'}</td>
                      <td>{row.year ?? '-'}</td>
                      <td>{row.is_default ? 'SI' : 'NO'}</td>
                      <td>
                        <div className="customers-table-actions">
                          <button type="button" className="customers-icon-btn customers-icon-btn-edit" title="Editar vehiculo" onClick={() => startEditVehicle(row)}>
                            <EditColorIcon />
                          </button>
                          <button type="button" className="customers-icon-btn customers-icon-btn-delete" title="Eliminar vehiculo" aria-label="Eliminar vehiculo" onClick={() => void removeVehicle(row)}>
                            <DeleteColorIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {vehicleRows.length === 0 && (
                    <tr>
                      <td colSpan={6}>Este cliente aun no tiene vehiculos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
