import { useEffect, useState } from 'react';
import {
  fetchCommerceSettings,
  fetchFeatureToggles,
  fetchIgvSettings,
  fetchModules,
  fetchOperationalLimits,
  updateCommerceSettings,
  updateIgvSettings,
  updateOperationalLimits,
} from '../api';
import type {
  CommerceSettingsFeature,
  FeatureToggleRow,
  IgvSettingsResponse,
  ModuleRow,
  OperationalLimitsResponse,
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
    sol_user: '',
    sol_pass: '',
    envio_pse: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [igvSettings, setIgvSettings] = useState<IgvSettingsResponse | null>(null);
  const [igvRatePercent, setIgvRatePercent] = useState('18');

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
          sol_user: String(cfg.sol_user ?? ''),
          sol_pass: String(cfg.sol_pass ?? ''),
          codigolocal: '',
          envio_pse: String(cfg.envio_pse ?? ''),
        });

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
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {features.map((row) => (
              <tr key={row.feature_code}>
                <td>{featureLabel(row.feature_code)}</td>
                <td>{row.company_enabled === null ? '-' : row.company_enabled ? 'SI' : 'NO'}</td>
                <td>{row.branch_enabled === null ? '-' : row.branch_enabled ? 'SI' : 'NO'}</td>
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
                  <th>Habilitado</th>
                </tr>
              </thead>
              <tbody>
                {commerceFeatures.map((row) => (
                  <tr key={row.feature_code}>
                    <td>{featureLabel(row.feature_code)}</td>
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
