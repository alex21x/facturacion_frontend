import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../shared/api/client';
import { login, logout } from '../modules/auth/api';
import { LoginForm } from '../modules/auth/components/LoginForm';
import { fetchOperationalContext } from '../modules/appcfg/api';
import { AppConfigView } from '../modules/appcfg/components/AppConfigView';
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

type ModuleTab = 'sales' | 'inventory' | 'purchases' | 'products' | 'customers' | 'masters' | 'appcfg';

const MENU_ITEMS: Array<{
  id: ModuleTab;
  kicker: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'sales',
    kicker: 'Ventas',
    label: 'Comercial',
    hint: 'Emision y seguimiento',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v4H4zM4 11h7v8H4zM13 11h7v3h-7zM13 16h7v3h-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    kicker: 'Stock',
    label: 'Inventario',
    hint: 'Existencias y lotes',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7 12 3l8 4-8 4zM4 11l8 4 8-4M4 15l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'purchases',
    kicker: 'Abastecimiento',
    label: 'Compras',
    hint: 'Ingresos y ajustes',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h3l2.2 10.2a1 1 0 0 0 1 .8H19a1 1 0 0 0 1-.8L22 9H8M10 20a1.2 1.2 0 1 0 0 .01M18 20a1.2 1.2 0 1 0 0 .01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'products',
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
    kicker: 'Sistema',
    label: 'Configuracion',
    hint: 'Permisos y limites',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5zM3 12h2m14 0h2M12 3v2m0 14v2M5.7 5.7l1.4 1.4m9.8 9.8 1.4 1.4M18.3 5.7l-1.4 1.4m-9.8 9.8-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModuleTab>('sales');
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<number | null>(null);

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

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Facturacion V2</p>
        <h1>Frontend Base Operativa</h1>
        <p>
          Proyecto React + TypeScript listo para conectar con el backend Laravel.
          Base URL API: <code>{apiClient.baseUrl}</code>
        </p>
        <div className="chips">
          <span>Auth</span>
          <span>Sales</span>
          <span>Inventory</span>
          <span>Purchases</span>
          <span>Products</span>
          <span>Customers</span>
          <span>Masters</span>
          <span>AppCfg</span>
        </div>

        {!session && (
          <>
            <h2 className="section-title">Login</h2>
            <LoginForm onSubmit={handleLogin} isLoading={isLoading} />
          </>
        )}

        {errorMessage && <p className="error-box">{errorMessage}</p>}

        {session && (
          <section className="session-box">
            <h2 className="section-title">Sesion activa</h2>
            <p>
              <strong>Usuario:</strong> {fullName} ({session.user.username})
            </p>
            <p>
              <strong>Empresa:</strong> {session.user.company_id} | <strong>Sucursal:</strong>{' '}
              {selectedBranchId ?? session.user.branch_id ?? 'N/A'}
            </p>
            {context && (
              <div className="grid-form">
                <label>
                  Sucursal activa
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
                  Almacen activo
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
                  Caja activa
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
            <p>
              <strong>Expira:</strong> {session.expiresAt}
            </p>
            <button className="danger" onClick={handleLogout} type="button">
              Cerrar sesion
            </button>
          </section>
        )}

        {session && (
          <section className="workspace-panel">
            <nav className="tab-nav">
              {MENU_ITEMS.map((item) => (
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
            </nav>

            {activeTab === 'sales' && (
              <SalesView
                accessToken={session.accessToken}
                branchId={selectedBranchId}
                warehouseId={selectedWarehouseId}
                cashRegisterId={selectedCashRegisterId}
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
          </section>
        )}
      </section>
    </main>
  );
}
