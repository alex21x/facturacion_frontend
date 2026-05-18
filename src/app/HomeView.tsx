/**
 * HomeView — dashboard home tab.
 *
 * Owns everything that only the home screen needs:
 *  - Quick-access PNG images
 *  - Business Pulse state / fetch / chart calculation
 *  - The full home-screen JSX
 *
 * Receives the already-computed quickAccessItems from App so the nav and the
 * home grid share the same source of truth without duplicating work.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchHomeMetricsSummary } from '../modules/appcfg/api';

// ── images ────────────────────────────────────────────────────────────────────
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

// ── types (local, not exported — only used in this component) ─────────────────
type ModuleTab =
  | 'home' | 'cash' | 'racing-ops' | 'restaurant-orders' | 'comandas' | 'tables'
  | 'restaurant-recipes' | 'sales' | 'daily-summary' | 'gre-guides'
  | 'sunat-exceptions' | 'inventory' | 'purchases' | 'reports'
  | 'restaurant-menu' | 'restaurant-supplies' | 'products' | 'customers'
  | 'masters' | 'appcfg' | 'company';

type MenuGroup = 'operacion' | 'abastecimiento' | 'catalogo' | 'relaciones' | 'administracion';

type QuickAccessItem = {
  id: ModuleTab;
  group: MenuGroup;
  kicker: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
};

type BusinessPulseRange = 'DAY' | 'MONTH' | 'YEAR';
type BusinessPulsePoint = { label: string; sales: number; purchases: number };
type BusinessPulseDataset = Record<BusinessPulseRange, BusinessPulsePoint[]>;

// ── constants (home-only) ─────────────────────────────────────────────────────
const QUICK_ACCESS_FEATURED: ModuleTab[] = ['sales', 'cash', 'purchases', 'inventory'];

const QUICK_ACCESS_META: Partial<Record<ModuleTab, { badge: string; flow: string }>> = {
  sales:     { badge: 'Venta rapida',    flow: 'Emitir comprobante en segundos' },
  cash:      { badge: 'Control de caja', flow: 'Apertura, cobro y cierre del turno' },
  purchases: { badge: 'Compra agil',     flow: 'Registrar ingreso y costo de mercaderia' },
  inventory: { badge: 'Stock al dia',    flow: 'Existencias, lotes y alertas de quiebre' },
};

const QUICK_ACCESS_IMAGES: Partial<Record<ModuleTab, string>> = {
  'racing-ops':         quickGenericImg,
  'restaurant-orders':   quickRestaurantOrdersImg,
  comandas:              quickComandasImg,
  tables:                quickTablesImg,
  sales:                 quickSalesImg,
  'daily-summary':       quickDailySummaryImg,
  'gre-guides':          quickGreGuidesImg,
  'sunat-exceptions':    quickSunatExceptionsImg,
  cash:                  quickCashImg,
  purchases:             quickPurchasesImg,
  reports:               quickReportsImg,
  'restaurant-menu':     quickRestaurantMenuImg,
  'restaurant-supplies': quickRestaurantSuppliesImg,
  inventory:             quickInventoryImg,
  products:              quickProductsImg,
  customers:             quickCustomersImg,
  masters:               quickMastersImg,
  appcfg:                quickAppcfgImg,
  company:               quickCompanyImg,
};

const BUSINESS_PULSE_RANGES: BusinessPulseRange[] = ['DAY', 'MONTH', 'YEAR'];
const BUSINESS_PULSE_EMPTY: BusinessPulseDataset = { DAY: [], MONTH: [], YEAR: [] };
const BUSINESS_PULSE_CACHE_KEY = 'facturacion.businessPulseCache.v1';
const BUSINESS_PULSE_CACHE_TTL_MS = 2 * 60 * 1000;

function resolveQuickAccessImage(tabId: ModuleTab): string {
  return QUICK_ACCESS_IMAGES[tabId] ?? quickGenericImg;
}

// ── props ─────────────────────────────────────────────────────────────────────
type HomeViewProps = {
  accessToken: string;
  companyId: number;
  branchId: number | null;
  warehouseId: number | null;
  canViewBusinessPulse: boolean;
  quickAccessItems: QuickAccessItem[];
  onTabSelect: (tab: ModuleTab) => void;
};

// ── component ─────────────────────────────────────────────────────────────────
export function HomeView({
  accessToken,
  companyId,
  branchId,
  warehouseId,
  canViewBusinessPulse,
  quickAccessItems,
  onTabSelect,
}: HomeViewProps) {
  const [businessPulseRange, setBusinessPulseRange] = useState<BusinessPulseRange>('DAY');
  const [businessPulseData, setBusinessPulseData] = useState<BusinessPulseDataset>(BUSINESS_PULSE_EMPTY);
  const [businessPulseLoading, setBusinessPulseLoading] = useState(false);
  const [businessPulseError, setBusinessPulseError] = useState<string | null>(null);

  // ── derived lists ──────────────────────────────────────────────────────────
  const featuredSet = useMemo(() => new Set(QUICK_ACCESS_FEATURED), []);

  const featuredQuickAccessItems = useMemo(
    () => quickAccessItems
      .filter((item) => featuredSet.has(item.id))
      .sort((a, b) => QUICK_ACCESS_FEATURED.indexOf(a.id) - QUICK_ACCESS_FEATURED.indexOf(b.id)),
    [quickAccessItems, featuredSet],
  );

  const secondaryQuickAccessItems = useMemo(
    () => quickAccessItems.filter((item) => !featuredSet.has(item.id)),
    [quickAccessItems, featuredSet],
  );

  // ── business pulse chart ───────────────────────────────────────────────────
  const activeBusinessPulsePoints = businessPulseData[businessPulseRange] ?? [];

  const businessPulseMaxValue = useMemo(
    () => activeBusinessPulsePoints.reduce((acc, row) => Math.max(acc, row.sales, row.purchases), 0),
    [activeBusinessPulsePoints],
  );

  const businessPulseTotals = useMemo(
    () => activeBusinessPulsePoints.reduce(
      (acc, row) => { acc.sales += row.sales; acc.purchases += row.purchases; return acc; },
      { sales: 0, purchases: 0 },
    ),
    [activeBusinessPulsePoints],
  );

  const businessPulseChart = useMemo(() => {
    const rows = activeBusinessPulsePoints;
    if (!rows.length || businessPulseMaxValue <= 0) {
      return {
        salesPath: '', purchasesPath: '', salesArea: '', purchasesArea: '',
        salesDots: [] as Array<{ x: number; y: number; key: string }>,
        purchasesDots: [] as Array<{ x: number; y: number; key: string }>,
        grid: [25, 50, 75],
      };
    }
    const width = 640; const height = 220;
    const left = 16; const right = 16; const top = 14; const bottom = 18;
    const innerW = width - left - right; const innerH = height - top - bottom;
    const stepX = rows.length <= 1 ? 0 : innerW / (rows.length - 1);

    const salesPoints = rows.map((row, idx) => {
      const x = left + stepX * idx;
      const y = top + innerH - ((row.sales / businessPulseMaxValue) * innerH);
      return { x, y, point: `${x.toFixed(2)},${y.toFixed(2)}`, key: `${row.label}-s-${idx}` };
    });
    const purchasesPoints = rows.map((row, idx) => {
      const x = left + stepX * idx;
      const y = top + innerH - ((row.purchases / businessPulseMaxValue) * innerH);
      return { x, y, point: `${x.toFixed(2)},${y.toFixed(2)}`, key: `${row.label}-p-${idx}` };
    });

    const salesPath = salesPoints.map((e) => e.point).join(' ');
    const purchasesPath = purchasesPoints.map((e) => e.point).join(' ');
    const baseline = (top + innerH).toFixed(2);
    const firstX = left.toFixed(2);
    const lastX = (left + stepX * (rows.length - 1)).toFixed(2);

    return {
      salesPath, purchasesPath,
      salesArea: `${firstX},${baseline} ${salesPath} ${lastX},${baseline}`,
      purchasesArea: `${firstX},${baseline} ${purchasesPath} ${lastX},${baseline}`,
      salesDots: salesPoints.map((e) => ({ x: e.x, y: e.y, key: e.key })),
      purchasesDots: purchasesPoints.map((e) => ({ x: e.x, y: e.y, key: e.key })),
      grid: [25, 50, 75],
    };
  }, [activeBusinessPulsePoints, businessPulseMaxValue]);

  // ── data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canViewBusinessPulse) {
      setBusinessPulseLoading(false);
      setBusinessPulseError(null);
      return;
    }

    // HomeView only renders when the home tab is active, so no activeTab guard needed.
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cacheScope = `${companyId}:${branchId ?? 'ALL'}:${warehouseId ?? 'ALL'}`;
    let cachedData: BusinessPulseDataset | null = null;

    try {
      if (typeof window !== 'undefined') {
        const rawCache = window.localStorage.getItem(BUSINESS_PULSE_CACHE_KEY);
        if (rawCache) {
          const parsed = JSON.parse(rawCache) as { scope?: string; generatedAt?: number; data?: BusinessPulseDataset };
          const generatedAt = Number(parsed.generatedAt ?? 0);
          const isFresh = Number.isFinite(generatedAt) && (Date.now() - generatedAt) <= BUSINESS_PULSE_CACHE_TTL_MS;
          if (parsed.scope === cacheScope && parsed.data && isFresh) {
            cachedData = { DAY: parsed.data.DAY ?? [], MONTH: parsed.data.MONTH ?? [], YEAR: parsed.data.YEAR ?? [] };
            setBusinessPulseData(cachedData);
            if ((cachedData[businessPulseRange] ?? []).length > 0) {
              setBusinessPulseError(null);
              setBusinessPulseLoading(false);
              return;
            }
          }
        }
      }
    } catch { /* ignore */ }

    const load = async () => {
      setBusinessPulseLoading(true);
      setBusinessPulseError(null);
      const rangeToLoad = businessPulseRange;
      try {
        const response = await fetchHomeMetricsSummary(accessToken, { range: rangeToLoad, branchId, warehouseId });
        if (cancelled) return;
        const agg = (response.points ?? []).map((row) => ({
          label: String(row.label ?? ''),
          sales: Number(row.sales ?? 0),
          purchases: Number(row.purchases ?? 0),
        }));
        const nextData: BusinessPulseDataset = {
          DAY:   rangeToLoad === 'DAY'   ? agg : (cachedData?.DAY   ?? []),
          MONTH: rangeToLoad === 'MONTH' ? agg : (cachedData?.MONTH ?? []),
          YEAR:  rangeToLoad === 'YEAR'  ? agg : (cachedData?.YEAR  ?? []),
        };
        setBusinessPulseData(nextData);
        try {
          window.localStorage.setItem(BUSINESS_PULSE_CACHE_KEY, JSON.stringify({ scope: cacheScope, generatedAt: Date.now(), data: nextData }));
        } catch { /* ignore */ }
      } catch (err) {
        if (!cancelled) setBusinessPulseError(err instanceof Error ? err.message : 'No se pudo cargar el pulso del negocio.');
      } finally {
        if (!cancelled) setBusinessPulseLoading(false);
      }
    };

    timerId = setTimeout(() => { if (!cancelled) void load(); }, 350);
    return () => { cancelled = true; if (timerId) clearTimeout(timerId); };
  }, [accessToken, companyId, branchId, warehouseId, businessPulseRange, canViewBusinessPulse]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
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
                <button key={item.id} type="button" className={`quick-home-card quick-home-card-featured module-${item.id}`} onClick={() => onTabSelect(item.id)}>
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
              <button key={item.id} type="button" className={`quick-home-card module-${item.id}`} onClick={() => onTabSelect(item.id)}>
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

      {canViewBusinessPulse && (
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
                      x1="16" y1={14 + ((100 - pct) / 100) * (220 - 14 - 18)}
                      x2="624" y2={14 + ((100 - pct) / 100) * (220 - 14 - 18)}
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
      )}
    </section>
  );
}
