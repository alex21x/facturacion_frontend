---
name: vertical-restaurant
description: "Use when: building features, fixing bugs, or adding new capabilities for the RESTAURANT vertical. Reference for exclusive modules, feature flags, DB tables, API routes, comanda/table/recipe flow, and frontend structure specific to RESTAURANT."
---

# Vertical RESTAURANT — Referencia funcional completa

## Definición
- **Código en BD:** `RESTAURANT`
- **Descripción:** Venta por mesa, salón y cocina.
- **Tabla:** `appcfg.verticals` (código único, status=1).

---

## Feature flags de la vertical (vertical_feature_templates)

| Feature code | Default | Propósito |
|---|---|---|
| `SALES_TAX_BRIDGE` | true | Envío a SUNAT |
| `SALES_SELLER_TO_CASHIER` | false | Flujo mesero→caja separado |
| `PRODUCT_WHOLESALE_PRICING` | false | Precios mayorista (no aplica en restaurante) |
| `RESTAURANT_MENU_IGV_INCLUDED` | configurable | IGV incluido en precios del menú |
| `RESTAURANT_RECIPES_ENABLED` | configurable | Habilitación de recetas y descuento de insumos |

---

## Módulos frontend activos (App.tsx)

| Tab ID | Grupo | Label por defecto | Notas |
|---|---|---|---|
| `home` | operacion | Acceso rápido | Disponible en todos los rubros |
| `cash` | operacion | Caja del Día | Override de label para RESTAURANT |
| `restaurant-orders` | operacion | Pedidos | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `comandas` | operacion | Comandas | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `tables` | operacion | Mesas | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `daily-summary` | operacion | Resumen Diario | Label override: declaración diaria boletas |
| `sunat-exceptions` | operacion | Excepciones | Hint override para restaurante |
| `inventory` | abastecimiento | Insumos y Bodega | Label override: bodega de ingredientes |
| `purchases` | abastecimiento | Compras de Insumos | Label override: compras cocina |
| `reports` | abastecimiento | Reportes | Hint override: ventas por mesa, platos |
| `restaurant-menu` | catalogo | Menú | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `restaurant-supplies` | catalogo | Insumos | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `restaurant-recipes` | catalogo | Recetas | **Exclusivo RESTAURANT** (`onlyVerticals`) |
| `customers` | relaciones | Comensales | Label override para RESTAURANT |
| `masters` | catalogo | Maestros | Hint override: modos de pago, config cajas |
| `appcfg` | administracion | Configuración | Disponible en todos los rubros |
| `company` | administracion | Mi Empresa | Disponible en todos los rubros |

**Tabs OCULTOS en RESTAURANT** (via `HIDDEN_TABS_BY_VERTICAL`):
- `sales` (la venta se hace desde `restaurant-orders`)
- `gre-guides` (sin traslados de mercadería típicos en restaurante)
- `products` (reemplazado por `restaurant-menu` + `restaurant-supplies`)

---

## Componentes frontend clave

| Componente | Ruta |
|---|---|
| `RestaurantOrderView` | `src/modules/restaurant/components/RestaurantOrderView.tsx` |
| `ComandasView` | `src/modules/restaurant/components/ComandasView.tsx` |
| `TablesView` | `src/modules/restaurant/components/TablesView.tsx` |
| `RecipeEditorView` | `src/modules/restaurant/components/RecipeEditorView.tsx` |
| `RestaurantInventoryView` | `src/modules/inventory/components/RestaurantInventoryView.tsx` |
| `RestaurantPurchasesView` | `src/modules/purchases/components/RestaurantPurchasesView.tsx` |
| `RestaurantMenuProductsView` | `src/modules/products/components/RestaurantMenuProductsView.tsx` |
| `RestaurantSuppliesProductsView` | `src/modules/products/components/RestaurantSuppliesProductsView.tsx` |

---

## API backend — rutas exclusivas de RESTAURANT

| Método | Ruta | Controlador | Propósito |
|---|---|---|---|
| GET | `/api/restaurant/bootstrap` | `RestaurantController@bootstrap` | Contexto inicial: mesas, turnos, flags |
| GET | `/api/restaurant/comandas` | `RestaurantController@comandas` | Listado de comandas activas |
| PUT | `/api/restaurant/comandas/{id}/status` | `RestaurantController@updateComandaStatus` | Cambiar estado comanda |
| GET | `/api/restaurant/tables` | `RestaurantController@tables` | Estado de mesas y salones |
| POST | `/api/restaurant/tables` | `RestaurantController@createTable` | Crear mesa |
| PUT | `/api/restaurant/tables/{id}` | `RestaurantController@updateTable` | Actualizar mesa |
| GET | `/api/restaurant/orders` | `RestaurantController@fetchOrders` | Listado de órdenes |
| GET | `/api/restaurant/orders/{id}` | `RestaurantController@showOrder` | Detalle de orden |
| POST | `/api/restaurant/orders` | `RestaurantController@createOrder` | Crear orden de mesa |
| POST | `/api/restaurant/orders/{id}/checkout` | `RestaurantController@checkoutOrder` | Cobrar mesa → emitir documento |
| GET | `/api/restaurant/orders/{id}/preparation-requirements` | `RestaurantController@preparationRequirements` | Insumos para preparación |
| GET | `/api/restaurant/recipes/{menuProductId}` | `RestaurantController@getRecipe` | Receta de un plato |
| PUT | `/api/restaurant/recipes/{menuProductId}` | `RestaurantController@upsertRecipe` | Crear/actualizar receta |

---

## Tablas de base de datos relevantes

| Esquema.Tabla | Propósito |
|---|---|
| `core.companies` | Empresa |
| `core.branches` | Sucursales (salones) |
| `appcfg.company_verticals` | Asignación vertical empresa |
| `appcfg.company_feature_toggles` | Feature flags empresa (incl. RESTAURANT_*) |
| `appcfg.vertical_feature_templates` | Defaults de features por vertical |
| `sales.commercial_documents` | Documentos emitidos al hacer checkout de mesa |
| `sales.cash_sessions` | Sesiones de caja del turno |
| `inventory.products` | Platos del menú (tipo MENU) e insumos (tipo SUPPLY) |
| `inventory.inventory_ledger` | Descuento automático de insumos vía recetas |
| `inventory.current_stock` | Vista stock actual (solo lectura) |
| `inventory.product_uom_conversions` | Conversiones de unidades para insumos |

---

## Flujo operativo RESTAURANT

1. **Apertura de turno:** Usuario abre sesión de caja → disponibles las mesas.
2. **Toma de pedido:** Mesero crea orden de mesa (`POST /restaurant/orders`) con platos del menú.
3. **Comanda a cocina:** Aparece en `ComandasView` con estado `PENDING`.
4. **Preparación:** Cocina actualiza estado → `IN_PREPARATION` → `READY`.
5. **Checkout:** Mesero cobra la mesa (`POST /restaurant/orders/{id}/checkout`) → se emite boleta/factura.
6. **Descuento de insumos:** Si `RESTAURANT_RECIPES_ENABLED=true`, el checkout descuenta insumos automáticamente via `inventory.inventory_ledger`.
7. **Resumen Diario:** Al final del día se declaran boletas a SUNAT.
8. **Cierre de turno:** Se cierra sesión de caja.

---

## Flujo de recetas (RESTAURANT_RECIPES_ENABLED)

- Cada plato puede tener receta definida en `RecipeEditorView`.
- La receta especifica insumos y cantidades por unidad de plato.
- Al hacer checkout, el sistema descuenta los insumos del stock.
- Servicio: `app/Services/Restaurant/RestaurantRecipeService.php`.
- Flag consultado en `RestaurantController@bootstrap` → `restaurant_recipes_enabled`.

---

## Cómo añadir funcionalidad nueva al rubro RESTAURANT

1. **Feature flag nuevo:** Prefijo `RESTAURANT_` → agregar a `COMMERCE_FEATURE_CODES` + seed en migración aditiva.
2. **Módulo exclusivo de restaurante:**
   - Componente en `src/modules/restaurant/components/`.
   - `ModuleTab` en `App.tsx` + ítem en `MENU_ITEMS` con `onlyVerticals: ['RESTAURANT']`.
3. **Módulo compartido con label diferente:**
   - Agregar `verticalLabels: { RESTAURANT: { ... } }` en el ítem de menú existente.
4. **Rutas backend nuevas:** Agregar en `routes/api.php` dentro del grupo RBAC correspondiente.
5. **Propagación de ramas:** Aplicar en `cambios-generales` → propagar a `docker-multi-entorno` y `railway`.
