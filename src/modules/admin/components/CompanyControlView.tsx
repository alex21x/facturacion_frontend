import { useEffect, useMemo, useState } from 'react';
import {
  createAdminCompany,
  fetchCompanyCommerceAdminMatrix,
  fetchCompanyInventorySettingsAdminMatrix,
  fetchCompanyOperationalLimitMatrix,
  fetchCompanyRateLimitMatrix,
  fetchCompanyVerticalAdminMatrix,
  resetAdminCompanyPassword,
  updateCompanyCommerceAdminMatrix,
  updateCompanyInventorySettingsAdminMatrix,
  updateCompanyOperationalLimitMatrix,
  updateCompanyOperationalLimitMatrixBulk,
  updateCompanyRateLimitMatrix,
  updateCompanyRateLimitMatrixBulk,
  updateCompanyVerticalAdminMatrix,
  updateCompanyVerticalAdminMatrixBulk,
} from '../../appcfg/api';
import type {
  CompanyCommerceAdminMatrixResponse,
  CompanyInventorySettingsAdminMatrixResponse,
  InventorySettingsRecord,
  CompanyOperationalLimitMatrixResponse,
  CompanyRateLimitMatrixResponse,
  CompanyVerticalAdminMatrixResponse,
} from '../../appcfg/types';

type Props = { accessToken: string };

export function CompanyControlView({ accessToken }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [matrix, setMatrix]   = useState<CompanyVerticalAdminMatrixResponse | null>(null);
  const [rateMatrix, setRateMatrix] = useState<CompanyRateLimitMatrixResponse | null>(null);
  const [operationalMatrix, setOperationalMatrix] = useState<CompanyOperationalLimitMatrixResponse | null>(null);
  const [selectedVerticalByCompany, setSelectedVerticalByCompany] = useState<Record<number, string>>({});
  const [rateDraftByCompany, setRateDraftByCompany] = useState<Record<number, {
    is_enabled: boolean;
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
    plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
  }>>({});
  const [searchText, setSearchText]               = useState('');
  const [filterVerticalCode, setFilterVerticalCode] = useState('');
  const [bulkVerticalCode, setBulkVerticalCode]     = useState('');
  const [bulkRateRead, setBulkRateRead] = useState(3600);
  const [bulkRateWrite, setBulkRateWrite] = useState(2400);
  const [bulkRateReports, setBulkRateReports] = useState(900);
  const [bulkPresetCode, setBulkPresetCode] = useState<'BASIC' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [opDraftByCompany, setOpDraftByCompany] = useState<Record<number, {
    max_branches_enabled: number;
    max_warehouses_enabled: number;
    max_cash_registers_enabled: number;
    max_cash_registers_per_warehouse: number;
  }>>({});
  const [bulkOpBranches, setBulkOpBranches] = useState(1);
  const [bulkOpWarehouses, setBulkOpWarehouses] = useState(1);
  const [bulkOpCash, setBulkOpCash] = useState(1);
  const [bulkOpCashPerWarehouse, setBulkOpCashPerWarehouse] = useState(1);
  const [commerceMatrix, setCommerceMatrix] = useState<CompanyCommerceAdminMatrixResponse | null>(null);
  const [inventoryMatrix, setInventoryMatrix] = useState<CompanyInventorySettingsAdminMatrixResponse | null>(null);
  const [commerceDraftByCompany, setCommerceDraftByCompany] = useState<Record<number, Record<string, boolean>>>({});
  const [inventoryDraftByCompany, setInventoryDraftByCompany] = useState<Record<number, InventorySettingsRecord>>({});
  const [createDraft, setCreateDraft] = useState({
    tax_id: '',
    legal_name: '',
    trade_name: '',
    email: '',
    phone: '',
    address: '',
    vertical_code: '',
    admin_username: '',
    admin_password: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_phone: '',
    main_branch_code: '001',
    main_branch_name: 'Sucursal Principal',
    create_default_warehouse: true,
    default_warehouse_code: 'ALM-001',
    default_warehouse_name: 'Almacen Principal',
    create_default_cash_register: true,
    default_cash_register_code: 'CAJA-001',
    default_cash_register_name: 'Caja Principal',
    plan_code: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM',
    preset_code: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE',
  });

  const [resetModal, setResetModal] = useState<{
    companyName: string;
    username: string;
    email: string | null;
    newPassword: string;
  } | null>(null);

  async function doResetAdminPassword(companyId: number, companyName: string) {
    if (!confirm(`¿Resetear la contraseña del administrador de "${companyName}"? Se generará una nueva contraseña temporal.`)) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await resetAdminCompanyPassword(accessToken, companyId);
      setResetModal({ companyName, username: result.username, email: result.email, newPassword: result.new_password });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo resetear la contraseña');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function loadMatrix() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const [verticalResult, rateResult, operationalResult, commerceResult, inventoryResult] = await Promise.all([
        fetchCompanyVerticalAdminMatrix(accessToken),
        fetchCompanyRateLimitMatrix(accessToken),
        fetchCompanyOperationalLimitMatrix(accessToken),
        fetchCompanyCommerceAdminMatrix(accessToken),
        fetchCompanyInventorySettingsAdminMatrix(accessToken),
      ]);

      setMatrix(verticalResult);
      setRateMatrix(rateResult);
      setOperationalMatrix(operationalResult);
      setCommerceMatrix(commerceResult);
      setInventoryMatrix(inventoryResult);

      const nextCommerceDraft: Record<number, Record<string, boolean>> = {};
      for (const company of commerceResult.companies) {
        nextCommerceDraft[company.company_id] = { ...company.features };
      }
      setCommerceDraftByCompany(nextCommerceDraft);

      const nextInventoryDraft: Record<number, InventorySettingsRecord> = {};
      for (const company of inventoryResult.companies) {
        nextInventoryDraft[company.company_id] = { ...company.inventory_settings };
      }
      setInventoryDraftByCompany(nextInventoryDraft);

      const nextMap: Record<number, string> = {};
      for (const company of verticalResult.companies) {
        nextMap[company.company_id] = company.active_vertical_code ?? verticalResult.verticals[0]?.code ?? '';
      }
      setSelectedVerticalByCompany(nextMap);

      const nextRateDraft: Record<number, {
        is_enabled: boolean;
        requests_per_minute_read: number;
        requests_per_minute_write: number;
        requests_per_minute_reports: number;
        plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
      }> = {};
      for (const company of rateResult.companies) {
        nextRateDraft[company.company_id] = {
          is_enabled: company.is_enabled,
          requests_per_minute_read: company.requests_per_minute_read,
          requests_per_minute_write: company.requests_per_minute_write,
          requests_per_minute_reports: company.requests_per_minute_reports,
          plan_code: company.plan_code,
        };
      }
      setRateDraftByCompany(nextRateDraft);

      const nextOpDraft: Record<number, {
        max_branches_enabled: number;
        max_warehouses_enabled: number;
        max_cash_registers_enabled: number;
        max_cash_registers_per_warehouse: number;
      }> = {};
      for (const company of operationalResult.companies) {
        nextOpDraft[company.company_id] = {
          max_branches_enabled: company.max_branches_enabled,
          max_warehouses_enabled: company.max_warehouses_enabled,
          max_cash_registers_enabled: company.max_cash_registers_enabled,
          max_cash_registers_per_warehouse: company.max_cash_registers_per_warehouse,
        };
      }
      setOpDraftByCompany(nextOpDraft);

      setBulkVerticalCode(prev => prev || verticalResult.verticals[0]?.code || '');
      setBulkRateRead(rateResult.defaults.requests_per_minute_read);
      setBulkRateWrite(rateResult.defaults.requests_per_minute_write);
      setBulkRateReports(rateResult.defaults.requests_per_minute_reports);
      setBulkPresetCode('PRO');
      setBulkOpBranches(operationalResult.defaults.max_branches_enabled);
      setBulkOpWarehouses(operationalResult.defaults.max_warehouses_enabled);
      setBulkOpCash(operationalResult.defaults.max_cash_registers_enabled);
      setBulkOpCashPerWarehouse(operationalResult.defaults.max_cash_registers_per_warehouse);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo cargar el control de empresas');
      setIsError(true);
      setMatrix(null);
      setRateMatrix(null);
      setOperationalMatrix(null);
      setCommerceMatrix(null);
      setInventoryMatrix(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMatrix(); }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCommerceOne(companyId: number) {
    const draft = commerceDraftByCompany[companyId];
    if (!draft) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyCommerceAdminMatrix(accessToken, companyId, draft);
      setCommerceMatrix(result);
      setMessage('Reglas de ventas/compras actualizadas');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function saveInventoryOne(companyId: number) {
    const draft = inventoryDraftByCompany[companyId];
    if (!draft) return;
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyInventorySettingsAdminMatrix(accessToken, companyId, draft);
      setInventoryMatrix(result);
      setMessage('Configuración de inventario actualizada');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
      setIsError(true);
    } finally { setLoading(false); }
  }

  const filteredCompanies = useMemo(() => {
    return (matrix?.companies ?? []).filter(company => {
      const search = searchText.trim().toLowerCase();
      const bySearch =
        search === '' ||
        company.legal_name.toLowerCase().includes(search) ||
        (company.trade_name ?? '').toLowerCase().includes(search) ||
        (company.tax_id ?? '').toLowerCase().includes(search);
      const byVertical =
        filterVerticalCode === '' ||
        company.active_vertical_code === filterVerticalCode ||
        company.assignments.some(a => a.vertical_code === filterVerticalCode && a.is_enabled);
      return bySearch && byVertical;
    });
  }, [matrix?.companies, searchText, filterVerticalCode]);

  async function toggleOne(companyId: number, isEnabled: boolean) {
    if (!matrix) return;
    const verticalCode = selectedVerticalByCompany[companyId] ?? matrix.verticals[0]?.code ?? '';
    if (!verticalCode) { setMessage('Selecciona un rubro.'); setIsError(true); return; }
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyVerticalAdminMatrix(accessToken, {
        company_id: companyId,
        vertical_code: verticalCode,
        is_enabled: isEnabled,
        make_primary: true,
      });
      setMatrix(result);
      setMessage(isEnabled ? 'Empresa activada correctamente.' : 'Empresa desactivada.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar la empresa');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function toggleBulk(isEnabled: boolean) {
    if (!matrix) return;
    const verticalCode = bulkVerticalCode || matrix.verticals[0]?.code || '';
    const companyIds   = filteredCompanies.map(c => c.company_id);
    if (!verticalCode) { setMessage('Selecciona el rubro para la acción masiva.'); setIsError(true); return; }
    if (companyIds.length === 0) { setMessage('No hay empresas en el filtro actual.'); setIsError(true); return; }
    setLoading(true); setMessage(''); setIsError(false);
    try {
      const result = await updateCompanyVerticalAdminMatrixBulk(accessToken, {
        company_ids: companyIds,
        vertical_code: verticalCode,
        is_enabled: isEnabled,
        make_primary: true,
      });
      setMatrix(result);
      setMessage(
        isEnabled
          ? `Activación masiva completada — ${companyIds.length} empresa(s).`
          : `Desactivación masiva completada — ${companyIds.length} empresa(s).`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la acción masiva');
      setIsError(true);
    } finally { setLoading(false); }
  }

  async function saveRateOne(companyId: number) {
    const draft = rateDraftByCompany[companyId];
    if (!draft) {
      setMessage('No se encontraron valores para guardar.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyRateLimitMatrix(accessToken, {
        company_id: companyId,
        is_enabled: draft.is_enabled,
        requests_per_minute_read: draft.requests_per_minute_read,
        requests_per_minute_write: draft.requests_per_minute_write,
        requests_per_minute_reports: draft.requests_per_minute_reports,
        plan_code: draft.plan_code,
        preset_code: draft.plan_code !== 'CUSTOM' ? draft.plan_code : undefined,
      });
      setRateMatrix(result);
      setRateDraftByCompany(() => {
        const next: Record<number, {
          is_enabled: boolean;
          requests_per_minute_read: number;
          requests_per_minute_write: number;
          requests_per_minute_reports: number;
          plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
        }> = {};
        for (const company of result.companies) {
          next[company.company_id] = {
            is_enabled: company.is_enabled,
            requests_per_minute_read: company.requests_per_minute_read,
            requests_per_minute_write: company.requests_per_minute_write,
            requests_per_minute_reports: company.requests_per_minute_reports,
            plan_code: company.plan_code,
          };
        }
        return next;
      });
      setMessage('Límite por empresa actualizado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar el límite por empresa');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveRateBulk(isEnabled: boolean) {
    const companyIds = filteredCompanies.map(c => c.company_id);
    if (companyIds.length === 0) {
      setMessage('No hay empresas en el filtro actual.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyRateLimitMatrixBulk(accessToken, {
        company_ids: companyIds,
        is_enabled: isEnabled,
        requests_per_minute_read: bulkRateRead,
        requests_per_minute_write: bulkRateWrite,
        requests_per_minute_reports: bulkRateReports,
        plan_code: bulkPresetCode,
        preset_code: bulkPresetCode,
      });
      setRateMatrix(result);
      setRateDraftByCompany(() => {
        const next: Record<number, {
          is_enabled: boolean;
          requests_per_minute_read: number;
          requests_per_minute_write: number;
          requests_per_minute_reports: number;
          plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
        }> = {};
        for (const company of result.companies) {
          next[company.company_id] = {
            is_enabled: company.is_enabled,
            requests_per_minute_read: company.requests_per_minute_read,
            requests_per_minute_write: company.requests_per_minute_write,
            requests_per_minute_reports: company.requests_per_minute_reports,
            plan_code: company.plan_code,
          };
        }
        return next;
      });
      setMessage(`Límites masivos aplicados en ${companyIds.length} empresa(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la actualización masiva de límites');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveOperationalOne(companyId: number) {
    const draft = opDraftByCompany[companyId];
    if (!draft) {
      setMessage('No se encontraron límites operativos para guardar.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyOperationalLimitMatrix(accessToken, {
        company_id: companyId,
        max_branches_enabled: draft.max_branches_enabled,
        max_warehouses_enabled: draft.max_warehouses_enabled,
        max_cash_registers_enabled: draft.max_cash_registers_enabled,
        max_cash_registers_per_warehouse: draft.max_cash_registers_per_warehouse,
      });
      setOperationalMatrix(result);
      setMessage('Límite operativo por empresa actualizado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar límite operativo');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveOperationalBulk() {
    const companyIds = filteredCompanies.map(c => c.company_id);
    if (companyIds.length === 0) {
      setMessage('No hay empresas en el filtro actual.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await updateCompanyOperationalLimitMatrixBulk(accessToken, {
        company_ids: companyIds,
        max_branches_enabled: bulkOpBranches,
        max_warehouses_enabled: bulkOpWarehouses,
        max_cash_registers_enabled: bulkOpCash,
        max_cash_registers_per_warehouse: bulkOpCashPerWarehouse,
      });
      setOperationalMatrix(result);
      setMessage(`Límites operativos masivos aplicados en ${companyIds.length} empresa(s).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo ejecutar la actualización masiva de límites operativos');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  function applyBulkPreset() {
    if (!rateMatrix) return;
    const preset = rateMatrix.presets.find(p => p.code === bulkPresetCode);
    if (!preset) return;
    setBulkRateRead(preset.requests_per_minute_read);
    setBulkRateWrite(preset.requests_per_minute_write);
    setBulkRateReports(preset.requests_per_minute_reports);
  }

  async function copyCompanyAccessLink(companyId: number) {
    const row = matrix?.companies.find(c => c.company_id === companyId);
    if (!row?.access_url) {
      setMessage('La empresa aun no tiene link de acceso.');
      setIsError(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(row.access_url);
      setMessage(`Link copiado: ${row.access_url}`);
      setIsError(false);
    } catch {
      setMessage('No se pudo copiar el link.');
      setIsError(true);
    }
  }

  async function createCompanyFromAdmin() {
    if (!createDraft.tax_id.trim() || !createDraft.legal_name.trim() || !createDraft.admin_username.trim() || !createDraft.admin_password.trim() || !createDraft.admin_first_name.trim()) {
      setMessage('Completa RUC, razon social y datos del admin inicial.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const result = await createAdminCompany(accessToken, {
        tax_id: createDraft.tax_id.trim(),
        legal_name: createDraft.legal_name.trim(),
        trade_name: createDraft.trade_name.trim() || undefined,
        email: createDraft.email.trim() || undefined,
        phone: createDraft.phone.trim() || undefined,
        address: createDraft.address.trim() || undefined,
        vertical_code: createDraft.vertical_code || undefined,
        main_branch_code: createDraft.main_branch_code.trim() || undefined,
        main_branch_name: createDraft.main_branch_name.trim() || undefined,
        create_default_warehouse: createDraft.create_default_warehouse,
        default_warehouse_code: createDraft.default_warehouse_code.trim() || undefined,
        default_warehouse_name: createDraft.default_warehouse_name.trim() || undefined,
        create_default_cash_register: createDraft.create_default_cash_register,
        default_cash_register_code: createDraft.default_cash_register_code.trim() || undefined,
        default_cash_register_name: createDraft.default_cash_register_name.trim() || undefined,
        admin_username: createDraft.admin_username.trim(),
        admin_password: createDraft.admin_password,
        admin_first_name: createDraft.admin_first_name.trim(),
        admin_last_name: createDraft.admin_last_name.trim() || undefined,
        admin_email: createDraft.admin_email.trim() || undefined,
        admin_phone: createDraft.admin_phone.trim() || undefined,
        plan_code: createDraft.plan_code,
        preset_code: createDraft.preset_code,
      });

      await loadMatrix();
      setCreateDraft(prev => ({
        ...prev,
        tax_id: '',
        legal_name: '',
        trade_name: '',
        email: '',
        phone: '',
        address: '',
        admin_username: '',
        admin_password: '',
        admin_first_name: '',
        admin_last_name: '',
        admin_email: '',
        admin_phone: '',
      }));
      setMessage(`Empresa creada (ID ${result.company_id}) con admin inicial.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo crear la empresa');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  const totalCompanies  = matrix?.companies.length ?? 0;
  const activeCompanies = matrix?.companies.filter(c => c.active_vertical_code).length ?? 0;
  const totalVerticals  = matrix?.verticals.length ?? 0;

  return (
    <>
      <div className="adm-page-header">
        <h2>Control de Empresas</h2>
        <p>Administración centralizada de rubros, límites, reglas comerciales e inventario por empresa.</p>
      </div>

      {/* Stats */}
      <div className="adm-stats-row">
        <div className="adm-stat-card accent">
          <div className="adm-stat-label">Total empresas</div>
          <div className="adm-stat-value">{totalCompanies}</div>
          <div className="adm-stat-sub">registradas en el sistema</div>
        </div>
        <div className="adm-stat-card ok">
          <div className="adm-stat-label">Con rubro activo</div>
          <div className="adm-stat-value">{activeCompanies}</div>
          <div className="adm-stat-sub">empresas configuradas</div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-label">Rubros disponibles</div>
          <div className="adm-stat-value">{totalVerticals}</div>
          <div className="adm-stat-sub">en el catálogo</div>
        </div>
        <div className="adm-stat-card warn">
          <div className="adm-stat-label">Sin rubro</div>
          <div className="adm-stat-value">{totalCompanies - activeCompanies}</div>
          <div className="adm-stat-sub">pendientes de configurar</div>
        </div>
      </div>

      {message && (
        <div className={`adm-notice ${isError ? 'adm-notice-err' : 'adm-notice-ok'}`}>
          {message}
        </div>
      )}

      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Alta de Empresa (Panel Admin)</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Crea empresa + sucursal principal + usuario admin</span>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-form-grid">
            <input className="adm-input" placeholder="RUC" value={createDraft.tax_id} onChange={e => setCreateDraft(prev => ({ ...prev, tax_id: e.target.value }))} />
            <input className="adm-input" placeholder="Razon social" value={createDraft.legal_name} onChange={e => setCreateDraft(prev => ({ ...prev, legal_name: e.target.value }))} />
            <input className="adm-input" placeholder="Nombre comercial" value={createDraft.trade_name} onChange={e => setCreateDraft(prev => ({ ...prev, trade_name: e.target.value }))} />
            <input className="adm-input" placeholder="Email empresa" value={createDraft.email} onChange={e => setCreateDraft(prev => ({ ...prev, email: e.target.value }))} />
            <input className="adm-input" placeholder="Telefono empresa" value={createDraft.phone} onChange={e => setCreateDraft(prev => ({ ...prev, phone: e.target.value }))} />
            <input className="adm-input" placeholder="Direccion fiscal" value={createDraft.address} onChange={e => setCreateDraft(prev => ({ ...prev, address: e.target.value }))} />

            <select className="adm-select" value={createDraft.vertical_code} onChange={e => setCreateDraft(prev => ({ ...prev, vertical_code: e.target.value }))}>
              <option value="">Rubro por defecto</option>
              {matrix?.verticals.map(v => <option key={`new-${v.code}`} value={v.code}>{v.name} ({v.code})</option>)}
            </select>
            <select className="adm-select" value={createDraft.plan_code} onChange={e => setCreateDraft(prev => ({ ...prev, plan_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM' }))}>
              <option value="BASIC">Plan BASIC</option>
              <option value="PRO">Plan PRO</option>
              <option value="ENTERPRISE">Plan ENTERPRISE</option>
              <option value="CUSTOM">Plan CUSTOM</option>
            </select>
            <select className="adm-select" value={createDraft.preset_code} onChange={e => setCreateDraft(prev => ({ ...prev, preset_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' }))}>
              <option value="BASIC">Preset BASIC</option>
              <option value="PRO">Preset PRO</option>
              <option value="ENTERPRISE">Preset ENTERPRISE</option>
            </select>

            <input className="adm-input" placeholder="Codigo sucursal (001)" value={createDraft.main_branch_code} onChange={e => setCreateDraft(prev => ({ ...prev, main_branch_code: e.target.value }))} />
            <input className="adm-input" placeholder="Nombre sucursal principal" value={createDraft.main_branch_name} onChange={e => setCreateDraft(prev => ({ ...prev, main_branch_name: e.target.value }))} />
            <select className="adm-select" value={createDraft.create_default_warehouse ? '1' : '0'} onChange={e => setCreateDraft(prev => ({ ...prev, create_default_warehouse: e.target.value === '1' }))}>
              <option value="1">Crear almacen inicial</option>
              <option value="0">Sin almacen inicial</option>
            </select>
            <input className="adm-input" placeholder="Codigo almacen" value={createDraft.default_warehouse_code} onChange={e => setCreateDraft(prev => ({ ...prev, default_warehouse_code: e.target.value }))} />
            <input className="adm-input" placeholder="Nombre almacen" value={createDraft.default_warehouse_name} onChange={e => setCreateDraft(prev => ({ ...prev, default_warehouse_name: e.target.value }))} />
            <select className="adm-select" value={createDraft.create_default_cash_register ? '1' : '0'} onChange={e => setCreateDraft(prev => ({ ...prev, create_default_cash_register: e.target.value === '1' }))}>
              <option value="1">Crear caja inicial</option>
              <option value="0">Sin caja inicial</option>
            </select>
            <input className="adm-input" placeholder="Codigo caja" value={createDraft.default_cash_register_code} onChange={e => setCreateDraft(prev => ({ ...prev, default_cash_register_code: e.target.value }))} />
            <input className="adm-input" placeholder="Nombre caja" value={createDraft.default_cash_register_name} onChange={e => setCreateDraft(prev => ({ ...prev, default_cash_register_name: e.target.value }))} />

            <input className="adm-input" placeholder="Usuario admin inicial" value={createDraft.admin_username} onChange={e => setCreateDraft(prev => ({ ...prev, admin_username: e.target.value }))} />
            <input className="adm-input" type="password" placeholder="Contrasena admin inicial" value={createDraft.admin_password} onChange={e => setCreateDraft(prev => ({ ...prev, admin_password: e.target.value }))} />
            <input className="adm-input" placeholder="Nombre admin" value={createDraft.admin_first_name} onChange={e => setCreateDraft(prev => ({ ...prev, admin_first_name: e.target.value }))} />
            <input className="adm-input" placeholder="Apellido admin" value={createDraft.admin_last_name} onChange={e => setCreateDraft(prev => ({ ...prev, admin_last_name: e.target.value }))} />
            <input className="adm-input" placeholder="Email admin" value={createDraft.admin_email} onChange={e => setCreateDraft(prev => ({ ...prev, admin_email: e.target.value }))} />
            <input className="adm-input" placeholder="Telefono admin" value={createDraft.admin_phone} onChange={e => setCreateDraft(prev => ({ ...prev, admin_phone: e.target.value }))} />
          </div>

          <div className="adm-toolbar" style={{ marginTop: '1rem' }}>
            <button className="adm-btn adm-btn-primary" type="button" onClick={() => void createCompanyFromAdmin()} disabled={loading}>
              Crear empresa desde admin
            </button>
            <span className="adm-form-hint">Se crea tambien sucursal principal y credenciales iniciales del administrador de esa empresa.</span>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Empresas registradas</h3>
          <div className="adm-card-header-actions">
            {loading && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Procesando...</span>}
            <button className="adm-btn adm-btn-secondary" type="button" onClick={() => void loadMatrix()} disabled={loading}>
              ↻ Refrescar
            </button>
          </div>
        </div>

        <div className="adm-card-body">
          {/* Filtros */}
          <div className="adm-toolbar">
            <input
              className="adm-input"
              placeholder="Buscar por empresa o RUC..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select
              className="adm-select"
              value={filterVerticalCode}
              onChange={e => setFilterVerticalCode(e.target.value)}
            >
              <option value="">Todos los rubros</option>
              {matrix?.verticals.map(v => (
                <option key={`filter-${v.code}`} value={v.code}>{v.name} ({v.code})</option>
              ))}
            </select>
          </div>

          {/* Acción masiva */}
          {matrix && (
            <div className="adm-bulk-bar">
              <span className="adm-bulk-bar-label">Acción masiva</span>
              <select
                className="adm-select"
                value={bulkVerticalCode}
                onChange={e => setBulkVerticalCode(e.target.value)}
                disabled={loading}
              >
                {matrix.verticals.map(v => (
                  <option key={`bulk-${v.code}`} value={v.code}>{v.name} ({v.code})</option>
                ))}
              </select>
              <button
                className="adm-btn adm-btn-success"
                type="button"
                disabled={loading || filteredCompanies.length === 0 || !bulkVerticalCode}
                onClick={() => void toggleBulk(true)}
              >
                ✓ Activar filtradas
              </button>
              <button
                className="adm-btn adm-btn-danger"
                type="button"
                disabled={loading || filteredCompanies.length === 0 || !bulkVerticalCode}
                onClick={() => void toggleBulk(false)}
              >
                ✕ Desactivar filtradas
              </button>
              <span className="adm-bulk-count">
                Mostrando <strong>{filteredCompanies.length}</strong> de {totalCompanies} empresas
              </span>
            </div>
          )}

          {/* Tabla */}
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Empresa</th>
                  <th>RUC</th>
                  <th>Admin</th>
                  <th>Link acceso</th>
                  <th>Rubro activo</th>
                  <th>Asignar rubro</th>
                  <th>Estado empresa</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!matrix && !loading && (
                  <tr><td colSpan={9} className="adm-table-empty">Sin datos. Presiona Refrescar para cargar.</td></tr>
                )}
                {matrix && filteredCompanies.length === 0 && (
                  <tr><td colSpan={9} className="adm-table-empty">No hay empresas que coincidan con el filtro.</td></tr>
                )}
                {filteredCompanies.map((company, idx) => {
                  const selected       = selectedVerticalByCompany[company.company_id] ?? company.active_vertical_code ?? matrix?.verticals[0]?.code ?? '';
                  const selectedAssign = company.assignments.find(a => a.vertical_code === selected);
                  const isEnabled      = Boolean(selectedAssign?.is_enabled);

                  return (
                    <tr key={company.company_id}>
                      <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{idx + 1}</td>
                      <td>
                        <span className="adm-td-label">{company.legal_name}</span>
                        {company.trade_name && <span className="adm-td-sub">{company.trade_name}</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#475569' }}>
                        {company.tax_id ?? '—'}
                      </td>
                      <td>
                        {company.admin_username ? (
                          <div>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>{company.admin_username}</span>
                            {company.admin_email && <span style={{ fontSize: '0.73rem', color: '#64748b' }}>{company.admin_email}</span>}
                          </div>
                        ) : (
                          <span className="adm-badge adm-badge-neutral">Sin admin</span>
                        )}
                      </td>
                      <td>
                        {company.access_url ? (
                          <div className="adm-link-cell">
                            <a href={company.access_url} target="_blank" rel="noreferrer" className="adm-link-url">
                              {company.access_url}
                            </a>
                            <button
                              className="adm-btn adm-btn-secondary"
                              type="button"
                              disabled={loading}
                              onClick={() => void copyCompanyAccessLink(company.company_id)}
                            >
                              Copiar
                            </button>
                          </div>
                        ) : (
                          <span className="adm-badge adm-badge-neutral">Sin link</span>
                        )}
                      </td>
                      <td>
                        {company.active_vertical_name
                          ? <span className="adm-badge adm-badge-blue">{company.active_vertical_name}</span>
                          : <span className="adm-badge adm-badge-neutral">Sin rubro</span>
                        }
                      </td>
                      <td>
                        <select
                          className="adm-select"
                          value={selected}
                          onChange={e => setSelectedVerticalByCompany(prev => ({ ...prev, [company.company_id]: e.target.value }))}
                          disabled={loading}
                          style={{ fontSize: '0.8rem' }}
                        >
                          {matrix?.verticals.map(v => (
                            <option key={`${company.company_id}-${v.code}`} value={v.code}>
                              {v.name} ({v.code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`adm-badge ${company.company_status === 1 ? 'adm-badge-ok' : 'adm-badge-off'}`}>
                          {company.company_status === 1 ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            className="adm-btn adm-btn-success"
                            type="button"
                            disabled={loading || isEnabled}
                            onClick={() => void toggleOne(company.company_id, true)}
                          >
                            Activar
                          </button>
                          <button
                            className="adm-btn adm-btn-danger"
                            type="button"
                            disabled={loading || !isEnabled}
                            onClick={() => void toggleOne(company.company_id, false)}
                          >
                            Desactivar
                          </button>
                          <button
                            className="adm-btn adm-btn-secondary"
                            type="button"
                            disabled={loading || !company.admin_username}
                            title={company.admin_username ? 'Generar nueva contraseña para el admin' : 'Esta empresa no tiene admin registrado'}
                            onClick={() => void doResetAdminPassword(company.company_id, company.legal_name)}
                          >
                            Reset pass
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Límites operativos por empresa</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Defaults mínimos: sucursales 1, almacenes 1, cajas 1, cajas/almacén 1
            </span>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-bulk-bar">
            <span className="adm-bulk-bar-label">Ajuste masivo operativo</span>
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpBranches} onChange={e => setBulkOpBranches(Number(e.target.value || 1))} disabled={loading} title="Sucursales max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpWarehouses} onChange={e => setBulkOpWarehouses(Number(e.target.value || 1))} disabled={loading} title="Almacenes max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpCash} onChange={e => setBulkOpCash(Number(e.target.value || 1))} disabled={loading} title="Cajas max" />
            <input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={bulkOpCashPerWarehouse} onChange={e => setBulkOpCashPerWarehouse(Number(e.target.value || 1))} disabled={loading} title="Cajas por almacén" />
            <button className="adm-btn adm-btn-primary" type="button" disabled={loading || filteredCompanies.length === 0} onClick={() => void saveOperationalBulk()}>
              Guardar límites operativos filtradas
            </button>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Sucursales max</th>
                  <th>Almacenes max</th>
                  <th>Cajas max</th>
                  <th>Cajas por almacén max</th>
                  <th>Uso actual</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(company => {
                  const opRow = operationalMatrix?.companies.find(r => r.company_id === company.company_id);
                  const draft = opDraftByCompany[company.company_id] ?? {
                    max_branches_enabled: 1,
                    max_warehouses_enabled: 1,
                    max_cash_registers_enabled: 1,
                    max_cash_registers_per_warehouse: 1,
                  };

                  return (
                    <tr key={`op-${company.company_id}`}>
                      <td>
                        <span className="adm-td-label">{company.legal_name}</span>
                        {company.trade_name && <span className="adm-td-sub">{company.trade_name}</span>}
                      </td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_branches_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_branches_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_warehouses_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_warehouses_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_cash_registers_enabled} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_cash_registers_enabled: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td><input className="adm-input adm-input-mini" type="number" min={1} max={10000} value={draft.max_cash_registers_per_warehouse} onChange={e => setOpDraftByCompany(prev => ({ ...prev, [company.company_id]: { ...draft, max_cash_registers_per_warehouse: Number(e.target.value || 1) } }))} disabled={loading} /></td>
                      <td>
                        <span className="adm-td-sub">S: {opRow?.usage_branches ?? 0} | A: {opRow?.usage_warehouses ?? 0} | C: {opRow?.usage_cash_registers ?? 0}</span>
                      </td>
                      <td>
                        <button className="adm-btn adm-btn-primary" type="button" disabled={loading} onClick={() => void saveOperationalOne(company.company_id)}>
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3>Límites por empresa (aislamiento de carga)</h3>
          <div className="adm-card-header-actions">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {rateMatrix
                ? `Defaults: lectura ${rateMatrix.defaults.requests_per_minute_read}/min, escritura ${rateMatrix.defaults.requests_per_minute_write}/min, reportes ${rateMatrix.defaults.requests_per_minute_reports}/min`
                : 'Cargando defaults...'}
            </span>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-bulk-bar">
            <span className="adm-bulk-bar-label">Ajuste masivo de límites</span>
            <select
              className="adm-select"
              value={bulkPresetCode}
              onChange={e => setBulkPresetCode((e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE'))}
              disabled={loading || !rateMatrix}
              title="Preset de plan"
            >
              {rateMatrix?.presets.map(p => (
                <option key={`preset-${p.code}`} value={p.code}>{p.name}</option>
              ))}
            </select>
            <button
              className="adm-btn adm-btn-secondary"
              type="button"
              disabled={loading || !rateMatrix}
              onClick={applyBulkPreset}
            >
              Aplicar preset
            </button>
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateRead}
              onChange={e => setBulkRateRead(Number(e.target.value || 0))}
              disabled={loading}
              title="Lectura por minuto"
            />
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateWrite}
              onChange={e => setBulkRateWrite(Number(e.target.value || 0))}
              disabled={loading}
              title="Escritura por minuto"
            />
            <input
              className="adm-input adm-input-mini"
              type="number"
              min={100}
              max={60000}
              value={bulkRateReports}
              onChange={e => setBulkRateReports(Number(e.target.value || 0))}
              disabled={loading}
              title="Reportes por minuto"
            />
            <button
              className="adm-btn adm-btn-success"
              type="button"
              disabled={loading || filteredCompanies.length === 0}
              onClick={() => void saveRateBulk(true)}
            >
              Guardar y habilitar filtradas
            </button>
            <button
              className="adm-btn adm-btn-danger"
              type="button"
              disabled={loading || filteredCompanies.length === 0}
              onClick={() => void saveRateBulk(false)}
            >
              Guardar y deshabilitar filtradas
            </button>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>RUC</th>
                  <th>Plan</th>
                  <th>Lectura/min</th>
                  <th>Escritura/min</th>
                  <th>Reportes/min</th>
                  <th>Límite</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(company => {
                  const draft = rateDraftByCompany[company.company_id] ?? {
                    is_enabled: true,
                    requests_per_minute_read: rateMatrix?.defaults.requests_per_minute_read ?? 3600,
                    requests_per_minute_write: rateMatrix?.defaults.requests_per_minute_write ?? 2400,
                    requests_per_minute_reports: rateMatrix?.defaults.requests_per_minute_reports ?? 900,
                    plan_code: 'PRO' as const,
                  };

                  return (
                    <tr key={`rate-${company.company_id}`}>
                      <td>
                        <span className="adm-td-label">{company.legal_name}</span>
                        {company.trade_name && <span className="adm-td-sub">{company.trade_name}</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#475569' }}>{company.tax_id ?? '—'}</td>
                      <td>
                        <select
                          className="adm-select"
                          value={draft.plan_code}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              plan_code: e.target.value as 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM',
                            },
                          }))}
                          disabled={loading}
                        >
                          <option value="BASIC">Basic</option>
                          <option value="PRO">Pro</option>
                          <option value="ENTERPRISE">Enterprise</option>
                          <option value="CUSTOM">Custom</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_read}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_read: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_write}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_write: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <input
                          className="adm-input adm-input-mini"
                          type="number"
                          min={100}
                          max={60000}
                          value={draft.requests_per_minute_reports}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              requests_per_minute_reports: Number(e.target.value || 0),
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <select
                          className="adm-select"
                          value={draft.is_enabled ? '1' : '0'}
                          onChange={e => setRateDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...draft,
                              is_enabled: e.target.value === '1',
                            },
                          }))}
                          disabled={loading}
                        >
                          <option value="1">Habilitado</option>
                          <option value="0">Pausado</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="adm-btn adm-btn-primary"
                          type="button"
                          disabled={loading}
                          onClick={() => void saveRateOne(company.company_id)}
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Commerce features matrix */}
      <div className="adm-section">
        <div className="adm-section-header">
          <h3>Reglas comerciales por empresa (ventas / compras)</h3>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Empresa</th>
                {(commerceMatrix?.feature_codes ?? []).map(code => (
                  <th key={code} title={code}>{code.replace(/^(SALES|PURCHASES)_/, '').replace(/_ENABLED$/, '').replace(/_/g, ' ')}</th>
                ))}
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(commerceMatrix?.companies ?? []).map(company => {
                const draft = commerceDraftByCompany[company.company_id] ?? company.features;
                return (
                  <tr key={company.company_id}>
                    <td>
                      <strong>{company.legal_name}</strong>
                      <br />
                      <small>{company.tax_id}</small>
                    </td>
                    {(commerceMatrix?.feature_codes ?? []).map(code => (
                      <td key={code} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={draft[code] ?? false}
                          onChange={e => setCommerceDraftByCompany(prev => ({
                            ...prev,
                            [company.company_id]: {
                              ...(prev[company.company_id] ?? company.features),
                              [code]: e.target.checked,
                            },
                          }))}
                          disabled={loading}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="adm-btn adm-btn-primary"
                        type="button"
                        disabled={loading}
                        onClick={() => void saveCommerceOne(company.company_id)}
                      >
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory settings matrix */}
      <div className="adm-section">
        <div className="adm-section-header">
          <h3>Configuración de inventario por empresa</h3>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Modo complejidad</th>
                <th>Modo inventario</th>
                <th>Estrategia lotes</th>
                <th>Inv. Pro</th>
                <th>Tracking lotes</th>
                <th>Tracking venc.</th>
                <th>Rep. avanzado</th>
                <th>Dashboard gráf.</th>
                <th>Ubic. control</th>
                <th>Stock neg.</th>
                <th>Exigir lote</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(inventoryMatrix?.companies ?? []).map(company => {
                const s = inventoryDraftByCompany[company.company_id] ?? company.inventory_settings;
                const update = (patch: Partial<InventorySettingsRecord>) =>
                  setInventoryDraftByCompany(prev => ({
                    ...prev,
                    [company.company_id]: { ...(prev[company.company_id] ?? company.inventory_settings), ...patch },
                  }));
                return (
                  <tr key={company.company_id}>
                    <td>
                      <strong>{company.legal_name}</strong>
                      <br />
                      <small>{company.tax_id}</small>
                    </td>
                    <td>
                      <select className="adm-select" value={s.complexity_mode} onChange={e => update({ complexity_mode: e.target.value as InventorySettingsRecord['complexity_mode'] })} disabled={loading}>
                        <option value="BASIC">Básico</option>
                        <option value="ADVANCED">Avanzado</option>
                      </select>
                    </td>
                    <td>
                      <select className="adm-select" value={s.inventory_mode} onChange={e => update({ inventory_mode: e.target.value as InventorySettingsRecord['inventory_mode'] })} disabled={loading}>
                        <option value="KARDEX_SIMPLE">Kardex simple</option>
                        <option value="LOT_TRACKING">Por lotes</option>
                      </select>
                    </td>
                    <td>
                      <select className="adm-select" value={s.lot_outflow_strategy} onChange={e => update({ lot_outflow_strategy: e.target.value as InventorySettingsRecord['lot_outflow_strategy'] })} disabled={loading}>
                        <option value="MANUAL">Manual</option>
                        <option value="FIFO">FIFO</option>
                        <option value="FEFO">FEFO</option>
                      </select>
                    </td>
                    {(['enable_inventory_pro','enable_lot_tracking','enable_expiry_tracking','enable_advanced_reporting','enable_graphical_dashboard','enable_location_control','allow_negative_stock','enforce_lot_for_tracked'] as (keyof InventorySettingsRecord)[]).map(field => (
                      <td key={field} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={s[field] as boolean}
                          onChange={e => update({ [field]: e.target.checked })}
                          disabled={loading}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="adm-btn adm-btn-primary"
                        type="button"
                        disabled={loading}
                        onClick={() => void saveInventoryOne(company.company_id)}
                      >
                        Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
