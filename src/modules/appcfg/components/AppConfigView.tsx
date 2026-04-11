import { useEffect, useState } from 'react';
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
};

const FEATURE_LABELS: Record<string, string> = {
  RESTAURANT_MENU_IGV_INCLUDED: 'Restaurante: precio de carta incluye IGV',
  PRODUCT_MULTI_UOM: 'Unidades multiples por producto',
  PRODUCT_UOM_CONVERSIONS: 'Conversion entre unidades de producto',
  PRODUCT_WHOLESALE_PRICING: 'Precios mayoristas por volumen',
  SALES_CUSTOMER_PRICE_PROFILE: 'Precios por cliente',
  SALES_SELLER_TO_CASHIER: 'Flujo vendedor a caja independiente',
  SALES_ALLOW_ISSUED_EDIT_BEFORE_SUNAT_FINAL: 'Ventas: Editar emitidos antes de estado SUNAT final',
  SALES_ANTICIPO_ENABLED: 'Ventas: Permitir anticipos',
  SALES_TAX_BRIDGE: 'Ventas: Puente tributario SUNAT',
};

function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? code;
}

function verticalSourceLabel(source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'Override empresa/rubro';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'Template rubro';
  }

  return 'Fallback company/sucursal';
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

export function AppConfigView({ accessToken, branchId, warehouseId, cashRegisterId }: AppConfigViewProps) {
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
    auto_reconcile_enabled: true,
    reconcile_batch_size: 20,
    sol_user: '',
    sol_pass: '',
    envio_pse: '',
  });
  const [reconcileStats, setReconcileStats] = useState<ReconcileStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [igvSettings, setIgvSettings] = useState<IgvSettingsResponse | null>(null);
  const [igvRatePercent, setIgvRatePercent] = useState('18');
  const [verticalSettings, setVerticalSettings] = useState<CompanyVerticalSettingsResponse | null>(null);
  const [selectedVerticalCode, setSelectedVerticalCode] = useState('');

  async function loadAppCfg() {
    setLoading(true);
    setMessage('');

    try {
      const [moduleRows, featureRows, igvRows] = await Promise.all([
        fetchModules(accessToken),
        fetchFeatureToggles(accessToken),
        fetchIgvSettings(accessToken),
      ]);

      const limitRows = await fetchOperationalLimits(accessToken);

      setModules(moduleRows);
      setFeatures(featureRows);
      setIgvSettings(igvRows);
      setIgvRatePercent(String(igvRows.active_rate.rate_percent ?? 18));
      setLimits(limitRows);
      setLimitsForm({
        max_companies_enabled: limitRows.platform_limits.max_companies_enabled,
        max_branches_enabled: limitRows.company_limits.max_branches_enabled,
        max_warehouses_enabled: limitRows.company_limits.max_warehouses_enabled,
        max_cash_registers_enabled: limitRows.company_limits.max_cash_registers_enabled,
      });

      try {
        const verticalRows = await fetchCompanyVerticalSettings(accessToken);
        setVerticalSettings(verticalRows);
        setSelectedVerticalCode(verticalRows.active_vertical?.code ?? '');
      } catch {
        setVerticalSettings(null);
        setSelectedVerticalCode('');
      }

      // Commerce settings may fail if user is not admin — ignore error silently
      try {
        const commerceRows = await fetchCommerceSettings(accessToken);
        setCommerceFeatures(commerceRows.features);
        const map: Record<string, boolean> = {};
        for (const f of commerceRows.features) {
          map[f.feature_code] = f.is_enabled;
        }
        setCommerceFeaturesForm(map);

        const bridge = commerceRows.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE');
        const cfg = (bridge?.config && typeof bridge.config === 'object' ? bridge.config : {}) as SalesTaxBridgeConfig;
        setTaxBridgeForm({
          bridge_mode: cfg.bridge_mode === 'BETA' ? 'BETA' : 'PRODUCTION',
          production_url: String(cfg.production_url ?? ''),
          beta_url: String(cfg.beta_url ?? ''),
          timeout_seconds: Number(cfg.timeout_seconds ?? 15),
          auth_scheme: cfg.auth_scheme === 'bearer' ? 'bearer' : 'none',
          token: String(cfg.token ?? ''),
          auto_send_on_issue: cfg.auto_send_on_issue ?? true,
          auto_reconcile_enabled: cfg.auto_reconcile_enabled !== false,
          reconcile_batch_size: Number(cfg.reconcile_batch_size ?? 20),
          sol_user: String(cfg.sol_user ?? ''),
          sol_pass: String(cfg.sol_pass ?? ''),
          codigolocal: '',
          envio_pse: String(cfg.envio_pse ?? ''),
        });

        // Load reconcile stats (non-blocking)
        try {
          const stats = await fetchReconcileStats(accessToken);
          setReconcileStats(stats);
        } catch {
          // Stats are informational — ignore if not available
        }

        if (branchId) {
          const branchCommerceRows = await fetchCommerceSettings(accessToken, branchId);
          const branchBridge = branchCommerceRows.features.find((row) => row.feature_code === 'SALES_TAX_BRIDGE');
          const branchCfg = (branchBridge?.config && typeof branchBridge.config === 'object'
            ? branchBridge.config
            : {}) as SalesTaxBridgeConfig;

          setTaxBridgeForm((prev) => ({
            ...prev,
            codigolocal: String(branchCfg.codigolocal ?? ''),
          }));
        }
      } catch {
        // Not admin — commerce settings section will not be shown
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
      const payload = commerceFeatures.map((row) => {
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

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>AppCfg</h3>
        <button type="button" onClick={() => void loadAppCfg()} disabled={loading}>
          Refrescar
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <p>
        Vista conectada a configuracion de modulos y feature toggles.
      </p>

      <div className="table-wrap">
        <h4>Contexto operativo actual</h4>
        <p>
          <strong>Sucursal:</strong> {branchId ?? 'N/A'} | <strong>Almacen:</strong>{' '}
          {warehouseId ?? 'N/A'} | <strong>Caja:</strong> {cashRegisterId ?? 'N/A'}
        </p>
      </div>

      {verticalSettings && (
        <div className="table-wrap">
          <h4>Verticalizacion por rubro</h4>
          <form className="grid-form" onSubmit={handleSaveVerticalSettings}>
            <label>
              Rubro activo de la empresa
              <select
                value={selectedVerticalCode}
                onChange={(e) => setSelectedVerticalCode(e.target.value)}
              >
                <option value="">Seleccionar rubro</option>
                {verticalSettings.verticals.map((row) => (
                  <option key={row.id} value={row.code}>
                    {row.name} ({row.code})
                  </option>
                ))}
              </select>
            </label>
            <div className="entity-filter-action">
              <button type="submit" disabled={loading || !selectedVerticalCode}>
                Guardar rubro activo
              </button>
            </div>
          </form>

          <p className="notice" style={{ marginTop: '0.5rem' }}>
            Activo actual: <strong>{verticalSettings.active_vertical?.name ?? 'No definido'}</strong>
            {verticalSettings.active_vertical?.code ? ` (${verticalSettings.active_vertical.code})` : ''}
          </p>

          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nombre</th>
                <th>Asignado</th>
                <th>Principal</th>
              </tr>
            </thead>
            <tbody>
              {verticalSettings.verticals.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.is_assigned ? 'SI' : 'NO'}</td>
                  <td>{row.is_primary ? 'SI' : 'NO'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="grid-form" onSubmit={handleSaveLimits}>
        <label>
          Max empresas habilitadas
          <input
            type="number"
            min={1}
            value={limitsForm.max_companies_enabled ?? ''}
            onChange={(e) =>
              setLimitsForm((prev) => ({
                ...prev,
                max_companies_enabled: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Max sucursales habilitadas
          <input
            type="number"
            min={1}
            value={limitsForm.max_branches_enabled ?? ''}
            onChange={(e) =>
              setLimitsForm((prev) => ({
                ...prev,
                max_branches_enabled: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Max almacenes habilitados
          <input
            type="number"
            min={1}
            value={limitsForm.max_warehouses_enabled ?? ''}
            onChange={(e) =>
              setLimitsForm((prev) => ({
                ...prev,
                max_warehouses_enabled: Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          Max cajas habilitadas
          <input
            type="number"
            min={1}
            value={limitsForm.max_cash_registers_enabled ?? ''}
            onChange={(e) =>
              setLimitsForm((prev) => ({
                ...prev,
                max_cash_registers_enabled: Number(e.target.value),
              }))
            }
          />
        </label>
        <button className="wide" type="submit" disabled={loading}>
          Guardar limites
        </button>
      </form>

      <form className="grid-form" onSubmit={handleSaveIgvSettings}>
        <label>
          IGV activo (%)
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
          <button type="submit" disabled={loading}>
            Guardar IGV
          </button>
        </div>
        <p className="notice" style={{ gridColumn: '1 / -1' }}>
          Maestro IGV activo para la empresa. Esta tasa se aplica a ventas, compras y al payload tributario.
        </p>
        {igvSettings && (
          <p style={{ gridColumn: '1 / -1' }}>
            <strong>Activo:</strong> {igvSettings.active_rate.name}
          </p>
        )}
      </form>

      {limits && (
        <div className="table-wrap">
          <h4>Uso actual</h4>
          <table>
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Uso</th>
                <th>Limite</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Empresas</td>
                <td>{limits.usage.enabled_companies}</td>
                <td>{limits.platform_limits.max_companies_enabled}</td>
              </tr>
              <tr>
                <td>Sucursales</td>
                <td>{limits.usage.enabled_branches}</td>
                <td>{limits.company_limits.max_branches_enabled}</td>
              </tr>
              <tr>
                <td>Almacenes</td>
                <td>{limits.usage.enabled_warehouses}</td>
                <td>{limits.company_limits.max_warehouses_enabled}</td>
              </tr>
              <tr>
                <td>Cajas</td>
                <td>{limits.usage.enabled_cash_registers}</td>
                <td>{limits.company_limits.max_cash_registers_enabled}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="table-wrap">
        <h4>Modulos</h4>
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Nombre</th>
              <th>Core</th>
              <th>Company</th>
              <th>Branch</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.is_core ? 'SI' : 'NO'}</td>
                <td>{row.company_enabled === null ? '-' : row.company_enabled ? 'SI' : 'NO'}</td>
                <td>{row.branch_enabled === null ? '-' : row.branch_enabled ? 'SI' : 'NO'}</td>
                <td>{row.is_enabled ? 'SI' : 'NO'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <h4>Feature Toggles</h4>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Company</th>
              <th>Branch</th>
              <th>Fuente</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {features.map((row) => (
              <tr key={row.feature_code}>
                <td>{featureLabel(row.feature_code)}</td>
                <td>{row.company_enabled === null ? '-' : row.company_enabled ? 'SI' : 'NO'}</td>
                <td>{row.branch_enabled === null ? '-' : row.branch_enabled ? 'SI' : 'NO'}</td>
                <td>
                  <span className={verticalSourceBadgeClass(row.vertical_source)}>
                    {verticalSourceLabel(row.vertical_source)}
                  </span>
                </td>
                <td>{row.is_enabled ? 'SI' : 'NO'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {commerceFeatures.length > 0 && (
        <div className="table-wrap">
          <h4>Funcionalidades comerciales</h4>
          <form onSubmit={handleSaveCommerceFeatures}>
            <table>
              <thead>
                <tr>
                  <th>Funcionalidad</th>
                  <th>Fuente</th>
                  <th>Habilitado</th>
                </tr>
              </thead>
              <tbody>
                {commerceFeatures.map((row) => (
                  <tr key={row.feature_code}>
                    <td>{featureLabel(row.feature_code)}</td>
                    <td>
                      <span className={verticalSourceBadgeClass(row.vertical_source)}>
                        {verticalSourceLabel(row.vertical_source)}
                      </span>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={commerceFeaturesForm[row.feature_code] ?? false}
                        onChange={(e) =>
                          setCommerceFeaturesForm((prev) => ({
                            ...prev,
                            [row.feature_code]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(commerceFeaturesForm.SALES_TAX_BRIDGE ?? false) && (
              <div className="grid-form" style={{ marginTop: '12px' }}>
                <div className="tax-bridge-send-mode wide">
                  <span className="tax-bridge-send-mode__label">Modo de envio SUNAT</span>
                  <label className="tax-bridge-send-mode__switch">
                    <input
                      type="checkbox"
                      checked={Boolean(taxBridgeForm.auto_send_on_issue)}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_send_on_issue: e.target.checked }))}
                    />
                    <span>
                      {taxBridgeForm.auto_send_on_issue ? 'Envio automatico al emitir' : 'Envio manual desde boton'}
                    </span>
                  </label>
                  <small className="tax-bridge-send-mode__hint">
                    {taxBridgeForm.auto_send_on_issue
                      ? 'Cada comprobante tributario emitido se manda al puente automaticamente.'
                      : 'El usuario lo enviara desde el boton Enviar SUNAT en la lista, como en el legado.'}
                  </small>
                </div>

                {/* ── Reintentos automáticos ── */}
                <div className="tax-bridge-send-mode wide" style={{ background: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--card)' : '#fef2f2', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="tax-bridge-send-mode__label" style={{ fontWeight: 700 }}>
                      Reintentos automáticos SUNAT
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={taxBridgeForm.auto_reconcile_enabled !== false}
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_reconcile_enabled: e.target.checked }))}
                      />
                      <span style={{ fontWeight: 600, color: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--ok, #16a34a)' : '#dc2626' }}>
                        {taxBridgeForm.auto_reconcile_enabled !== false ? 'Activo' : 'Desactivado'}
                      </span>
                    </label>
                  </div>
                  <small style={{ color: 'var(--ink-soft)', display: 'block', marginBottom: 10 }}>
                    {taxBridgeForm.auto_reconcile_enabled !== false
                      ? 'El sistema reintenta solo los documentos pendientes en segundo plano, con espera progresiva (1 → 2 → 4 → … → 120 min). Una vez aceptados, se actualizan solos. Usted no tiene que hacer nada.'
                      : 'Los reintentos automáticos están pausados. Los documentos pendientes quedarán esperando hasta que los reenvíe manualmente desde Excepciones SUNAT.'}
                  </small>

                  {taxBridgeForm.auto_reconcile_enabled !== false && (
                    <>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                          Máximo de documentos por ciclo: <strong>{taxBridgeForm.reconcile_batch_size ?? 20}</strong>
                          {' '}<span style={{ color: 'var(--ink-soft)', fontSize: '0.75rem' }}>(5 – 50)</span>
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
                        <small style={{ color: 'var(--ink-soft)' }}>
                          Limite bajo (5 – 10) = más silencioso durante la venta. Limite alto (40 – 50) = resuelve la cola más rápido en horario tranquilo.
                        </small>
                      </label>

                      {/* Stats en vivo */}
                      {reconcileStats && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                          <div style={{ background: reconcileStats.pending_reconcile_count > 0 ? '#fef9c3' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.pending_reconcile_count > 0 ? '#92400e' : '#15803d' }}>
                              {reconcileStats.pending_reconcile_count}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>En cola</div>
                          </div>
                          <div style={{ background: reconcileStats.unsent_count > 0 ? '#fff7ed' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.unsent_count > 0 ? '#9a3412' : '#15803d' }}>
                              {reconcileStats.unsent_count}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Sin enviar</div>
                          </div>
                          {reconcileStats.next_reconcile_at && (
                            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 160 }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)' }}>
                                Próximo reintento automático
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                                {new Date(reconcileStats.next_reconcile_at).toLocaleString('es-PE', { hour12: false })}
                              </div>
                            </div>
                          )}
                          {reconcileStats.pending_reconcile_count === 0 && reconcileStats.unsent_count === 0 && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px', flex: 1, color: '#15803d', fontSize: '0.8rem', fontWeight: 600 }}>
                              ✓ Todo en orden — no hay documentos pendientes
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <label>
                  Modo puente tributario
                  <select
                    value={taxBridgeForm.bridge_mode ?? 'PRODUCTION'}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, bridge_mode: e.target.value === 'BETA' ? 'BETA' : 'PRODUCTION' }))}
                  >
                    <option value="PRODUCTION">PRODUCCION</option>
                    <option value="BETA">BETA</option>
                  </select>
                </label>
                <label>
                  URL puente PRODUCCION
                  <input
                    value={taxBridgeForm.production_url ?? ''}
                    placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNAT/index.php/Sunat"
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, production_url: e.target.value }))}
                  />
                </label>
                <label>
                  URL puente BETA
                  <input
                    value={taxBridgeForm.beta_url ?? ''}
                    placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNATBETA/index.php/Sunat"
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, beta_url: e.target.value }))}
                  />
                </label>
                <p className="tax-bridge-send-mode__hint">
                  Si ingresas solo la base del puente, el sistema completara automaticamente el metodo correcto:
                  <strong> /index.php/Sunat/&lt;metodo&gt;</strong>. Cada tarea usa su metodo, por ejemplo <strong>send_xml</strong> o <strong>register_CERT</strong>.
                </p>
                <label>
                  Timeout (segundos)
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={taxBridgeForm.timeout_seconds ?? 15}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, timeout_seconds: Number(e.target.value || 15) }))}
                  />
                </label>
                <label>
                  Auth puente
                  <select
                    value={taxBridgeForm.auth_scheme ?? 'none'}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auth_scheme: e.target.value === 'bearer' ? 'bearer' : 'none' }))}
                  >
                    <option value="none">Sin token</option>
                    <option value="bearer">Bearer token</option>
                  </select>
                </label>
                <label>
                  Token (opcional)
                  <input
                    value={taxBridgeForm.token ?? ''}
                    placeholder="Bearer token"
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, token: e.target.value }))}
                  />
                </label>
                <label>
                  Usuario SOL
                  <input
                    value={taxBridgeForm.sol_user ?? ''}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_user: e.target.value }))}
                  />
                </label>
                <label>
                  Password SOL
                  <input
                    type="password"
                    value={taxBridgeForm.sol_pass ?? ''}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_pass: e.target.value }))}
                  />
                </label>
                {branchId ? (
                  <label>
                    Codigo local SUNAT de la sucursal
                    <input
                      maxLength={4}
                      value={taxBridgeForm.codigolocal ?? ''}
                      placeholder="0000"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, codigolocal: e.target.value }))}
                    />
                  </label>
                ) : null}
                <label>
                  Envio PSE (opcional)
                  <input
                    value={taxBridgeForm.envio_pse ?? ''}
                    onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, envio_pse: e.target.value }))}
                  />
                </label>
                {branchId ? (
                  <p className="tax-bridge-send-mode__hint wide">
                    El codigo local se guarda por sucursal. Las credenciales SOL y el usuario/password secundario SUNAT se mantienen como configuracion general de la empresa.
                  </p>
                ) : null}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ marginTop: '10px' }}>
              Guardar funcionalidades
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
