import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../shared/api/client';
import { login, logout } from '../modules/auth/api';
import { LoginForm } from '../modules/auth/components/LoginForm';
import { fetchHomeMetricsSummary, fetchOperationalContext } from '../modules/appcfg/api';
import type { OperationalContextResponse } from '../modules/appcfg/types';
import quickAppcfgImg from '../assets/quickhome/icons/appcfg.png';
import quickCashImg from '../assets/quickhome/icons/cash.png';
import quickComandasImg from '../assets/quickhome/icons/comandas.png';
import quickCompanyImg from '../assets/quickhome/icons/company.png';
import quickCustomersImg from '../assets/quickhome/icons/customers.png';
import quickDailySummaryImg from '../assets/quickhome/icons/daily-summary.png';
import quickGenericImg from '../assets/quickhome/icons/generic.png';
import quickGreGuidesImg from '../assets/quickhome/icons/gre-guides.png';
import quickInventoryImg from '../assets/quickhome/icons/inventory.png';
import quickMastersImg from '../assets/quickhome/icons/masters.png';
import quickProductsImg from '../assets/quickhome/icons/products.png';
import quickPurchasesImg from '../assets/quickhome/icons/purchases.png';
import quickReportsImg from '../assets/quickhome/icons/reports.png';
import quickRestaurantMenuImg from '../assets/quickhome/icons/restaurant-menu.png';
import quickRestaurantOrdersImg from '../assets/quickhome/icons/restaurant-orders.png';
import quickRestaurantSuppliesImg from '../assets/quickhome/icons/restaurant-supplies.png';
import quickSalesImg from '../assets/quickhome/icons/sales.png';
import quickSunatExceptionsImg from '../assets/quickhome/icons/sunat-exceptions.png';
import quickTablesImg from '../assets/quickhome/icons/tables.png';
import {
  clearAuthSession,
  loadAuthSession,
  onAuthSessionChanged,
  saveAuthSession,
} from '../modules/auth/storage';
import type { AuthSession, LoginPayload } from '../modules/auth/types';

type UiDensity = 'normal' | 'compact';
type SalesFlowMode = 'DIRECT_CASHIER' | 'SELLER_TO_CASHIER';
type BusinessPulseRange = 'DAY' | 'MONTH' | 'YEAR';

type BusinessPulsePoint = {
  label: string;
  sales: number;
  purchases: number;
};

type BusinessPulseDataset = Record<BusinessPulseRange, BusinessPulsePoint[]>;

const UI_DENSITY_STORAGE_KEY = 'facturacion.uiDensity';

type ModuleTab =
  | 'home'
  | 'cash'
  | 'restaurant-orders'
  | 'comandas'
  | 'tables'
  | 'restaurant-recipes'
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

const QUICK_ACCESS_PRIORITY: ModuleTab[] = [
  'home',
  'sales',
  'cash',
  'purchases',
  'inventory',
  'products',
  'customers',
  'daily-summary',
  'reports',
  'masters',
  'appcfg',
  'restaurant-orders',
  'comandas',
  'tables',
  'restaurant-menu',
  'restaurant-supplies',
  'company',
  'gre-guides',
  'sunat-exceptions',
];

const QUICK_ACCESS_FEATURED: ModuleTab[] = ['sales', 'cash', 'purchases', 'inventory'];
const RESTAURANT_TABS = new Set<ModuleTab>(['restaurant-orders', 'comandas', 'tables', 'restaurant-recipes']);

const QUICK_ACCESS_META: Partial<Record<ModuleTab, { badge: string; flow: string; emoji: string }>> = {
  sales: { badge: 'Venta rapida', flow: 'Emitir comprobante en segundos', emoji: 'POS' },
  cash: { badge: 'Control de caja', flow: 'Apertura, cobro y cierre del turno', emoji: 'S/' },
  purchases: { badge: 'Compra agil', flow: 'Registrar ingreso y costo de mercaderia', emoji: 'OC' },
  inventory: { badge: 'Stock al dia', flow: 'Existencias, lotes y alertas de quiebre', emoji: 'INV' },
};

const BUSINESS_PULSE_RANGES: BusinessPulseRange[] = ['DAY', 'MONTH', 'YEAR'];
const BUSINESS_PULSE_EMPTY: BusinessPulseDataset = {
  DAY: [],
  MONTH: [],
  YEAR: [],
};
const BUSINESS_PULSE_CACHE_KEY = 'facturacion.businessPulseCache.v1';
const BUSINESS_PULSE_CACHE_TTL_MS = 2 * 60 * 1000;
const SALES_FLAGS_CACHE_KEY = 'facturacion.salesFlagsCache.v1';
const SALES_FLAGS_CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_ACTIVE_TAB_STORAGE_KEY = 'facturacion.lastActiveTab.v1';
const OPERATIONAL_CONTEXT_CACHE_KEY = 'facturacion.operationalContextCache.v1';
const OPERATIONAL_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;

const QUICK_ACCESS_IMAGES: Partial<Record<ModuleTab, string>> = {
  'restaurant-orders': quickRestaurantOrdersImg,
  comandas: quickComandasImg,
  tables: quickTablesImg,
  sales: quickSalesImg,
  'daily-summary': quickDailySummaryImg,
  'gre-guides': quickGreGuidesImg,
  'sunat-exceptions': quickSunatExceptionsImg,
  cash: quickCashImg,
  purchases: quickPurchasesImg,
  reports: quickReportsImg,
  'restaurant-menu': quickRestaurantMenuImg,
  'restaurant-supplies': quickRestaurantSuppliesImg,
  inventory: quickInventoryImg,
  products: quickProductsImg,
  customers: quickCustomersImg,
  masters: quickMastersImg,
  appcfg: quickAppcfgImg,
  company: quickCompanyImg,
};

const QUICK_ACCESS_GENERIC_IMAGE = quickGenericImg;

const loadCashView = () => import('../modules/cash/components/CashView');
const RestaurantOrderView = lazy(() => import('../modules/restaurant/components/RestaurantOrderView').then((m) => ({ default: m.RestaurantOrderView })));
const ComandasView = lazy(() => import('../modules/restaurant/components/ComandasView').then((m) => ({ default: m.ComandasView })));
const TablesView = lazy(() => import('../modules/restaurant/components/TablesView').then((m) => ({ default: m.TablesView })));
const RecipeEditorView = lazy(() => import('../modules/restaurant/components/RecipeEditorView').then((m) => ({ default: m.RecipeEditorView })));
const loadSalesView = () => import('../modules/sales/components/SalesView');
const CashView = lazy(() => loadCashView().then((m) => ({ default: m.CashView })));
const SalesView = lazy(() => loadSalesView().then((m) => ({ default: m.SalesView })));
const DailySummaryView = lazy(() => import('../modules/sales/components/DailySummaryView').then((m) => ({ default: m.DailySummaryView })));
const GreGuidesView = lazy(() => import('../modules/sales/components/GreGuidesView').then((m) => ({ default: m.GreGuidesView })));
const SunatExceptionsView = lazy(() => import('../modules/sales/components/SunatExceptionsView').then((m) => ({ default: m.SunatExceptionsView })));
const RestaurantInventoryView = lazy(() => import('../modules/inventory/components/RestaurantInventoryView').then((m) => ({ default: m.RestaurantInventoryView })));
const RetailInventoryView = lazy(() => import('../modules/inventory/components/RetailInventoryView').then((m) => ({ default: m.RetailInventoryView })));
const RestaurantPurchasesView = lazy(() => import('../modules/purchases/components/RestaurantPurchasesView').then((m) => ({ default: m.RestaurantPurchasesView })));
const RetailPurchasesView = lazy(() => import('../modules/purchases/components/RetailPurchasesView').then((m) => ({ default: m.RetailPurchasesView })));
const ReportsCenterView = lazy(() => import('../modules/reports/components/ReportsCenterView').then((m) => ({ default: m.ReportsCenterView })));
const RetailProductsView = lazy(() => import('../modules/products/components/RetailProductsView').then((m) => ({ default: m.RetailProductsView })));
const RestaurantMenuProductsView = lazy(() => import('../modules/products/components/RestaurantMenuProductsView').then((m) => ({ default: m.RestaurantMenuProductsView })));
const RestaurantSuppliesProductsView = lazy(() => import('../modules/products/components/RestaurantSuppliesProductsView').then((m) => ({ default: m.RestaurantSuppliesProductsView })));
const CustomersView = lazy(() => import('../modules/customers/components/CustomersView').then((m) => ({ default: m.CustomersView })));
const MastersView = lazy(() => import('../modules/masters/components/MastersView').then((m) => ({ default: m.MastersView })));
const AppConfigView = lazy(() => import('../modules/appcfg/components/AppConfigView').then((m) => ({ default: m.AppConfigView })));
const CompanyConfigView = lazy(() => import('../modules/company/components/CompanyConfigView').then((m) => ({ default: m.CompanyConfigView })));

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
    id: 'home',
    group: 'operacion',
    kicker: 'Inicio',
    label: 'Acceso rapido',
    hint: 'Pantalla inicial con procesos frecuentes',
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
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
    id: 'restaurant-recipes',
    group: 'catalogo',
    kicker: 'Restaurante',
    label: 'Recetas',
    hint: 'Ingredientes y cantidades por plato',
    onlyVerticals: ['RESTAURANT'],
    icon: (
      <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M12 12h4M12 16h4M8 12h.01M8 16h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  RETAIL: ['comandas', 'tables', 'restaurant-recipes'],
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

function resolveQuickAccessImage(tabId: ModuleTab): string {
  return QUICK_ACCESS_IMAGES[tabId] ?? QUICK_ACCESS_GENERIC_IMAGE;
}

function resolveInitialActiveTab(): ModuleTab {
  if (typeof window === 'undefined') {
    return 'sales';
  }

  const saved = (window.localStorage.getItem(LAST_ACTIVE_TAB_STORAGE_KEY) ?? '').trim() as ModuleTab;
  const allowed: ModuleTab[] = [
    'home',
    'cash',
    'restaurant-orders',
    'comandas',
    'tables',
    'restaurant-recipes',
    'sales',
    'daily-summary',
    'gre-guides',
    'sunat-exceptions',
    'inventory',
    'purchases',
    'reports',
    'restaurant-menu',
    'restaurant-supplies',
    'restaurant-recipes',
    'products',
    'customers',
    'masters',
    'appcfg',
    'company',
  ];

  return allowed.includes(saved) ? saved : 'sales';
}

export function App() {
  const tenantAccessSlug = resolveTenantAccessSlugFromPath();
  const authScope = tenantAccessSlug ? `tenant:${tenantAccessSlug}` : 'default';
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession(authScope));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModuleTab>(() => resolveInitialActiveTab());
  const [menuSearch, setMenuSearch] = useState('');
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<number | null>(null);
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [isSessionDetailsOpen, setIsSessionDetailsOpen] = useState(false);
  const [salesFlowMode, setSalesFlowMode] = useState<SalesFlowMode>('DIRECT_CASHIER');
  const [taxTraceabilityEnabled, setTaxTraceabilityEnabled] = useState(false);
  const [activeVertical, setActiveVertical] = useState<OperationalContextResponse['active_vertical'] | null>(null);
  const [businessPulseRange, setBusinessPulseRange] = useState<BusinessPulseRange>('DAY');
  const [businessPulseData, setBusinessPulseData] = useState<BusinessPulseDataset>(BUSINESS_PULSE_EMPTY);
  const [businessPulseLoading, setBusinessPulseLoading] = useState(false);
  const [businessPulseError, setBusinessPulseError] = useState<string | null>(null);
  const [uiDensity, setUiDensity] = useState<UiDensity>(() => {
    if (typeof window === 'undefined') {
      return 'compact';
    }

    const saved = window.localStorage.getItem(UI_DENSITY_STORAGE_KEY);
    return saved === 'normal' ? 'normal' : 'compact';
  });
  const contentPanelRef = useRef<HTMLElement | null>(null);
  const moduleExecutionRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToModuleRef = useRef(false);
  const hasHydratedOperationalContextRef = useRef(false);

  const operationalContextScope = session
    ? `${authScope}:${session.user.company_id}`
    : null;

  useEffect(() => {
    if (!operationalContextScope || typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(OPERATIONAL_CONTEXT_CACHE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        scope?: string;
        generatedAt?: number;
        active_vertical?: OperationalContextResponse['active_vertical'];
        selected_branch_id?: number | null;
        selected_warehouse_id?: number | null;
        selected_cash_register_id?: number | null;
      };

      const generatedAt = Number(parsed.generatedAt ?? 0);
      const isFresh = Number.isFinite(generatedAt)
        && (Date.now() - generatedAt) <= OPERATIONAL_CONTEXT_CACHE_TTL_MS;

      if (parsed.scope !== operationalContextScope || !isFresh) {
        return;
      }

      if (parsed.active_vertical) {
        setActiveVertical(parsed.active_vertical);
      }

      if (selectedBranchId === null && typeof parsed.selected_branch_id === 'number') {
        setSelectedBranchId(parsed.selected_branch_id);
      }

      if (selectedWarehouseId === null && typeof parsed.selected_warehouse_id === 'number') {
        setSelectedWarehouseId(parsed.selected_warehouse_id);
      }

      if (selectedCashRegisterId === null && typeof parsed.selected_cash_register_id === 'number') {
        setSelectedCashRegisterId(parsed.selected_cash_register_id);
      }
    } catch {
      // Ignore cache parsing issues.
    }
  }, [operationalContextScope, selectedBranchId, selectedCashRegisterId, selectedWarehouseId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, uiDensity);
  }, [uiDensity]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LAST_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!shouldScrollToModuleRef.current) {
      return;
    }

    if (!window.matchMedia('(max-width: 980px)').matches) {
      shouldScrollToModuleRef.current = false;
      return;
    }

    shouldScrollToModuleRef.current = false;

    window.requestAnimationFrame(() => {
      moduleExecutionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [activeTab]);

  useEffect(() => {
    return onAuthSessionChanged((nextSession) => {
      setSession(nextSession);
    }, authScope);
  }, [authScope]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const normalizedRoleCode = (session.user.role_code ?? '').toUpperCase();
    const normalizedRoleProfile = (session.user.role_profile ?? '').toUpperCase();
    const isAdmin = normalizedRoleCode.includes('ADMIN');
    const isCashier = normalizedRoleProfile === 'CASHIER'
      || normalizedRoleCode.includes('CAJA')
      || normalizedRoleCode.includes('CAJER')
      || normalizedRoleCode.includes('CASHIER');
    const isSeller = normalizedRoleProfile === 'SELLER'
      || normalizedRoleCode.includes('VENDED')
      || normalizedRoleCode.includes('SELLER');

    // Keep initial startup lean: avoid preloading heavy cross-module chunks.
    void isAdmin;
    void isCashier;
    void isSeller;
    return undefined;
  }, [session?.accessToken, session?.user?.role_code, session?.user?.role_profile]);

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
  const inventoryPermissions = session?.user?.permissions?.INVENTORY;
  const canEditPurchaseEntries = Boolean(inventoryPermissions?.can_update) && Boolean(inventoryPermissions?.can_approve);

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

  const quickAccessItems = useMemo(() => {
    const priorityRank = new Map<ModuleTab, number>(
      QUICK_ACCESS_PRIORITY.map((id, index) => [id, index]),
    );

    return [...permittedMenuItems]
      .filter((item) => item.id !== 'home')
      .sort((a, b) => {
        const rankA = priorityRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rankB = priorityRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      })
      .slice(0, 8)
      .map((item) => {
        const resolved = resolveVerticalLabel(item, activeVertical?.code ?? null);
        return { ...item, ...resolved };
      });
  }, [activeVertical?.code, permittedMenuItems]);

  const featuredQuickAccessItems = useMemo(() => {
    const featuredSet = new Set(QUICK_ACCESS_FEATURED);
    return quickAccessItems
      .filter((item) => featuredSet.has(item.id))
      .sort((a, b) => QUICK_ACCESS_FEATURED.indexOf(a.id) - QUICK_ACCESS_FEATURED.indexOf(b.id));
  }, [quickAccessItems]);

  const secondaryQuickAccessItems = useMemo(() => {
    const featuredSet = new Set(QUICK_ACCESS_FEATURED);
    return quickAccessItems.filter((item) => !featuredSet.has(item.id));
  }, [quickAccessItems]);

  const activeBusinessPulsePoints = businessPulseData[businessPulseRange] ?? [];

  const businessPulseMaxValue = useMemo(() => {
    return activeBusinessPulsePoints.reduce((acc, row) => {
      return Math.max(acc, row.sales, row.purchases);
    }, 0);
  }, [activeBusinessPulsePoints]);

  const businessPulseTotals = useMemo(() => {
    return activeBusinessPulsePoints.reduce(
      (acc, row) => {
        acc.sales += row.sales;
        acc.purchases += row.purchases;
        return acc;
      },
      { sales: 0, purchases: 0 },
    );
  }, [activeBusinessPulsePoints]);

  const businessPulseChart = useMemo(() => {
    const rows = activeBusinessPulsePoints;
    if (!rows.length || businessPulseMaxValue <= 0) {
      return {
        salesPath: '',
        purchasesPath: '',
        salesArea: '',
        purchasesArea: '',
        salesDots: [] as Array<{ x: number; y: number; key: string }>,
        purchasesDots: [] as Array<{ x: number; y: number; key: string }>,
        grid: [25, 50, 75],
      };
    }

    const width = 640;
    const height = 220;
    const left = 16;
    const right = 16;
    const top = 14;
    const bottom = 18;
    const innerW = width - left - right;
    const innerH = height - top - bottom;

    const stepX = rows.length <= 1 ? 0 : innerW / (rows.length - 1);

    const salesPoints = rows.map((row, idx) => {
      const x = left + stepX * idx;
      const y = top + innerH - ((row.sales / businessPulseMaxValue) * innerH);
      return {
        x,
        y,
        point: `${x.toFixed(2)},${y.toFixed(2)}`,
        key: `${row.label}-s-${idx}`,
      };
    });

    const purchasesPoints = rows.map((row, idx) => {
      const x = left + stepX * idx;
      const y = top + innerH - ((row.purchases / businessPulseMaxValue) * innerH);
      return {
        x,
        y,
        point: `${x.toFixed(2)},${y.toFixed(2)}`,
        key: `${row.label}-p-${idx}`,
      };
    });

    const salesPath = salesPoints.map((entry) => entry.point).join(' ');
    const purchasesPath = purchasesPoints.map((entry) => entry.point).join(' ');

    const baseline = (top + innerH).toFixed(2);
    const firstX = left.toFixed(2);
    const lastX = (left + stepX * (rows.length - 1)).toFixed(2);
    const salesArea = `${firstX},${baseline} ${salesPath} ${lastX},${baseline}`;
    const purchasesArea = `${firstX},${baseline} ${purchasesPath} ${lastX},${baseline}`;

    return {
      salesPath,
      purchasesPath,
      salesArea,
      purchasesArea,
      salesDots: salesPoints.map((entry) => ({ x: entry.x, y: entry.y, key: entry.key })),
      purchasesDots: purchasesPoints.map((entry) => ({ x: entry.x, y: entry.y, key: entry.key })),
      grid: [25, 50, 75],
    };
  }, [activeBusinessPulsePoints, businessPulseMaxValue]);

  useEffect(() => {
    if (!session?.accessToken) {
      setBusinessPulseData(BUSINESS_PULSE_EMPTY);
      setBusinessPulseError(null);
      setBusinessPulseLoading(false);
      return;
    }

    // Avoid heavy startup calls when the user is not on dashboard home.
    if (activeTab !== 'home') {
      setBusinessPulseLoading(false);
      return;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cacheScope = `${session.user.company_id}:${selectedBranchId ?? 'ALL'}:${selectedWarehouseId ?? 'ALL'}`;
    let cachedData: BusinessPulseDataset | null = null;

    try {
      if (typeof window !== 'undefined') {
        const rawCache = window.localStorage.getItem(BUSINESS_PULSE_CACHE_KEY);
        if (rawCache) {
          const parsed = JSON.parse(rawCache) as {
            scope?: string;
            generatedAt?: number;
            data?: BusinessPulseDataset;
          };

          const generatedAt = Number(parsed.generatedAt ?? 0);
          const isFresh = Number.isFinite(generatedAt) && (Date.now() - generatedAt) <= BUSINESS_PULSE_CACHE_TTL_MS;
          if (parsed.scope === cacheScope && parsed.data && isFresh) {
            cachedData = {
              DAY: parsed.data.DAY ?? [],
              MONTH: parsed.data.MONTH ?? [],
              YEAR: parsed.data.YEAR ?? [],
            };
            setBusinessPulseData(cachedData);

            if ((cachedData[businessPulseRange] ?? []).length > 0) {
              setBusinessPulseError(null);
              setBusinessPulseLoading(false);
              return;
            }
          }
        }
      }
    } catch {
      // Ignore cache parse issues and continue with network fetch.
    }

    const loadBusinessPulse = async () => {
      setBusinessPulseLoading(true);
      setBusinessPulseError(null);

      const rangeToLoad = businessPulseRange;

      try {
        const response = await fetchHomeMetricsSummary(session.accessToken, {
          range: rangeToLoad,
          branchId: selectedBranchId,
          warehouseId: selectedWarehouseId,
        });

        if (cancelled) {
          return;
        }

        const aggregatedRange = (response.points ?? []).map((row) => ({
          label: String(row.label ?? ''),
          sales: Number(row.sales ?? 0),
          purchases: Number(row.purchases ?? 0),
        }));

        const nextData: BusinessPulseDataset = {
          DAY: rangeToLoad === 'DAY' ? aggregatedRange : (cachedData?.DAY ?? []),
          MONTH: rangeToLoad === 'MONTH' ? aggregatedRange : (cachedData?.MONTH ?? []),
          YEAR: rangeToLoad === 'YEAR' ? aggregatedRange : (cachedData?.YEAR ?? []),
        };

        setBusinessPulseData(nextData);

        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              BUSINESS_PULSE_CACHE_KEY,
              JSON.stringify({
                scope: cacheScope,
                generatedAt: Date.now(),
                data: nextData,
              }),
            );
          }
        } catch {
          // Ignore localStorage write issues.
        }
      } catch (error) {
        if (!cancelled) {
          setBusinessPulseError(error instanceof Error ? error.message : 'No se pudo cargar el pulso del negocio.');
        }
      } finally {
        if (!cancelled) {
          setBusinessPulseLoading(false);
        }
      }
    };

    // Small delay to keep the UI responsive right after hard refresh.
    timerId = setTimeout(() => {
      if (!cancelled) {
        void loadBusinessPulse();
      }
    }, 350);

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [session?.accessToken, session?.user?.company_id, selectedBranchId, selectedWarehouseId, activeTab, businessPulseRange]);

  function handleMenuTabSelect(nextTab: ModuleTab): void {
    shouldScrollToModuleRef.current = true;
    setActiveTab(nextTab);
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
      setIsContextLoading(true);
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
      setActiveVertical(nextContext.active_vertical ?? null);

      try {
        if (typeof window !== 'undefined' && operationalContextScope) {
          window.localStorage.setItem(
            OPERATIONAL_CONTEXT_CACHE_KEY,
            JSON.stringify({
              scope: operationalContextScope,
              generatedAt: Date.now(),
              active_vertical: nextContext.active_vertical ?? null,
              selected_branch_id: nextBranchId,
              selected_warehouse_id: nextWarehouseId,
              selected_cash_register_id: nextCashRegisterId,
            }),
          );
        }
      } catch {
        // Ignore localStorage write issues.
      }

      hasHydratedOperationalContextRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar contexto operativo';
      setErrorMessage(message);
    } finally {
      setIsContextLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    // Ensure vertical-aware menu is hydrated on startup after hard refresh.
    if (!hasHydratedOperationalContextRef.current && !isContextLoading && !activeVertical?.code) {
      void loadOperationalContext(
        session.accessToken,
        selectedBranchId,
        selectedWarehouseId,
        selectedCashRegisterId,
      );
      return;
    }

    // Avoid null-branch startup stalls: use auth payload immediately.
    const initialBranch = session.user.branch_id ? Number(session.user.branch_id) : null;
    if (selectedBranchId === null && initialBranch !== null) {
      setSelectedBranchId(initialBranch);
    }

    // Defer full context bootstrap to when a module actually needs it.
    if (hasHydratedOperationalContextRef.current || activeTab === 'home' || RESTAURANT_TABS.has(activeTab)) {
      return;
    }

    void loadOperationalContext(
      session.accessToken,
      selectedBranchId,
      selectedWarehouseId,
      selectedCashRegisterId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, activeTab, activeVertical?.code, isContextLoading, selectedBranchId, selectedCashRegisterId, selectedWarehouseId]);

  useEffect(() => {
    if (!session || !context || !hasHydratedOperationalContextRef.current) {
      return;
    }

    const currentContextBranchId =
      context.selected.branch_id
      ?? context.branches[0]?.id
      ?? null;

    // Skip redundant first reload after initial hydration.
    if (selectedBranchId === currentContextBranchId) {
      return;
    }

    // For restaurant tabs, keep context local and avoid reloading unrelated modules/cash context.
    if (RESTAURANT_TABS.has(activeTab)) {
      const nextWarehouseId = context.warehouses
        .find((row) => row.branch_id === selectedBranchId || row.branch_id === null)?.id
        ?? null;

      if (selectedWarehouseId !== nextWarehouseId) {
        setSelectedWarehouseId(nextWarehouseId);
      }

      if (selectedCashRegisterId !== null) {
        setSelectedCashRegisterId(null);
      }

      return;
    }

    void loadOperationalContext(
      session.accessToken,
      selectedBranchId,
      selectedWarehouseId,
      selectedCashRegisterId
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, activeTab]);

  useEffect(() => {
    if (!session) {
      setSalesFlowMode('DIRECT_CASHIER');
      setTaxTraceabilityEnabled(false);
      return;
    }

    const cacheScope = `${session.user.company_id}:${selectedBranchId ?? 'ALL'}`;

    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(SALES_FLAGS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            scope?: string;
            generatedAt?: number;
            salesFlowMode?: SalesFlowMode;
            taxTraceabilityEnabled?: boolean;
          };

          const generatedAt = Number(parsed.generatedAt ?? 0);
          const isFresh = Number.isFinite(generatedAt) && (Date.now() - generatedAt) <= SALES_FLAGS_CACHE_TTL_MS;
          if (parsed.scope === cacheScope && isFresh) {
            setSalesFlowMode(parsed.salesFlowMode === 'SELLER_TO_CASHIER' ? 'SELLER_TO_CASHIER' : 'DIRECT_CASHIER');
            setTaxTraceabilityEnabled(Boolean(parsed.taxTraceabilityEnabled));
            return undefined;
          }
        }
      }
    } catch {
      // Ignore cache parsing issues.
    }

    // Cache miss: keep fast defaults and let module-level views resolve flags when needed.
    setSalesFlowMode('DIRECT_CASHIER');
    setTaxTraceabilityEnabled(false);
    return undefined;
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
      {!tenantAccessSlug && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sistema de Facturación</h1>
          <p style={{ color: '#555', maxWidth: '400px' }}>
            Esta URL no corresponde a ninguna empresa.<br />
            Accede con la URL de tu empresa, por ejemplo:<br />
            <code style={{ background: '#f1f1f1', padding: '2px 6px', borderRadius: '4px' }}>
              /t/emp-xxxxxxxxxxxxxxxx
            </code>
          </p>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>
            Contacta al administrador del sistema para obtener tu URL de acceso.
          </p>
        </div>
      )}
      {tenantAccessSlug && (
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
              {activeTab === 'home' && (
                <section className="quick-home-panel" aria-label="Inicio y accesos rapidos">
                  <header className="quick-home-head">
                    <div>
                      <p className="eyebrow">Inicio</p>
                      <h2>Acceso rapido</h2>
                      <p>Atajos de alta rotacion para operar mas rapido, con foco en venta, caja y abastecimiento.</p>
                    </div>
                  </header>

                  {featuredQuickAccessItems.length > 0 && (
                    <section className="quick-home-featured" aria-label="Procesos clave">
                      <p className="quick-home-section-title">Procesos clave</p>
                      <div className="quick-home-featured-grid">
                        {featuredQuickAccessItems.map((item) => {
                          const meta = QUICK_ACCESS_META[item.id];
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`quick-home-card quick-home-card-featured module-${item.id}`}
                              onClick={() => handleMenuTabSelect(item.id)}
                            >
                              <span className={`quick-home-visual theme-${item.group}`} aria-hidden="true">
                                <img className="quick-home-visual-img" src={resolveQuickAccessImage(item.id)} alt="" />
                              </span>
                              <span className="quick-home-card-body">
                                <span className="quick-home-icon">{item.icon}</span>
                                <span className="quick-home-copy">
                                  <span className="quick-home-badge">{meta?.badge ?? 'Acceso rapido'}</span>
                                  <strong>{item.label}</strong>
                                  <small>{item.hint}</small>
                                  <small className="quick-home-flow">{meta?.flow ?? 'Abrir modulo para continuar'}</small>
                                </span>
                              </span>
                              <span className="quick-home-go" aria-hidden="true">Entrar ahora</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {secondaryQuickAccessItems.length > 0 && (
                    <section className="quick-home-secondary" aria-label="Accesos adicionales">
                      <p className="quick-home-section-title">Accesos adicionales</p>
                      <div className="quick-home-grid">
                        {secondaryQuickAccessItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`quick-home-card module-${item.id}`}
                        onClick={() => handleMenuTabSelect(item.id)}
                      >
                        <span className={`quick-home-visual theme-${item.group}`} aria-hidden="true">
                          <img className="quick-home-visual-img" src={resolveQuickAccessImage(item.id)} alt="" />
                        </span>
                        <span className="quick-home-card-body">
                          <span className="quick-home-icon">{item.icon}</span>
                          <span className="quick-home-copy">
                            <strong>{item.label}</strong>
                            <small>{item.hint}</small>
                          </span>
                        </span>
                        <span className="quick-home-go" aria-hidden="true">Abrir modulo</span>
                      </button>
                    ))}
                      </div>
                    </section>
                  )}

                  <section className="quick-home-pulse" aria-label="Pulso del negocio">
                    <div className="quick-home-pulse-head">
                      <div>
                        <p className="quick-home-section-title">Pulso del negocio</p>
                        <h3>Ventas vs Compras</h3>
                        <p>Vista rapida con grafica para entender como se mueve el negocio.</p>
                      </div>
                      <div className="quick-home-pulse-tabs" role="tablist" aria-label="Rango del pulso de negocio">
                        {BUSINESS_PULSE_RANGES.map((range) => (
                          <button
                            key={range}
                            type="button"
                            role="tab"
                            className={businessPulseRange === range ? 'is-active' : ''}
                            aria-selected={businessPulseRange === range}
                            onClick={() => setBusinessPulseRange(range)}
                          >
                            {range === 'DAY' ? 'Dias' : range === 'MONTH' ? 'Meses' : 'Anios'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="quick-home-pulse-kpis">
                      <article>
                        <span>Ventas ({businessPulseRange === 'DAY' ? '7d' : businessPulseRange === 'MONTH' ? '6m' : '3a'})</span>
                        <strong>S/ {businessPulseTotals.sales.toFixed(2)}</strong>
                      </article>
                      <article>
                        <span>Compras ({businessPulseRange === 'DAY' ? '7d' : businessPulseRange === 'MONTH' ? '6m' : '3a'})</span>
                        <strong>S/ {businessPulseTotals.purchases.toFixed(2)}</strong>
                      </article>
                      <article>
                        <span>Balance</span>
                        <strong>S/ {(businessPulseTotals.sales - businessPulseTotals.purchases).toFixed(2)}</strong>
                      </article>
                    </div>

                    {businessPulseError && <p className="notice" style={{ margin: 0 }}>{businessPulseError}</p>}

                    {businessPulseLoading ? (
                      <p className="notice" style={{ margin: 0 }}>Cargando grafica de movimiento...</p>
                    ) : (
                      <div className="quick-home-pulse-chart" role="img" aria-label="Grafica comparativa de ventas y compras">
                        {activeBusinessPulsePoints.length === 0 && (
                          <p className="notice" style={{ margin: 0 }}>Sin datos suficientes para este periodo.</p>
                        )}

                        {activeBusinessPulsePoints.length > 0 && (
                          <>
                            <div className="quick-home-pulse-legend">
                              <span className="dot-sales">Ventas</span>
                              <span className="dot-purchases">Compras</span>
                            </div>
                            <svg viewBox="0 0 640 220" className="quick-home-pulse-svg" aria-hidden="true">
                              <defs>
                                <linearGradient id="pulseSalesFill" x1="0" y1="20" x2="0" y2="220" gradientUnits="userSpaceOnUse">
                                  <stop offset="0" stopColor="#16A34A" stopOpacity="0.34" />
                                  <stop offset="1" stopColor="#16A34A" stopOpacity="0.04" />
                                </linearGradient>
                                <linearGradient id="pulsePurchasesFill" x1="0" y1="20" x2="0" y2="220" gradientUnits="userSpaceOnUse">
                                  <stop offset="0" stopColor="#EA580C" stopOpacity="0.32" />
                                  <stop offset="1" stopColor="#EA580C" stopOpacity="0.04" />
                                </linearGradient>
                              </defs>
                              {businessPulseChart.grid.map((pct) => (
                                <line
                                  key={pct}
                                  x1="16"
                                  y1={14 + ((100 - pct) / 100) * (220 - 14 - 18)}
                                  x2="624"
                                  y2={14 + ((100 - pct) / 100) * (220 - 14 - 18)}
                                  className="pulse-grid-line"
                                />
                              ))}
                              <polygon className="pulse-area-purchases" points={businessPulseChart.purchasesArea} />
                              <polygon className="pulse-area-sales" points={businessPulseChart.salesArea} />
                              <polyline className="pulse-line-sales" points={businessPulseChart.salesPath} />
                              <polyline className="pulse-line-purchases" points={businessPulseChart.purchasesPath} />
                              {businessPulseChart.salesDots.map((dot) => (
                                <circle key={dot.key} className="pulse-dot-sales" cx={dot.x} cy={dot.y} r="4.6" />
                              ))}
                              {businessPulseChart.purchasesDots.map((dot) => (
                                <circle key={dot.key} className="pulse-dot-purchases" cx={dot.x} cy={dot.y} r="4.4" />
                              ))}
                            </svg>
                            <div className="quick-home-pulse-axis">
                              {activeBusinessPulsePoints.map((row) => (
                                <span key={row.label}>{row.label}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                </section>
              )}

              {activeTab !== 'home' && (
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

                  <div className="active-context-actions" role="group" aria-label="Contexto operativo">
                    <button
                      type="button"
                      className="context-toggle-btn"
                      onClick={() => {
                        const nextOpen = !isContextPickerOpen;
                        setIsContextPickerOpen(nextOpen);

                        if (
                          nextOpen
                          && session?.accessToken
                          && !context
                          && !isContextLoading
                        ) {
                          void loadOperationalContext(
                            session.accessToken,
                            selectedBranchId,
                            selectedWarehouseId,
                            selectedCashRegisterId,
                          );
                        }
                      }}
                    >
                      {isContextPickerOpen ? 'Ocultar contexto' : 'Cambiar contexto'}
                    </button>

                    {isContextPickerOpen && (
                      <div className="active-context-popover">
                        {!context && (
                          <p className="notice" style={{ margin: 0 }}>
                            {isContextLoading ? 'Cargando contexto operativo...' : 'Contexto no disponible por el momento.'}
                          </p>
                        )}

                        {context && (
                          <>
                          <label>
                            <span>Sucursal</span>
                            <select
                              value={selectedBranchId ?? ''}
                              onChange={(e) => {
                                const value = e.target.value ? Number(e.target.value) : null;
                                setSelectedBranchId(value);

                                const nextWarehouse = context?.warehouses.find((row) => row.branch_id === value || row.branch_id === null)?.id ?? null;
                                const nextCash = context?.cash_registers.find((row) => (
                                  (row.branch_id === value || row.branch_id === null)
                                  && (nextWarehouse === null || row.warehouse_id === null || row.warehouse_id === nextWarehouse)
                                ))?.id ?? null;

                                // Keep branch switch lightweight and avoid transient null-context requests.
                                setSelectedWarehouseId(nextWarehouse);
                                setSelectedCashRegisterId(RESTAURANT_TABS.has(activeTab) ? null : nextCash);
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

                            </>
                          )}
                        </div>
                      )}
                    </div>
                </div>
              </header>
              )}

              <div ref={moduleExecutionRef} aria-hidden="true" />

              <Suspense fallback={<p className="notice" style={{ margin: 0 }}>Cargando modulo...</p>}>
                {activeTab === 'home' && null}
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
                {activeTab === 'restaurant-recipes' && (
                  <RecipeEditorView
                    accessToken={session.accessToken}
                    warehouseId={selectedWarehouseId}
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
                    traceabilityEnabled={taxTraceabilityEnabled}
                  />
                )}
                {activeTab === 'gre-guides' && (
                  <GreGuidesView
                    accessToken={session.accessToken}
                    branchId={selectedBranchId}
                    traceabilityEnabled={taxTraceabilityEnabled}
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
                      canEditPurchaseEntries={canEditPurchaseEntries}
                    />
                  ) : (
                    <RetailPurchasesView
                      accessToken={session.accessToken}
                      warehouseId={selectedWarehouseId}
                      activeVerticalCode={activeVertical?.code ?? null}
                      canEditPurchaseEntries={canEditPurchaseEntries}
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
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                )}
                {activeTab === 'appcfg' && (
                  <AppConfigView
                    accessToken={session.accessToken}
                    branchId={selectedBranchId}
                    warehouseId={selectedWarehouseId}
                    cashRegisterId={selectedCashRegisterId}
                    currentUserRoleCode={session.user.role_code ?? null}
                    activeVerticalCode={activeVertical?.code ?? null}
                  />
                )}
                {activeTab === 'company' && (
                  <CompanyConfigView accessToken={session.accessToken} />
                )}
              </Suspense>
            </section>
          </section>
        )}
      </section>
      )}
    </main>
  );
}
