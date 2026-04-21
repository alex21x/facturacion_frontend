# CSS Architecture (Frontend App)

## Goal
Move from one large global stylesheet to module-oriented styles that are easier to maintain and safer to change.

## Current structure
- `src/styles/global.css`: legacy/base + shared UI primitives.
- `src/styles/modules/sales.css`: Sales-specific layout and controls.
- `src/styles/modules/purchases.css`: Purchases-specific layout and controls.

## Import order
1. `global.css` (legacy and shared)
2. Module files (`modules/*.css`) for targeted overrides

This keeps backward compatibility while allowing each module to evolve independently.

## Migration strategy
1. For each module, move selectors from `global.css` to `modules/<module>.css`.
2. Keep only shared tokens/utilities in `global.css`.
3. Avoid cross-module selectors in module files.
4. When a module is fully migrated, remove its duplicated legacy rules from `global.css`.

## Next modules to migrate
- `appcfg`
- `inventory`
- `reports`
- `auth`
