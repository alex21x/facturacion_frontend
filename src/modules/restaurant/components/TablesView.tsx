import { useEffect, useState } from 'react';
import { createRestaurantTable, fetchRestaurantTables, updateRestaurantTable } from '../api';
import type { RestaurantTableRow, RestaurantTableStatus } from '../types';

type Props = {
  accessToken: string;
  branchId: number | null;
};

const STATUS_LABEL: Record<RestaurantTableStatus, string> = {
  AVAILABLE: 'Disponible',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  DISABLED: 'Fuera de servicio',
};

const FLOOR_GROUPS: Array<{
  status: RestaurantTableStatus;
  title: string;
  hint: string;
}> = [
  { status: 'AVAILABLE', title: 'Sala libre', hint: 'Listas para recibir clientes' },
  { status: 'OCCUPIED', title: 'En servicio', hint: 'Mesas con atencion activa' },
  { status: 'RESERVED', title: 'Reservadas', hint: 'Bloqueadas para proximas llegadas' },
  { status: 'DISABLED', title: 'Fuera de servicio', hint: 'No disponibles temporalmente' },
];

function tableStatusBadgeClass(status: RestaurantTableStatus): string {
  if (status === 'AVAILABLE') return 'restaurant-status-pill restaurant-status-pill--available';
  if (status === 'OCCUPIED') return 'restaurant-status-pill restaurant-status-pill--occupied';
  if (status === 'RESERVED') return 'restaurant-status-pill restaurant-status-pill--reserved';
  return 'restaurant-status-pill restaurant-status-pill--disabled';
}

function tableShapeClass(capacity: number): string {
  if (capacity <= 2) return 'restaurant-table-figure restaurant-table-figure--small';
  if (capacity <= 4) return 'restaurant-table-figure restaurant-table-figure--medium';
  if (capacity <= 6) return 'restaurant-table-figure restaurant-table-figure--large';
  return 'restaurant-table-figure restaurant-table-figure--wide';
}

export function TablesView({ accessToken, branchId }: Props) {
  const [rows, setRows] = useState<RestaurantTableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RestaurantTableStatus | ''>('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState(4);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetchRestaurantTables(accessToken, {
        branchId,
        status: statusFilter,
        search,
      });
      setRows(res.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar mesas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, statusFilter]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!branchId) {
      setMessage('Selecciona una sucursal para crear mesas.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await createRestaurantTable(accessToken, {
        branch_id: branchId,
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        capacity: Math.max(1, Number(newCapacity)),
      });
      setNewCode('');
      setNewName('');
      setNewCapacity(4);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear mesa');
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id: number, status: RestaurantTableStatus) {
    setBusyId(id);
    setMessage('');
    try {
      await updateRestaurantTable(accessToken, id, { status });
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar mesa');
    } finally {
      setBusyId(null);
    }
  }

  const summary = {
    total: rows.length,
    available: rows.filter((row) => row.status === 'AVAILABLE').length,
    occupied: rows.filter((row) => row.status === 'OCCUPIED').length,
    reserved: rows.filter((row) => row.status === 'RESERVED').length,
  };

  const groupedRows = FLOOR_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.status === group.status),
  }));

  return (
    <section className="module-panel restaurant-panel">
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Salon</p>
          <h3>Mesas</h3>
          <p className="restaurant-toolbar__copy">Distribucion visual de mesas, capacidad y ocupacion por sucursal.</p>
        </div>
        <div className="restaurant-toolbar__actions">
          <span className="restaurant-toolbar__context">Sucursal: {branchId ?? 'Sin seleccionar'}</span>
          <button type="button" className="restaurant-ghost-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Refrescar'}
          </button>
        </div>
      </div>

      <div className="restaurant-stats restaurant-stats--four">
        <article className="restaurant-stat"><span>Total</span><strong>{summary.total}</strong><small>Mesas visibles</small></article>
        <article className="restaurant-stat"><span>Disponibles</span><strong>{summary.available}</strong><small>Listas para recibir</small></article>
        <article className="restaurant-stat"><span>Ocupadas</span><strong>{summary.occupied}</strong><small>Atencion en curso</small></article>
        <article className="restaurant-stat"><span>Reservadas</span><strong>{summary.reserved}</strong><small>Bloqueadas temporalmente</small></article>
      </div>

      <div className="restaurant-layout">
        <form className="restaurant-create-card" onSubmit={handleCreate}>
          <div className="restaurant-create-card__head">
            <h4>Nueva mesa</h4>
            <p>Alta rapida para salon, terraza o barra.</p>
          </div>
          <label className="restaurant-field">
            <span>Codigo</span>
            <input className="restaurant-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="M01" required />
          </label>
          <label className="restaurant-field">
            <span>Nombre</span>
            <input className="restaurant-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Terraza 1" required />
          </label>
          <label className="restaurant-field">
            <span>Capacidad</span>
            <input className="restaurant-input" type="number" min={1} max={30} value={newCapacity} onChange={(e) => setNewCapacity(Number(e.target.value || 1))} required />
          </label>
          <button type="submit" className="restaurant-primary-btn" disabled={loading || !branchId}>Crear mesa</button>
        </form>

        <div className="restaurant-content-card">
          <div className="restaurant-filters restaurant-filters--inline">
            <label className="restaurant-field restaurant-field--wide">
              <span>Buscar mesa</span>
              <input
                className="restaurant-input"
                placeholder="Codigo o nombre"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void load();
                  }
                }}
              />
            </label>
            <label className="restaurant-field">
              <span>Estado</span>
              <select className="restaurant-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RestaurantTableStatus | '')}>
                <option value="">Todos</option>
                <option value="AVAILABLE">Disponible</option>
                <option value="OCCUPIED">Ocupada</option>
                <option value="RESERVED">Reservada</option>
                <option value="DISABLED">Fuera de servicio</option>
              </select>
            </label>
          </div>

          {message && <p className="notice restaurant-notice">{message}</p>}

          {rows.length === 0 ? (
            <div className="restaurant-empty-state">
              <strong>{loading ? 'Cargando mesas...' : 'No hay mesas registradas'}</strong>
              <p>Crea una mesa o ajusta los filtros para ver resultados.</p>
            </div>
          ) : (
            <div className="restaurant-floor-plan">
              {groupedRows.map((group) => (
                <section key={group.status} className={`restaurant-floor-zone restaurant-floor-zone--${group.status.toLowerCase()}`}>
                  <header className="restaurant-floor-zone__head">
                    <div>
                      <h4>{group.title}</h4>
                      <p>{group.hint}</p>
                    </div>
                    <strong>{group.rows.length}</strong>
                  </header>

                  {group.rows.length === 0 ? (
                    <div className="restaurant-floor-zone__empty">Sin mesas en esta zona.</div>
                  ) : (
                    <div className="restaurant-tables-grid">
                      {group.rows.map((row) => (
                        <article key={row.id} className={`restaurant-table-card restaurant-table-card--${row.status.toLowerCase()}`}>
                          <div className="restaurant-table-card__head">
                            <div>
                              <p className="restaurant-table-card__code">{row.code}</p>
                              <h4>{row.name}</h4>
                            </div>
                            <span className={tableStatusBadgeClass(row.status)}>{STATUS_LABEL[row.status]}</span>
                          </div>

                          <div className="restaurant-table-visual">
                            <div className={tableShapeClass(row.capacity)}>
                              <span>{row.code}</span>
                            </div>
                            <div className="restaurant-table-seats">
                              {Array.from({ length: Math.min(row.capacity, 8) }, (_, index) => (
                                <span key={`${row.id}-seat-${index}`} className="restaurant-table-seat" aria-hidden="true" />
                              ))}
                            </div>
                          </div>

                          <div className="restaurant-table-card__capacity">
                            <span>Capacidad</span>
                            <strong>{row.capacity} pax</strong>
                          </div>

                          <div className="restaurant-table-card__actions">
                            <button type="button" className="restaurant-stage-btn restaurant-stage-btn--free" disabled={busyId === row.id || row.status === 'AVAILABLE'} onClick={() => void changeStatus(row.id, 'AVAILABLE')}>Disponible</button>
                            <button type="button" className="restaurant-stage-btn restaurant-stage-btn--prep" disabled={busyId === row.id || row.status === 'OCCUPIED'} onClick={() => void changeStatus(row.id, 'OCCUPIED')}>Ocupada</button>
                            <button type="button" className="restaurant-stage-btn restaurant-stage-btn--reserved" disabled={busyId === row.id || row.status === 'RESERVED'} onClick={() => void changeStatus(row.id, 'RESERVED')}>Reservar</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
