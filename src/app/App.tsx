import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../shared/api/client';
import { login, logout } from '../modules/auth/api';
import { LoginForm } from '../modules/auth/components/LoginForm';
import { fetchCompanyVerticalSettings, fetchOperationalContext } from '../modules/appcfg/api';
import { AppConfigView } from '../modules/appcfg/components/AppConfigView';
import { CashView } from '../modules/cash/components/CashView';
import { CompanyConfigView } from '../modules/company/components/CompanyConfigView';
import { CustomersView } from '../modules/customers/components/CustomersView';
import type { CompanyVerticalSettingsResponse, OperationalContextResponse } from '../modules/appcfg/types';
import { RestaurantInventoryView } from '../modules/inventory/components/RestaurantInventoryView';
import { RetailInventoryView } from '../modules/inventory/components/RetailInventoryView';
import { MastersView } from '../modules/masters/components/MastersView';
import { RestaurantMenuProductsView } from '../modules/products/components/RestaurantMenuProductsView';
import { RestaurantSuppliesProductsView } from '../modules/products/components/RestaurantSuppliesProductsView';
import { RetailProductsView } from '../modules/products/components/RetailProductsView';
import { RestaurantPurchasesView } from '../modules/purchases/components/RestaurantPurchasesView';
import { RetailPurchasesView } from '../modules/purchases/components/RetailPurchasesView';
import { ReportsCenterView } from '../modules/reports/components/ReportsCenterView';
import { ComandasView } from '../modules/restaurant/components/ComandasView';
import { RestaurantOrderView } from '../modules/restaurant/components/RestaurantOrderView';
import { TablesView } from '../modules/restaurant/components/TablesView';
import { fetchSalesLookups } from '../modules/sales/api';
import { SalesView } from '../modules/sales/components/SalesView';
import { DailySummaryView } from '../modules/sales/components/DailySummaryView';
import { GreGuidesView } from '../modules/sales/components/GreGuidesView';
import { SunatExceptionsView } from '../modules/sales/components/SunatExceptionsView';
import {
  clearAuthSession,
  loadAuthSession,
  onAuthSessionChanged,
  saveAuthSession,
} from '../modules/auth/storage';
import type { AuthSession, LoginPayload } from '../modules/auth/types';

type UiDensity = 'normal' | 'compact';
type SalesFlowMode = 'DIRECT_CASHIER' | 'SELLER_TO_CASHIER';

const UI_DENSITY_STORAGE_KEY = 'facturacion.uiDensity';

type ModuleTab =
  | 'cash'
  | 'restaurant-orders'
  | 'comandas'
  | 'tables'
  | 'sales'
  | 'daily-summary'
  | 'gre-guides'
  | 'sunat-exceptions'
  | 'inventory'
  | 'purchases'
  | 'reports'
  | 'restaurant-menu'
  | 'restaurant-supplies'
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
  /**
   * If set, this tab is ONLY visible when the active vertical matches one of
   * these codes (case-insensitive). Add a new vertical here — no other code
   * changes needed to gate the tab.
   */
  onlyVerticals?: string[];
  /**
   * Per-vertical label overrides. The base kicker/label/hint are the retail
   * (default) values. Each vertical can override any or all three fields so
   * the same underlying module feels native to that rubro.
   * e.g. { RESTAURANT: { label: 'Menu del Restaurante', hint: 'Platos y bebidas' } }
   */
  verticalLabels?: Partial<Record<string, { kicker?: string; label?: string; hint?: string }>>;
}> = [
  {
    id: 'cash',
    group: 'operacion',
    kicker: 'Tesoreria',
    label: 'Caja',
    hint: 'Sesiones y movimientos',
    verticalLabels: {
      RESTAURANT: {
        kicker: 'Caja del Dia',
        label: 'Caja',
        hint: 'Apertura de turno, cobros de mesas y cierre',
      },
    },
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zm0 0V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2M9 13h6M12 13v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'restaurant-orders',
    group: 'operacion',
    kicker: 'Restaurante',
    label: 'Pedidos',
    hint: 'Crear órdenes por mesa',
    moduleCode: 'SALES',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'comandas',
    group: 'operacion',
    kicker: 'Restaurante',
    label: 'Comandas',
    hint: 'Cocina, mesa y despacho',
    moduleCode: 'SALES',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4v8m10-8v8M4 12h16M6 20h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'tables',
    group: 'operacion',
    kicker: 'Restaurante',
    label: 'Mesas',
    hint: 'Salones, capacidad y estado',
    moduleCode: 'SALES',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10h18M6 10V6h12v4M7 10v8m10-8v8M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    id: 'daily-summary',
    group: 'operacion',
    kicker: 'Ventas',
    label: 'Resumen Diario',
    hint: 'Declaracion y anulacion de boletas',
    moduleCode: 'SALES',
    verticalLabels: {
      RESTAURANT: { kicker: 'SUNAT', hint: 'Declaracion diaria de boletas emitidas en el restaurante' },
    },
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16v4H4zM4 10h10v10H4zM16 14l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'gre-guides',
    group: 'operacion',
    kicker: 'SUNAT',
    label: 'Guia GRE',
    hint: 'Remitente, transportista y envio',
    moduleCode: 'SALES',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h10v12H4zM14 9h6v9h-6zM7 9h4m-4 3h4m-4 3h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'sunat-exceptions',
    group: 'operacion',
    kicker: 'SUNAT',
    label: 'Excepciones',
    hint: 'Pendientes y confirmacion manual',
    moduleCode: 'SALES',
    verticalLabels: {
      RESTAURANT: { hint: 'Comprobantes del restaurante pendientes de envio a SUNAT' },
    },
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9v4m0 4h.01M4 20h16L12 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    verticalLabels: {
      RESTAURANT: {
        kicker: 'Bodega',
        label: 'Insumos y Bodega',
        hint: 'Stock de ingredientes, bebidas e insumos de cocina',
      },
    },
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
    verticalLabels: {
      RESTAURANT: {
        kicker: 'Cocina',
        label: 'Compras de Insumos',
        hint: 'Compras al proveedor: carnes, verduras, bebidas e insumos',
      },
    },
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h3l2.2 10.2a1 1 0 0 0 1 .8H19a1 1 0 0 0 1-.8L22 9H8M10 20a1.2 1.2 0 1 0 0 .01M18 20a1.2 1.2 0 1 0 0 .01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'reports',
    group: 'abastecimiento',
    kicker: 'Analitica',
    label: 'Reportes',
    hint: 'Centro unificado de reportes',
    moduleCode: 'INVENTORY',
    verticalLabels: {
      RESTAURANT: {
        hint: 'Ventas por mesa, platos mas vendidos y recaudacion diaria',
      },
    },
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16M6 16V9m6 7V5m6 11v-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'restaurant-menu',
    group: 'catalogo',
    kicker: 'Carta',
    label: 'Menu',
    hint: 'Platos, bebidas, combos y precios',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'restaurant-supplies',
    group: 'catalogo',
    kicker: 'Bodega',
    label: 'Insumos',
    hint: 'Ingredientes, abarrotes y bebidas base',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7 12 3l8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'products',
    group: 'catalogo',
    kicker: 'Catalogo',
    label: 'Productos',
    hint: 'SKU, precios y estado',
    verticalLabels: {
      RESTAURANT: {
        kicker: 'Carta',
        label: 'Menu del Restaurante',
        hint: 'Platos, bebidas, combos y precios de venta',
      },
    },
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
    verticalLabels: {
      RESTAURANT: {
        kicker: 'Salon',
        label: 'Comensales',
        hint: 'Clientes frecuentes, datos de facturacion y preferencias',
      },
    },
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
    verticalLabels: {
      RESTAURANT: {
        hint: 'Series de comprobantes, modos de pago y configuracion de cajas',
      },
    },
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

const HIDDEN_TABS_BY_VERTICAL: Partial<Record<string, ModuleTab[]>> = {
  RETAIL: ['comandas', 'tables'],
  RESTAURANT: ['sales', 'gre-guides', 'products'],
  SERVICES: ['inventory', 'purchases', 'gre-guides'],
  WORKSHOP: ['daily-summary', 'gre-guides'],
};

/**
 * Determine whether a menu item should be visible for the active vertical.
 *
 * Rules (evaluated in order):
 *  1. If the item declares `onlyVerticals`, it is EXCLUSIVE to those verticals.
 *     Adding a new vertical's exclusive tab = set onlyVerticals on that item.
 *     No other code change needed.
 *  2. Otherwise fall through to the HIDDEN_TABS_BY_VERTICAL blocklist
 *     (tabs that are universally redundant in a specific vertical).
 *  3. With no vertical context, everything is visible (dev/demo mode).
 */
function isTabVisibleByVertical(
  item: (typeof MENU_ITEMS)[number],
  verticalCode: string | null,
): boolean {
  const code = (verticalCode ?? '').toUpperCase();

  if (item.onlyVerticals?.length) {
    return item.onlyVerticals.map((v) => v.toUpperCase()).includes(code);
  }

  if (!verticalCode) {
    return true;
  }

  const hiddenTabs = HIDDEN_TABS_BY_VERTICAL[code] ?? [];
  return !hiddenTabs.includes(item.id);
}

/**
 * Apply per-vertical label overrides to a menu item.
 * Returns { kicker, label, hint } with vertical-specific text when available,
 * falling back to the generic (retail) defaults.
 */
function resolveVerticalLabel(
  item: (typeof MENU_ITEMS)[number],
  verticalCode: string | null,
): { kicker: string; label: string; hint: string } {
  const override = verticalCode
    ? item.verticalLabels?.[verticalCode.toUpperCase()]
    : undefined;
  return {
    kicker: override?.kicker ?? item.kicker,
    label:  override?.label  ?? item.label,
    hint:   override?.hint   ?? item.hint,
  };
}

function resolveTenantAccessSlugFromPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const match = window.location.pathname.match(/^\/t\/([^/]+)/i);
  if (!match || !match[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]).trim().toLowerCase() || null;
  } catch {
    return String(match[1]).trim().toLowerCase() || null;
  }
}

export function App() {
  const tenantAccessSlug = resolveTenantAccessSlugFromPath();
  const authScope = tenantAccessSlug ? `tenant:${tenantAccessSlug}` : 'default';
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession(authScope));
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
  const [salesFlowMode, setSalesFlowMode] = useState<SalesFlowMode>('DIRECT_CASHIER');
  const [activeVertical, setActiveVertical] = useState<CompanyVerticalSettingsResponse['active_vertical'] | null>(null);
  const [uiDensity, setUiDensity] = useState<UiDensity>(() => {
    if (typeof window === 'undefined') {
      return 'compact';
    }

    const saved = window.localStorage.getItem(UI_DENSITY_STORAGE_KEY);
    return saved === 'normal' ? 'normal' : 'compact';
  });
  const contentPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, uiDensity);
  }, [uiDensity]);

  useEffect(() => {
    return onAuthSessionChanged((nextSession) => {
      setSession(nextSession);
    }, authScope);
  }, [authScope]);

  const fullName = useMemo(() => {
    if (!session?.user) {
      return '';
    }

    return `${session.user.first_name} ${session.user.last_name}`.trim();
  }, [session]);

  const normalizedRoleCode = (session?.user?.role_code ?? '').toUpperCase();
  const normalizedRoleProfile = (session?.user?.role_profile ?? '').toUpperCase();
  const isAdminUser = normalizedRoleCode.includes('ADMIN');
  const isCashierUser = normalizedRoleProfile === 'CASHIER' || normalizedRoleCode.includes('CAJA') || normalizedRoleCode.includes('CAJER') || normalizedRoleCode.includes('CASHIER');
  const isSellerUser = normalizedRoleProfile === 'SELLER' || normalizedRoleCode.includes('VENDED') || normalizedRoleCode.includes('SELLER');
  const shouldHideCashModule = salesFlowMode === 'SELLER_TO_CASHIER' && isSellerUser && !isCashierUser && !isAdminUser;

  const permittedMenuItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      if (item.id === 'cash' && shouldHideCashModule) {
        return false;
      }

      if (!isTabVisibleByVertical(item, activeVertical?.code ?? null)) {
        return false;
      }

      if (!item.moduleCode) return true;
      const perms = session?.user?.permissions;
      if (!perms) return true;
      const perm = perms[item.moduleCode];
      if (!perm) return true;
      return perm.can_view;
    });
  }, [activeVertical?.code, session?.user?.permissions, shouldHideCashModule]);

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
    const item = MENU_ITEMS.find((m) => m.id === activeTab) ?? MENU_ITEMS[0];
    const resolved = resolveVerticalLabel(item, activeVertical?.code ?? null);
    return { ...item, ...resolved };
  }, [activeTab, activeVertical?.code]);

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

  function handleMenuTabSelect(nextTab: ModuleTab): void {
    setActiveTab(nextTab);

    if (typeof window === 'undefined') {
      return;
    }

    // On mobile/tablet, jump directly to module content after tapping a menu item.
    if (window.matchMedia('(max-width: 980px)').matches) {
      window.requestAnimationFrame(() => {
        contentPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }

  async function handleLogin(payload: LoginPayload): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await login({
        ...payload,
        company_access_slug: tenantAccessSlug ?? undefined,
      });
      const nextSession: AuthSession = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresAt: response.access_expires_at,
        deviceId: response.device_id,
        user: response.user,
      };

      saveAuthSession(nextSession, authScope);
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
      clearAuthSession(authScope);
      setSession(null);
      setContext(null);
      setActiveVertical(null);
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
        nextContext.cash_registers.find((row) => (row.branch_id === nextBranchId || row.branch_id === null) && (row.warehouse_id === nextWarehouseId || row.warehouse_id === null))?.id ??
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
    if (!session) {
      setActiveVertical(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const settings = await fetchCompanyVerticalSettings(session.accessToken);
        if (!cancelled) {
          setActiveVertical(settings.active_vertical);
        }
      } catch {
        if (!cancelled) {
          setActiveVertical(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setSalesFlowMode('DIRECT_CASHIER');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const lookups = await fetchSalesLookups(session.accessToken, {
          branchId: selectedBranchId,
        });

        if (cancelled) {
          return;
        }

        const isSeparatedMode = Boolean(
          (lookups.commerce_features ?? []).find((row) => row.feature_code === 'SALES_SELLER_TO_CASHIER')?.is_enabled
        );

        setSalesFlowMode(isSeparatedMode ? 'SELLER_TO_CASHIER' : 'DIRECT_CASHIER');
      } catch {
        if (!cancelled) {
          setSalesFlowMode('DIRECT_CASHIER');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, selectedBranchId]);

  useEffect(() => {
    if (!permittedMenuItems.find((item) => item.id === activeTab)) {
      setActiveTab(permittedMenuItems[0]?.id ?? 'cash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permittedMenuItems]);

  useEffect(() => {
    if (shouldHideCashModule && activeTab === 'cash') {
      const fallbackTab = permittedMenuItems.find((item) => item.id !== 'cash')?.id ?? 'sales';
      setActiveTab(fallbackTab);
    }
  }, [activeTab, permittedMenuItems, shouldHideCashModule]);

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
                <span>Rubro {activeVertical?.name ?? 'N/A'}</span>
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
                      {items.map((item) => {
                          const resolved = resolveVerticalLabel(item, activeVertical?.code ?? null);
                          return (
                        <button
                          key={item.id}
                          className={activeTab === item.id ? 'active' : ''}
                          type="button"
                          onClick={() => handleMenuTabSelect(item.id)}
                          aria-current={activeTab === item.id ? 'page' : undefined}
                        >
                          <span className="menu-head">
                            <span className="menu-icon-wrap">{item.icon}</span>
                            <span>
                              <span className="menu-kicker">{resolved.kicker}</span>
                              <span className="menu-label">{resolved.label}</span>
                              <span className="menu-sub">{resolved.hint}</span>
                            </span>
                          </span>
                          <span className="menu-arrow" aria-hidden="true">&rsaquo;</span>
                        </button>
                          );
                        })}
                    </section>
                  );
                })}
                {filteredMenuItems.length === 0 && (
                  <p className="notice" style={{ margin: 0 }}>No hay modulos que coincidan con la busqueda.</p>
                )}
              </nav>
            </aside>

            <section ref={contentPanelRef} className="content-panel">
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
                                .filter((row) => (row.branch_id === null || row.branch_id === selectedBranchId) && (row.warehouse_id === null || row.warehouse_id === selectedWarehouseId))
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
              {activeTab === 'restaurant-orders' && (
                <RestaurantOrderView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                />
              )}
              {activeTab === 'comandas' && (
                <ComandasView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                  cashRegisterId={selectedCashRegisterId}
                />
              )}
              {activeTab === 'tables' && (
                <TablesView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                />
              )}
              {activeTab === 'sales' && (
                <SalesView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                  cashRegisterId={selectedCashRegisterId}
                  activeVerticalCode={activeVertical?.code ?? null}
                  currentUserRoleCode={session.user.role_code ?? null}
                  currentUserRoleProfile={session.user.role_profile ?? null}
                />
              )}
              {activeTab === 'daily-summary' && (
                <DailySummaryView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                />
              )}
              {activeTab === 'gre-guides' && (
                <GreGuidesView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                />
              )}
              {activeTab === 'sunat-exceptions' && (
                <SunatExceptionsView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                />
              )}
              {activeTab === 'inventory' && (
                (activeVertical?.code ?? '').toUpperCase() === 'RESTAURANT' ? (
                  <RestaurantInventoryView
                    accessToken={session.accessToken}
                    warehouseId={selectedWarehouseId}
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                ) : (
                  <RetailInventoryView
                    accessToken={session.accessToken}
                    warehouseId={selectedWarehouseId}
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                )
              )}
              {activeTab === 'purchases' && (
                (activeVertical?.code ?? '').toUpperCase() === 'RESTAURANT' ? (
                  <RestaurantPurchasesView
                    accessToken={session.accessToken}
                    warehouseId={selectedWarehouseId}
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                ) : (
                  <RetailPurchasesView
                    accessToken={session.accessToken}
                    warehouseId={selectedWarehouseId}
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                )
              )}
              {activeTab === 'reports' && (
                <ReportsCenterView
                  accessToken={session.accessToken}
                  branchId={selectedBranchId}
                  warehouseId={selectedWarehouseId}
                />
              )}
              {activeTab === 'products' && (
                <RetailProductsView
                  accessToken={session.accessToken}
                  activeVerticalCode={activeVertical?.code ?? null}
                />
              )}
              {activeTab === 'restaurant-menu' && (
                <RestaurantMenuProductsView
                  accessToken={session.accessToken}
                  activeVerticalCode={activeVertical?.code ?? null}
                />
              )}
              {activeTab === 'restaurant-supplies' && (
                <RestaurantSuppliesProductsView
                  accessToken={session.accessToken}
                  activeVerticalCode={activeVertical?.code ?? null}
                />
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
