import { useEffect, useMemo, useState } from 'react';
import {
  createRacingEventCost,
  createRacingChecklistItem,
  createRacingEvent,
  createRacingInventoryAssignment,
  createRacingMaintenance,
  createRacingVehicle,
  fetchInventoryProductAutocomplete,
  fetchInventoryProductLookups,
  fetchRacingAlerts,
  fetchRacingBootstrap,
  fetchRacingChecklist,
  fetchRacingEventCostSummary,
  fetchRacingEventCosts,
  fetchRacingVehicleHistory,
  updateRacingChecklistItem,
} from '../api';
import type {
  RacingChecklistItem,
  RacingEvent,
  RacingAlertsResponse,
  RacingEventCost,
  RacingEventCostSummaryRow,
  InventoryProductAutocompleteRow,
  InventoryLookupCategoryRow,
  RacingVehicle,
  RacingVehicleHistoryResponse,
} from '../types';
import '../racing.css';

type Props = {
  accessToken: string;
};

export function RacingOperationsView({ accessToken }: Props) {
  const [vehicles, setVehicles] = useState<RacingVehicle[]>([]);
  const [events, setEvents] = useState<RacingEvent[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [vehicleHistory, setVehicleHistory] = useState<RacingVehicleHistoryResponse | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<RacingChecklistItem[]>([]);
  const [eventCosts, setEventCosts] = useState<RacingEventCost[]>([]);
  const [costSummary, setCostSummary] = useState<RacingEventCostSummaryRow[]>([]);
  const [alerts, setAlerts] = useState<RacingAlertsResponse | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<InventoryProductAutocompleteRow[]>([]);
  const [productCategories, setProductCategories] = useState<InventoryLookupCategoryRow[]>([]);
  const [uiTexts, setUiTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [eventCode, setEventCode] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [checklistLabel, setChecklistLabel] = useState('');
  const [maintenanceComponentCode, setMaintenanceComponentCode] = useState('');
  const [maintenanceActionType, setMaintenanceActionType] = useState('REPLACE');
  const [maintenanceDate, setMaintenanceDate] = useState('');
  const [assignmentQty, setAssignmentQty] = useState('1');
  const [assignmentProductId, setAssignmentProductId] = useState('');
  const [assignmentProductSearch, setAssignmentProductSearch] = useState('');
  const [assignmentCategoryId, setAssignmentCategoryId] = useState<number | null>(null);
  const [costStage, setCostStage] = useState<'PRE' | 'DURING' | 'POST'>('PRE');
  const [costCategory, setCostCategory] = useState('LOGISTICA');
  const [costConcept, setCostConcept] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDate, setCostDate] = useState('');

  async function loadBootstrap() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const data = await fetchRacingBootstrap(accessToken);
      setVehicles(data.vehicles ?? []);
      setEvents(data.events ?? []);
      setUiTexts(data.ui_texts ?? {});
      const summary = await fetchRacingEventCostSummary(accessToken);
      setCostSummary(summary.events ?? []);
      const alertData = await fetchRacingAlerts(accessToken);
      setAlerts(alertData);
      const lookups = await fetchInventoryProductLookups(accessToken);
      setProductCategories(lookups.categories ?? []);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar Racing Operations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, [accessToken]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setVehicleHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const history = await fetchRacingVehicleHistory(accessToken, selectedVehicleId);
        if (!cancelled) {
          setVehicleHistory(history);
        }
      } catch (error) {
        if (!cancelled) {
          setIsError(true);
          setMessage(error instanceof Error ? error.message : 'No se pudo cargar historial del auto');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedVehicleId]);

  useEffect(() => {
    if (!selectedEventId) {
      setChecklist([]);
      setEventCosts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRacingChecklist(accessToken, selectedEventId);
        if (!cancelled) {
          setChecklist(data.items ?? []);
        }
        const costs = await fetchRacingEventCosts(accessToken, selectedEventId);
        if (!cancelled) {
          setEventCosts(costs.costs ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setIsError(true);
          setMessage(error instanceof Error ? error.message : 'No se pudo cargar checklist del evento');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedEventId]);

  useEffect(() => {
    const search = assignmentProductSearch.trim();
    if (search.length < 2) {
      setProductSuggestions([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchInventoryProductAutocomplete(accessToken, search, assignmentCategoryId);
        if (!cancelled) {
          setProductSuggestions(result.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setProductSuggestions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, assignmentProductSearch, assignmentCategoryId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((item) => item.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  function t(key: string, fallback: string): string {
    const value = uiTexts[key];
    return typeof value === 'string' && value.trim() !== '' ? value : fallback;
  }

  async function handleCreateVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleCode.trim() || !vehicleName.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const created = await createRacingVehicle(accessToken, {
        code: vehicleCode,
        name: vehicleName,
      });
      setVehicles((prev) => [created, ...prev]);
      setVehicleCode('');
      setVehicleName('');
      setMessage('Auto registrado');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar auto');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventCode.trim() || !eventName.trim() || !eventStartDate.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const created = await createRacingEvent(accessToken, {
        code: eventCode,
        name: eventName,
        starts_at: eventStartDate,
      });
      setEvents((prev) => [created, ...prev]);
      setEventCode('');
      setEventName('');
      setEventStartDate('');
      setMessage('Evento rally registrado');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar evento');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddChecklistItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId || !checklistLabel.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await createRacingChecklistItem(accessToken, selectedEventId, {
        item_label: checklistLabel,
        planned_qty: 1,
      });
      setChecklist(response.items ?? []);
      setChecklistLabel('');
      setMessage('Item agregado al checklist');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar item');
    } finally {
      setLoading(false);
    }
  }

  async function markChecklistLoaded(item: RacingChecklistItem) {
    if (!selectedEventId) return;
    try {
      const response = await updateRacingChecklistItem(accessToken, selectedEventId, item.id, {
        loaded_qty: item.planned_qty,
        status: 'LOADED',
      });
      setChecklist(response.items ?? []);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar checklist');
    }
  }

  async function handleCreateMaintenance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicleId || !maintenanceComponentCode.trim() || !maintenanceDate.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const history = await createRacingMaintenance(accessToken, selectedVehicleId, {
        component_code: maintenanceComponentCode,
        action_type: maintenanceActionType,
        service_date: maintenanceDate,
      });
      setVehicleHistory(history);
      setMaintenanceComponentCode('');
      setMaintenanceDate('');
      setMessage('Mantenimiento registrado');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar mantenimiento');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId || !assignmentQty.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      await createRacingInventoryAssignment(accessToken, {
        assignment_type: 'EVENT',
        event_id: selectedEventId,
        vehicle_id: selectedVehicleId ?? undefined,
        product_id: assignmentProductId ? Number(assignmentProductId) : undefined,
        quantity: Number(assignmentQty),
      });

      const history = selectedVehicleId
        ? await fetchRacingVehicleHistory(accessToken, selectedVehicleId)
        : null;
      if (history) {
        setVehicleHistory(history);
      }
      setMessage('Asignacion de inventario registrada');
      setAssignmentQty('1');
      setAssignmentProductId('');
      setAssignmentProductSearch('');
      setProductSuggestions([]);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar asignacion');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEventCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId || !costConcept.trim() || !costAmount.trim() || !costDate.trim()) {
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const costs = await createRacingEventCost(accessToken, selectedEventId, {
        cost_stage: costStage,
        cost_category: costCategory,
        concept: costConcept,
        amount: Number(costAmount),
        cost_date: costDate,
      });
      setEventCosts(costs.costs ?? []);
      const summary = await fetchRacingEventCostSummary(accessToken);
      setCostSummary(summary.events ?? []);
      setCostConcept('');
      setCostAmount('');
      setCostDate('');
      setMessage('Costo registrado');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar costo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-stack racing-module">
      <div className="card-grid card-grid--two">
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('racing.title.vehicles', 'Autos de Competencia')}</h3>
          <form onSubmit={handleCreateVehicle} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input value={vehicleCode} onChange={(e) => setVehicleCode(e.target.value)} placeholder={t('racing.placeholder.vehicle_code', 'Codigo auto')} />
            <input value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} placeholder={t('racing.placeholder.vehicle_name', 'Nombre / Alias')} />
            <button type="submit" disabled={loading}>{t('racing.action.register', 'Registrar')}</button>
          </form>
          <div className="racing-list-wrap">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => setSelectedVehicleId(vehicle.id)}
                className={`racing-list-row ${selectedVehicleId === vehicle.id ? 'is-active' : ''}`}
              >
                <strong>{vehicle.code}</strong> - {vehicle.name}
              </button>
            ))}
            {vehicles.length === 0 && <div style={{ padding: '0.7rem' }}>{t('racing.empty.vehicles', 'Sin autos registrados.')}</div>}
          </div>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('racing.title.events', 'Eventos Rally')}</h3>
          <form onSubmit={handleCreateEvent} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input value={eventCode} onChange={(e) => setEventCode(e.target.value)} placeholder={t('racing.placeholder.event_code', 'Codigo evento')} />
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={t('racing.placeholder.event_name', 'Nombre evento')} />
            <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} />
            <button type="submit" disabled={loading}>{t('racing.action.create', 'Crear')}</button>
          </form>
          <div className="racing-list-wrap">
            {events.map((eventRow) => (
              <button
                key={eventRow.id}
                type="button"
                onClick={() => setSelectedEventId(eventRow.id)}
                className={`racing-list-row ${selectedEventId === eventRow.id ? 'is-active' : ''}`}
              >
                <strong>{eventRow.code}</strong> - {eventRow.name}
              </button>
            ))}
            {events.length === 0 && <div style={{ padding: '0.7rem' }}>{t('racing.empty.events', 'Sin eventos registrados.')}</div>}
          </div>
        </section>
      </div>

      <div className="card-grid card-grid--two">
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('racing.title.history', 'Historial por Auto')}</h3>
          {!selectedVehicle && <p>{t('racing.empty.select_vehicle', 'Selecciona un auto para ver historial de mantenimiento y asignaciones.')}</p>}
          {selectedVehicle && (
            <>
              <p><strong>{selectedVehicle.code}</strong> - {selectedVehicle.name}</p>
              <h4 style={{ marginBottom: '0.3rem' }}>{t('racing.title.maintenance', 'Mantenimientos')}</h4>
              <form onSubmit={handleCreateMaintenance} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <input
                  value={maintenanceComponentCode}
                  onChange={(e) => setMaintenanceComponentCode(e.target.value)}
                  placeholder={t('racing.placeholder.component_code', 'Componente (ej: LLANTA_FL)')}
                />
                <select value={maintenanceActionType} onChange={(e) => setMaintenanceActionType(e.target.value)}>
                  <option value="REPLACE">REPLACE</option>
                  <option value="SERVICE">SERVICE</option>
                  <option value="CHECK">CHECK</option>
                </select>
                <input type="date" value={maintenanceDate} onChange={(e) => setMaintenanceDate(e.target.value)} />
                <button type="submit" disabled={loading}>{t('racing.action.add', 'Agregar')}</button>
              </form>
              <ul style={{ marginTop: 0 }}>
                {(vehicleHistory?.maintenance ?? []).slice(0, 6).map((row) => (
                  <li key={row.id}>{row.service_date}: {row.component_code} ({row.action_type})</li>
                ))}
                {(vehicleHistory?.maintenance ?? []).length === 0 && <li>{t('racing.empty.maintenance', 'Sin mantenimientos registrados.')}</li>}
              </ul>

              <h4 style={{ marginBottom: '0.3rem' }}>{t('racing.title.assignments', 'Asignaciones a Evento')}</h4>
              <form onSubmit={handleCreateAssignment} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  value={assignmentCategoryId ?? ''}
                  onChange={(e) => setAssignmentCategoryId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('racing.option.all_categories', 'Todas las categorias')}</option>
                  {productCategories.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
                <div style={{ minWidth: 240, flex: 1 }}>
                  <input
                    value={assignmentProductSearch}
                    onChange={(e) => {
                      setAssignmentProductSearch(e.target.value);
                      setAssignmentProductId('');
                    }}
                    placeholder={t('racing.placeholder.product_search', 'Buscar producto por nombre/SKU')}
                    style={{ width: '100%' }}
                  />
                  {productSuggestions.length > 0 && (
                    <div className="racing-suggest-wrap">
                      {productSuggestions.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            setAssignmentProductId(String(row.id));
                            setAssignmentProductSearch(`${row.sku ?? '-'} - ${row.name}`);
                            setProductSuggestions([]);
                          }}
                          className="racing-suggest-row"
                        >
                          {(row.sku ?? '-') + ' - ' + row.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  value={assignmentQty}
                  onChange={(e) => setAssignmentQty(e.target.value)}
                  placeholder={t('racing.placeholder.quantity', 'Cantidad')}
                />
                <button type="submit" disabled={loading || !selectedEventId}>{t('racing.action.assign', 'Asignar')}</button>
              </form>
            </>
          )}
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('racing.title.checklist', 'Checklist de Rally')}</h3>
          {!selectedEventId && <p>{t('racing.empty.select_event', 'Selecciona un evento para gestionar checklist.')}</p>}
          {selectedEventId && (
            <>
              <form onSubmit={handleAddChecklistItem} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  value={checklistLabel}
                  onChange={(e) => setChecklistLabel(e.target.value)}
                  placeholder={t('racing.placeholder.new_item', 'Nuevo item (ej: Casco piloto A)')}
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={loading}>{t('racing.action.add', 'Agregar')}</button>
              </form>
              <ul style={{ marginTop: 0, paddingLeft: '1rem' }}>
                {checklist.map((item) => (
                  <li key={item.id} style={{ marginBottom: '0.35rem' }}>
                    {item.item_label} ({item.status})
                    <button type="button" onClick={() => void markChecklistLoaded(item)} style={{ marginLeft: '0.5rem' }}>
                      {t('racing.action.mark_loaded', 'Marcar cargado')}
                    </button>
                  </li>
                ))}
                {checklist.length === 0 && <li>{t('racing.empty.checklist', 'Sin items en checklist.')}</li>}
              </ul>

              <h4 style={{ marginBottom: '0.3rem', marginTop: '0.8rem' }}>{t('racing.title.event_costs', 'Gastos del Evento')}</h4>
              <form onSubmit={handleCreateEventCost} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <select value={costStage} onChange={(e) => setCostStage(e.target.value as 'PRE' | 'DURING' | 'POST')}>
                  <option value="PRE">PRE</option>
                  <option value="DURING">DURING</option>
                  <option value="POST">POST</option>
                </select>
                <input value={costCategory} onChange={(e) => setCostCategory(e.target.value)} placeholder={t('racing.placeholder.category', 'Categoria')} />
                <input value={costConcept} onChange={(e) => setCostConcept(e.target.value)} placeholder={t('racing.placeholder.concept', 'Concepto')} />
                <input value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder={t('racing.placeholder.amount', 'Monto')} />
                <input type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} />
                <button type="submit" disabled={loading}>{t('racing.action.register_cost', 'Registrar costo')}</button>
              </form>
              <ul style={{ marginTop: 0, paddingLeft: '1rem' }}>
                {eventCosts.slice(0, 8).map((row) => (
                  <li key={row.id}>{row.cost_date} [{row.cost_stage}] {row.concept}: S/ {Number(row.amount).toFixed(2)}</li>
                ))}
                {eventCosts.length === 0 && <li>{t('racing.empty.costs', 'Sin costos registrados.')}</li>}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>{t('racing.title.cost_summary', 'Resumen de Costos por Rally')}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('racing.table.event', 'Evento')}</th>
                <th style={{ textAlign: 'right' }}>{t('racing.table.budget', 'Presupuesto')}</th>
                <th style={{ textAlign: 'right' }}>{t('racing.table.actual', 'Real')}</th>
                <th style={{ textAlign: 'right' }}>{t('racing.table.variance', 'Varianza')}</th>
              </tr>
            </thead>
            <tbody>
              {costSummary.slice(0, 10).map((row) => (
                <tr key={row.event_id}>
                  <td style={{ padding: '0.35rem 0' }}>{row.event_code} - {row.event_name}</td>
                  <td style={{ textAlign: 'right' }}>S/ {row.budget_amount !== null ? row.budget_amount.toFixed(2) : '-'}</td>
                  <td style={{ textAlign: 'right' }}>S/ {row.actual_amount.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>S/ {row.variance_amount !== null ? row.variance_amount.toFixed(2) : '-'}</td>
                </tr>
              ))}
              {costSummary.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ paddingTop: '0.5rem' }}>{t('racing.empty.cost_summary', 'Sin datos de costos por evento.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>{t('racing.title.alerts', 'Alertas Automaticas')}</h3>
        <div className="card-grid card-grid--two">
          <div>
            <h4 style={{ marginBottom: '0.3rem' }}>{t('racing.title.low_stock', 'Stock bajo')} (umbral: {alerts?.stock_threshold ?? 5})</h4>
            <ul style={{ marginTop: 0, paddingLeft: '1rem' }}>
              {(alerts?.low_stock ?? []).slice(0, 8).map((row) => (
                <li key={`${row.product_id}-${row.warehouse_id}`}>
                  {(row.sku ?? '-') + ' - ' + row.product_name} ({row.warehouse_code ?? 'ALM'}): {Number(row.stock).toFixed(2)}
                </li>
              ))}
              {(alerts?.low_stock ?? []).length === 0 && <li>{t('racing.empty.low_stock', 'Sin alertas de stock bajo.')}</li>}
            </ul>
          </div>
          <div>
            <h4 style={{ marginBottom: '0.3rem' }}>{t('racing.title.maintenance_pending', 'Mantenimiento pendiente')}</h4>
            <ul style={{ marginTop: 0, paddingLeft: '1rem' }}>
              {(alerts?.maintenance_pending ?? []).slice(0, 8).map((row) => (
                <li key={row.id}>
                  {row.vehicle_code} - {row.component_code} (vence: {row.next_service_date})
                </li>
              ))}
              {(alerts?.maintenance_pending ?? []).length === 0 && <li>{t('racing.empty.maintenance_pending', 'Sin mantenimientos pendientes.')}</li>}
            </ul>

            <h4 style={{ marginBottom: '0.3rem' }}>
              {t('racing.title.maintenance_upcoming', 'Mantenimiento proximo')} ({alerts?.maintenance_window_days ?? 7} {t('racing.label.days', 'dias')})
            </h4>
            <ul style={{ marginTop: 0, paddingLeft: '1rem' }}>
              {(alerts?.maintenance_upcoming ?? []).slice(0, 8).map((row) => (
                <li key={`upcoming-${row.id}`}>
                  {row.vehicle_code} - {row.component_code} (vence: {row.next_service_date})
                </li>
              ))}
              {(alerts?.maintenance_upcoming ?? []).length === 0 && <li>{t('racing.empty.maintenance_upcoming', 'Sin mantenimientos proximos.')}</li>}
            </ul>
          </div>
        </div>
      </section>

      {message && (
        <p className={`notice ${isError ? 'notice--error' : 'notice--success'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
