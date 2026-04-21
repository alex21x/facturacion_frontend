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

type CustomersViewProps = {
  accessToken: string;
};

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

  const activeCount = useMemo(() => rows.filter((row) => Number(row.status) === 1).length, [rows]);

  async function loadCustomers() {
    setLoading(true);
    setMessage('');

    try {
      const data = await fetchCustomers(accessToken, {
        q: search.trim() || undefined,
        status: status === 'all' ? null : Number(status),
      });
      setRows(data);
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

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(row: CustomerRow) {
    setEditingId(row.id);
    setForm(inferFormFromRow(row, customerTypes));
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

      resetForm();
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

  return (
    <section className="module-panel customers-module">
      <div className="module-header customers-module-header">
        <h3>Clientes</h3>
        <button type="button" onClick={() => void loadCustomers()} disabled={loading}>
          Refrescar
        </button>
      </div>

      <div className="grid-form entity-filters">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Documento, razon social, nombre o placa"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void loadCustomers();
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
          <button type="button" onClick={() => void loadCustomers()} disabled={loading}>
            Buscar
          </button>
        </div>
      </div>

      <form className="grid-form entity-editor" onSubmit={saveCustomer}>
        <h4>{editingId ? `Editar cliente #${editingId}` : 'Nuevo cliente'}</h4>
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
          <button type="button" className="danger" onClick={resetForm}>Limpiar</button>
        </div>
      </form>

      {message && <p className="notice">{message}</p>}

      <div className="stat-grid">
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
          <strong>{rows.length - activeCount}</strong>
        </article>
      </div>

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
            {rows.map((row) => (
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
                  <button type="button" className="customers-row-action customers-row-action-edit" onClick={() => startEdit(row)}>✏ Editar</button>{' '}
                  <button type="button" className={Number(row.status) === 1 ? 'customers-row-action customers-row-action-toggle is-danger' : 'customers-row-action customers-row-action-toggle is-ok'} onClick={() => void toggleCustomer(row)}>
                    {Number(row.status) === 1 ? '⏸ Desactivar' : '✓ Activar'}
                  </button>
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
      </div>
    </section>
  );
}
