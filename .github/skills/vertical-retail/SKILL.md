---
name: vertical-retail
description: "Use when: building features, fixing bugs, or adding new capabilities for the RETAIL vertical. Reference for module inventory, feature flags, DB tables, API routes, and frontend structure specific to RETAIL."
---

# Vertical RETAIL — Referencia funcional completa

## Definición
- **Código en BD:** `RETAIL`
- **Descripción:** Venta mostrador con inventario y caja.
- **Tabla:** `appcfg.verticals` (código único, status=1).
- **Asignación por defecto:** Todas las empresas nuevas reciben RETAIL como vertical primaria si no se especifica otra.

---

## Feature flags de la vertical (vertical_feature_templates)

| Feature code | Default |
|---|---|
| `SALES_TAX_BRIDGE` | true |
| `SALES_SELLER_TO_CASHIER` | false |
| `PRODUCT_WHOLESALE_PRICING` | true |

Adicionalmente aplican todos los `COMMERCE_FEATURE_CODES` globales (definidos en `AppConfigController::COMMERCE_FEATURE_CODES`):
- `PRODUCT_MULTI_UOM`, `PRODUCT_UOM_CONVERSIONS`, `PRODUCT_WHOLESALE_PRICING`
- `INVENTORY_PRODUCTS_BY_PROFILE`, `INVENTORY_PRODUCT_MASTERS_BY_PROFILE`
- `SALES_CUSTOMER_PRICE_PROFILE`, `SALES_SELLER_TO_CASHIER`, `SALES_ALLOW_ISSUED_EDIT_BEFORE_SUNAT_FINAL`
- `SALES_ANTICIPO_ENABLED`, `SALES_TAX_BRIDGE`, `SALES_TAX_BRIDGE_DEBUG_VIEW`
- `SALES_GLOBAL_DISCOUNT_ENABLED`, `SALES_ITEM_DISCOUNT_ENABLED`, `SALES_FREE_ITEMS_ENABLED`
- `SALES_DETRACCION_ENABLED`, `SALES_RETENCION_ENABLED`, `SALES_PERCEPCION_ENABLED`
- `PURCHASES_GLOBAL_DISCOUNT_ENABLED`, `PURCHASES_ITEM_DISCOUNT_ENABLED`, `PURCHASES_FREE_ITEMS_ENABLED`
- `PURCHASES_DETRACCION_ENABLED`, `PURCHASES_RETENCION_COMPRADOR_ENABLED`, `PURCHASES_RETENCION_PROVEEDOR_ENABLED`, `PURCHASES_PERCEPCION_ENABLED`

---

## Módulos frontend activos (App.tsx)

| Tab ID | Grupo | Label por defecto | Notas |
|---|---|---|---|
| `home` | operacion | Acceso rápido | Disponible en todos los rubros |
| `cash` | operacion | Caja | Sesiones y movimientos |
| `sales` | operacion | Comercial | Emisión y seguimiento |
| `daily-summary` | operacion | Resumen Diario | Declaración boletas SUNAT |
| `gre-guides` | operacion | Guía GRE | Remitente y transportista |
| `sunat-exceptions` | operacion | Excepciones | Pendientes confirmación manual |
| `inventory` | abastecimiento | Inventario | Existencias y lotes |
| `purchases` | abastecimiento | Compras | Ingresos y ajustes |
| `reports` | abastecimiento | Reportes | Centro unificado |
| `products` | catalogo | Productos | SKU, precios y estado |
| `customers` | relaciones | Clientes | Documentos y datos |
| `masters` | catalogo | Maestros | Series, cajas y reglas |
| `appcfg` | administracion | Configuración | Permisos y límites |
| `company` | administracion | Mi Empresa | RUC, logo, certificado |

**Tabs OCULTOS en RETAIL** (via `HIDDEN_TABS_BY_VERTICAL`):
- `comandas`, `tables`, `restaurant-recipes`

**Tabs EXCLUSIVOS de otros rubros** (no aparecen en RETAIL):
- `restaurant-orders`, `restaurant-menu`, `restaurant-supplies` → solo RESTAURANT

---

## Componentes frontend clave

| Componente | Ruta |
|---|---|
| `RetailInventoryView` | `src/modules/inventory/components/RetailInventoryView.tsx` |
| `RetailPurchasesView` | `src/modules/purchases/components/RetailPurchasesView.tsx` |
| `RetailProductsView` | `src/modules/products/components/RetailProductsView.tsx` |
| `SalesView` | `src/modules/sales/components/SalesView.tsx` |
| `CashView` | `src/modules/cash/components/CashView.tsx` |
| `ReportsCenterView` | `src/modules/reports/components/ReportsCenterView.tsx` |
| `CustomersView` | `src/modules/customers/components/CustomersView.tsx` |
| `MastersView` | `src/modules/masters/components/MastersView.tsx` |
| `AppConfigView` | `src/modules/appcfg/components/AppConfigView.tsx` |
| `CompanyConfigView` | `src/modules/company/components/CompanyConfigView.tsx` |

---

## API backend — rutas clave

| Método | Ruta | Controlador | Notas |
|---|---|---|---|
| GET | `/api/sales/...` | `SalesController` | Documentos comerciales |
| POST | `/api/sales/commercial-documents` | `SalesController` | Crear venta |
| GET | `/api/inventory/products` | `InventoryController` | Catálogo con filtros |
| GET | `/api/inventory/product-masters` | `InventoryController` | Maestros por perfil |
| GET | `/api/purchases/list` | `PurchasesController` | Entradas de stock |
| POST | `/api/purchases/stock-entries` | `PurchasesController` | Registrar compra |
| GET | `/api/cash/sessions/current` | `CashController` | Sesión de caja activa |
| POST | `/api/cash/sessions` | `CashController` | Abrir caja |
| PUT | `/api/cash/sessions/{id}/close` | `CashController` | Cerrar caja |
| GET | `/api/masters/inventory-settings` | `MasterDataController` | Config inventario |
| GET | `/api/appcfg/operational-context` | `AppConfigController` | Contexto + vertical activa |

---

## Tablas de base de datos relevantes

| Esquema.Tabla | Propósito |
|---|---|
| `core.companies` | Empresa |
| `core.branches` | Sucursales |
| `appcfg.company_verticals` | Asignación vertical empresa |
| `appcfg.verticals` | Catálogo de rubros |
| `appcfg.company_feature_toggles` | Feature flags por empresa |
| `appcfg.vertical_feature_templates` | Defaults de features por vertical |
| `appcfg.company_vertical_feature_overrides` | Overrides empresa+vertical |
| `inventory.products` | Catálogo de productos |
| `inventory.product_masters` | Maestros de productos |
| `inventory.inventory_ledger` | Movimientos de stock (fuente de verdad) |
| `inventory.current_stock` | Vista de stock actual (solo lectura, GROUP BY) |
| `inventory.warehouses` | Almacenes |
| `inventory.product_uom_conversions` | Conversiones de unidades |
| `sales.commercial_documents` | Documentos de venta |
| `sales.cash_registers` | Cajas registradoras |
| `sales.cash_sessions` | Sesiones de caja |

---

## Flujo de ventas RETAIL

1. Usuario abre sesión de caja (`POST /cash/sessions`).
2. Busca productos (`GET /inventory/product-lookups`).
3. Crea documento comercial (`POST /sales/commercial-documents`).
4. El sistema envía a SUNAT via Tax Bridge si `SALES_TAX_BRIDGE=true`.
5. Opcionalmente emite Guía GRE para traslado de mercadería.
6. Fin de día: Resumen Diario de boletas → SUNAT.
7. Cierra caja (`PUT /cash/sessions/{id}/close`).

---

## Cómo añadir funcionalidad nueva al rubro RETAIL

1. **Feature flag nuevo:** Agregar a `COMMERCE_FEATURE_CODES` en `AppConfigController.php` + seed en `vertical_feature_templates` con migración aditiva.
2. **Módulo frontend nuevo:**
   - Crear componente en `src/modules/<modulo>/components/`.
   - Agregar `ModuleTab` en `App.tsx`.
   - Agregar ítem en `MENU_ITEMS` (con `verticalLabels` si el label debe cambiar por rubro).
   - Si es exclusivo de RETAIL: NO poner `onlyVerticals`, sino agregar otros rubros en `HIDDEN_TABS_BY_VERTICAL`.
3. **Rutas backend nuevas:** Agregar en `routes/api.php` dentro del grupo `rbac.module` correspondiente.
4. **Propagación de ramas:** Aplicar cambio en `cambios-generales` → propagar a `docker-multi-entorno` y `railway`.
