import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../shared/api/client';
import { login, logout } from '../modules/auth/api';
import { LoginForm } from '../modules/auth/components/LoginForm';
import { fetchOperationalContext } from '../modules/appcfg/api';
import { AppConfigView } from '../modules/appcfg/components/AppConfigView';
import { CashView } from '../modules/cash/components/CashView';
import { CompanyConfigView } from '../modules/company/components/CompanyConfigView';
import { CustomersView } from '../modules/customers/components/CustomersView';
import type { OperationalContextResponse } from '../modules/appcfg/types';
import { InventoryView } from '../modules/inventory/components/InventoryView';
import { MastersView } from '../modules/masters/components/MastersView';
import { ProductsView } from '../modules/products/components/ProductsView';
import { PurchasesView } from '../modules/purchases/components/PurchasesView';
import { SalesView } from '../modules/sales/components/SalesView';
import {
  clearAuthSession,
  loadAuthSession,
  onAuthSessionChanged,
  saveAuthSession,
} from '../modules/auth/storage';
import type { AuthSession, LoginPayload } from '../modules/auth/types';

type UiDensity = 'normal' | 'compact';

const UI_DENSITY_STORAGE_KEY = 'facturacion.uiDensity';

type ModuleTab =
  | 'cash'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'products'
  | 'customers'
  | 'masters'
  | 'appcfg'
  | 'company';

type MenuGroup =
  | 'operacion'
  | 'abastecimiento'
  | 'catalogo'
  | 'relaciones'
  | 'administracion';

const MENU_GROUPS: Array<{ id: MenuGroup; label: string }> = [
  { id: 'operacion', label: 'Operacion diaria' },
  { id: 'abastecimiento', label: 'Stock y compras' },
  { id: 'catalogo', label: 'Catalogo maestro' },
  { id: 'relaciones', label: 'Relacion comercial' },
  { id: 'administracion', label: 'Configuracion' },
];

const MENU_ITEMS: Array<{
  id: ModuleTab;
  group: MenuGroup;
  kicker: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  moduleCode?: string;
}> = [
  {
    id: 'cash',
    group: 'operacion',
    kicker: 'Tesoreria',
    label: 'Caja',
    hint: 'Sesiones y movimientos',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zm0 0V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M9 13h6M12 13v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'sales',
    group: 'operacion',
    kicker: 'Ventas',
    label: 'Comercial',
    hint: 'Emision y seguimiento',
    moduleCode: 'SALES',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v4H4zM4 11h7v8H4zM13 11h7v3h-7zM13 16h7v3h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    group: 'abastecimiento',
    kicker: 'Stock',
    label: 'Inventario',
    hint: 'Existencias y lotes',
    moduleCode: 'INVENTORY',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7 12 3l8 4-8 4zM4 11l8 4 8-4M4 15l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'purchases',
    group: 'abastecimiento',
    kicker: 'Abastecimiento',
    label: 'Compras',
    hint: 'Ingresos y ajustes',
    moduleCode: 'INVENTORY',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h3l2.2 10.2a1 1 0 0 0 1 .8H19a1 1 0 0 0 1-.8L22 9H8M10 20a1.2 1.2 0 1 0 0 .01M18 20a1.2 1.2 0 1 0 0 .01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'products',
    group: 'catalogo',
    kicker: 'Catalogo',
    label: 'Productos',
    hint: 'SKU, precios y estado',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16v12H4zM8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'customers',
    group: 'relaciones',
    kicker: 'Relacion',
    label: 'Clientes',
    hint: 'Documentos y datos',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a5 5 0 0 1 10 0M13 19a5 5 0 0 1 8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'masters',
    group: 'catalogo',
    kicker: 'Catalogos',
    label: 'Maestros',
    hint: 'Series, cajas y reglas',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v6H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 13h7v6H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'appcfg',
    group: 'administracion',
    kicker: 'Sistema',
    label: 'Configuracion',
    hint: 'Permisos y limites',
    moduleCode: 'APPCFG',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5zM3 12h2m14 0h2M12 3v2m0 14v2M5.7 5.7l1.4 1.4m9.8 9.8 1.4 1.4M18.3 5.7l-1.4 1.4m-9.8 9.8-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'company',
    group: 'administracion',
    kicker: 'Empresa',
    label: 'Mi Empresa',
    hint: 'RUC, logo, certificado',
    moduleCode: 'APPCFG',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 11h2v4H9zM13 11h2v4h-2zM9 19h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModuleTab>('sales');
  const [menuSearch, setMenuSearch] = useState('');
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<number | null>(null);
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const [isSessionDetailsOpen, setIsSessionDetailsOpen] = useState(false);
  const [uiDensity, setUiDensity] = useState<UiDensity>(() => {
    if (typeof window === 'undefined') {
      return 'compact';
    }

    const saved = window.localStorage.getItem(UI_DENSITY_STORAGE_KEY);
    return saved === 'normal' ? 'normal' : 'compact';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, uiDensity);
  }, [uiDensity]);

  useEffect(() => {
    return onAuthSessionChanged((nextSession) => {
      setSession(nextSession);
    });
  }, []);

  const fullName = useMemo(() => {
    if (!session?.user) {
      return '';
    }

    return `${session.user.first_name} ${session.user.last_name}`.trim();
  }, [session]);

  const permittedMenuItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      if (!item.moduleCode) return true;
      const perms = session?.user?.permissions;
      if (!perms) return true;
      const perm = perms[item.moduleCode];
      if (!perm) return true;
      return perm.can_view;
    });
  }, [session?.user?.permissions]);

  const filteredMenuItems = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    if (!query) {
      return permittedMenuItems;
    }

    return permittedMenuItems.filter((item) => {
      const source = `${item.kicker} ${item.label} ${item.hint}`.toLowerCase();
      return source.includes(query);
    });
  }, [permittedMenuItems, menuSearch]);

  const activeMenuItem = useMemo(() => {
    return MENU_ITEMS.find((item) => item.id === activeTab) ?? MENU_ITEMS[0];
  }, [activeTab]);

  const groupedMenuItems = useMemo(() => {
    const grouped: Record<MenuGroup, typeof MENU_ITEMS> = {
      operacion: [],
      abastecimiento: [],
      catalogo: [],
      relaciones: [],
      administracion: [],
    };

    filteredMenuItems.forEach((item) => {
      grouped[item.group].push(item);
    });

    return grouped;
  }, [filteredMenuItems]);

  async function handleLogin(payload: LoginPayload): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await login(payload);
      const nextSession: AuthSession = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresAt: response.access_expires_at,
        deviceId: response.device_id,
        user: response.user,
      };

      saveAuthSession(nextSession);
      setSession(nextSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout(): Promise<void> {
    if (!session) {
      return;
    }

    try {
      await logout(session.accessToken);
    } catch {
      // Ignore API errors and clear local session anyway.
    } finally {
      clearAuthSession();
      setSession(null);
      setContext(null);
      setSelectedBranchId(null);
      setSelectedWarehouseId(null);
      setSelectedCashRegisterId(null);
    }
  }

  async function loadOperationalContext(
    accessToken: string,
    branchId?: number | null,
    warehouseId?: number | null,
    cashRegisterId?: number | null
  ): Promise<void> {
    try {
      const nextContext = await fetchOperationalContext(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId,
      });

      setContext(nextContext);

      const nextBranchId =
        branchId ??
        nextContext.selected.branch_id ??
        nextContext.branches[0]?.id ??
        null;
      const nextWarehouseId =
        warehouseId ??
        nextContext.selected.warehouse_id ??
        nextContext.warehouses.find((row) => row.branch_id === nextBranchId || row.branch_id === null)?.id ??
        nextContext.warehouses[0]?.id ??
        null;
      const nextCashRegisterId =
        cashRegisterId ??
        nextContext.selected.cash_register_id ??
        nextContext.cash_registers.find((row) => row.branch_id === nextBranchId || row.branch_id === null)?.id ??
        nextContext.cash_registers[0]?.id ??
        null;

      setSelectedBranchId(nextBranchId);
      setSelectedWarehouseId(nextWarehouseId);
      setSelectedCashRegisterId(nextCashRegisterId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar contexto operativo';
      setErrorMessage(message);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadOperationalContext(session.accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadOperationalContext(
      session.accessToken,
      selectedBranchId,
      selectedWarehouseId,
      selectedCashRegisterId
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  useEffect(() => {
    if (!permittedMenuItems.find((item) => item.id === activeTab)) {
      setActiveTab(permittedMenuItems[0]?.id ?? 'cash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permittedMenuItems]);

  useEffect(() => {
    setIsContextPickerOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!session) {
      setIsSessionDetailsOpen(false);
    }
  }, [session]);

  return (
    <main className={`app-shell ${uiDensity === 'compact' ? 'density-compact' : ''}`}>
      <section className="hero">
        <header className="workspace-head">
          <div>
            <p className="eyebrow">Facturacion</p>
            <h1>Operaciones</h1>
          </div>
          <div className="workspace-status">
            <span>API: {apiClient.baseUrl}</span>
            <span>{session ? 'Sesion iniciada' : 'Sin sesion'}</span>
            <label className="density-switch">
              <span>Densidad</span>
              <select
                value={uiDensity}
                onChange={(e) => setUiDensity(e.target.value as UiDensity)}
                aria-label="Cambiar densidad visual"
              >
                <option value="normal">Normal</option>
                <option value="compact">Compacto</option>
              </select>
            </label>
          </div>
        </header>

        {!session && (
          <>
            <h2 className="section-title">Login</h2>
            <LoginForm onSubmit={handleLogin} isLoading={isLoading} />
          </>
        )}

        {errorMessage && <p className="error-box">{errorMessage}</p>}

        {session && (
          <section className="session-box">
            <div className="session-inline">
              <span className="session-pill">
                Usuario: {fullName || session.user.username}
              </span>
              <span className="session-pill">
                Empresa: {session.user.company_id} | Sucursal: {selectedBranchId ?? session.user.branch_id ?? 'N/A'}
              </span>
              <span className="session-pill">
                Token: {session.expiresAt}
              </span>
              <div className="session-inline-actions">
                <button
                  type="button"
                  className="session-toggle-btn"
                  onClick={() => setIsSessionDetailsOpen((prev) => !prev)}
                >
                  {isSessionDetailsOpen ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
                <button className="danger" onClick={handleLogout} type="button">
                  Cerrar sesion
                </button>
              </div>
            </div>

            {isSessionDetailsOpen && (
              <div className="session-summary">
                <div>
                  <span className="session-kicker">Sesion activa</span>
                  <strong>{fullName || session.user.username}</strong>
                  <small>@{session.user.username}</small>
                </div>
                <div>
                  <span className="session-kicker">Empresa / Sucursal</span>
                  <strong>{session.user.company_id}</strong>
                  <small>{selectedBranchId ?? session.user.branch_id ?? 'N/A'}</small>
                </div>
                <div>
                  <span className="session-kicker">Token</span>
                  <strong>Expira</strong>
                  <small>{session.expiresAt}</small>
                </div>
              </div>
            )}
          </section>
        )}

        {session && (
          <section className="workspace-panel">
            <aside className="menu-panel">
              <label className="menu-search">
                <span>Buscar modulo</span>
                <input
                  type="text"
                  placeholder="Ej. caja, inventario, empresa..."
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                />
              </label>

              <div className="menu-meta">
                <span>{filteredMenuItems.length} modulos</span>
                <span>Sucursal {selectedBranchId ?? 'N/A'}</span>
                <span>Caja {selectedCashRegisterId ?? 'N/A'}</span>
              </div>

              <nav className="tab-nav" aria-label="Modulos del sistema">
                {MENU_GROUPS.map((group) => {
                  const items = groupedMenuItems[group.id];
                  if (!items.length) {
                    return null;
                  }

                  return (
                    <section key={group.id} className="menu-group">
                      <p className="menu-group-title">{group.label}</p>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          className={activeTab === item.id ? 'active' : ''}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          aria-current={activeTab === item.id ? 'page' : undefined}
                        >
                          <span className="menu-head">
                            <span className="menu-icon-wrap">{item.icon}</span>
                            <span>
                              <span className="menu-kicker">{item.kicker}</span>
                              <span className="menu-label">{item.label}</span>
                              <span className="menu-sub">{item.hint}</span>
                            </span>
                          </span>
                          <span className="menu-arrow" aria-hidden="true">&rsaquo;</span>
                        </button>
                      ))}
                    </section>
                  );
                })}
                {filteredMenuItems.length === 0 && (
                  <p className="notice" style={{ margin: 0 }}>No hay modulos que coincidan con la busqueda.</p>
                )}
              </nav>
            </aside>

            <section className="content-panel">
              <header className="active-module-head">
                <div>
                  <p className="eyebrow">Seccion activa</p>
                  <h2>{activeMenuItem.label}</h2>
                  <p>{activeMenuItem.hint}</p>
                </div>
                <div className="active-module-meta active-module-meta-with-context">
                  <span>{activeMenuItem.kicker}</span>
                  <span>
                    {selectedBranchId ? `S ${selectedBranchId}` : 'S -'} |
                    {selectedWarehouseId ? ` A ${selectedWarehouseId}` : ' A -'} |
                    {selectedCashRegisterId ? ` C ${selectedCashRegisterId}` : ' C -'}
                  </span>

                  {context && (
                    <div className="active-context-actions" role="group" aria-label="Contexto operativo">
                      <button
                        type="button"
                        className="context-toggle-btn"
                        onClick={() => setIsContextPickerOpen((prev) => !prev)}
                      >
                        {isContextPickerOpen ? 'Ocultar contexto' : 'Cambiar contexto'}
                      </button>

                      {isContextPickerOpen && (
                        <div className="active-context-popover">
                          <label>
                            <span>Sucursal</span>
                            <select
                              value={selectedBranchId ?? ''}
                              onChange={(e) => {
                                const value = e.target.value ? Number(e.target.value) : null;
                                setSelectedBranchId(value);
                                setSelectedWarehouseId(null);
                                setSelectedCashRegisterId(null);
                              }}
                            >
                              <option value="">Seleccionar</option>
                              {context.branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.code} - {branch.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span>Almacen</span>
                            <select
                              value={selectedWarehouseId ?? ''}
                              onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">Seleccionar</option>
                              {context.warehouses
                                .filter((row) => row.branch_id === null || row.branch_id === selectedBranchId)
                                .map((warehouse) => (
                                  <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code} - {warehouse.name}
                                  </option>
                                ))}
                            </select>
                          </label>

                          <label>
                            <span>Caja</span>
                            <select
                              value={selectedCashRegisterId ?? ''}
                              onChange={(e) => setSelectedCashRegisterId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">Seleccionar</option>
                              {context.cash_registers
                                .filter((row) => row.branch_id === null || row.branch_id === selectedBranchId)
                                .map((cash) => (
                                  <option key={cash.id} value={cash.id}>
                                    {cash.code} - {cash.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {activeTab === 'cash' && (
                <CashView
                  accessToken={session.accessToken}
                  cashRegisterId={selectedCashRegisterId}
                />
              )}
              {activeTab === 'sales' && (
                <SalesView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                  cashRegisterId={selectedCashRegisterId}
                  currentUserRoleCode={session.user.role_code ?? null}
                  currentUserRoleProfile={session.user.role_profile ?? null}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryView accessToken={session.accessToken} warehouseId={selectedWarehouseId} />
              )}
              {activeTab === 'purchases' && (
                <PurchasesView accessToken={session.accessToken} warehouseId={selectedWarehouseId} />
              )}
              {activeTab === 'products' && (
                <ProductsView accessToken={session.accessToken} />
              )}
              {activeTab === 'customers' && (
                <CustomersView accessToken={session.accessToken} />
              )}
              {activeTab === 'masters' && (
                <MastersView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                  currentUserRoleCode={session.user.role_code ?? null}
                />
              )}
              {activeTab === 'appcfg' && (
                <AppConfigView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                  cashRegisterId={selectedCashRegisterId}
                />
              )}
              {activeTab === 'company' && (
                <CompanyConfigView accessToken={session.accessToken} />
              )}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}
