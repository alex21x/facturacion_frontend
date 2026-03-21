import { useEffect, useState } from 'react';
import {
  fetchFeatureToggles,
  fetchModules,
  fetchOperationalLimits,
  updateOperationalLimits,
} from '../api';
import type {
  FeatureToggleRow,
  ModuleRow,
  OperationalLimitsResponse,
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
  SALES_SELLER_TO_CASHIER: 'Flujo vendedor a caja independiente',
};

function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? code;
}

export function AppConfigView({ accessToken, branchId, warehouseId, cashRegisterId }: AppConfigViewProps) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [features, setFeatures] = useState<FeatureToggleRow[]>([]);
  const [limits, setLimits] = useState<OperationalLimitsResponse | null>(null);
  const [limitsForm, setLimitsForm] = useState<UpdateOperationalLimitsPayload>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAppCfg() {
    setLoading(true);
    setMessage('');

    try {
      const [moduleRows, featureRows] = await Promise.all([
        fetchModules(accessToken),
        fetchFeatureToggles(accessToken),
      ]);

      const limitRows = await fetchOperationalLimits(accessToken);

      setModules(moduleRows);
      setFeatures(featureRows);
      setLimits(limitRows);
      setLimitsForm({
        max_companies_enabled: limitRows.platform_limits.max_companies_enabled,
        max_branches_enabled: limitRows.company_limits.max_branches_enabled,
        max_warehouses_enabled: limitRows.company_limits.max_warehouses_enabled,
        max_cash_registers_enabled: limitRows.company_limits.max_cash_registers_enabled,
      });
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
  }, [accessToken]);

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
    </section>
  );
}
