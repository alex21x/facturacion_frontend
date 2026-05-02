import { useEffect, useRef, useState } from 'react';
import './RecipeEditorView.css';
import { fetchRestaurantRecipe, upsertRestaurantRecipe } from '../api';
import type { RecipeLine } from '../types';
import type { InventoryProduct } from '../../inventory/types';

type Props = {
  accessToken: string;
  warehouseId: number | null;
};

type DraftLine = {
  key: string;
  ingredient_product_id: number | null;
  ingredient_name: string;
  qty_required_base: string;
  unit_label: string;
  wastage_percent: string;
};

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    ingredient_product_id: null,
    ingredient_name: '',
    qty_required_base: '',
    unit_label: '',
    wastage_percent: '0',
  };
}

function formatQty(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return Math.abs(v - Math.round(v)) < 0.0001 ? String(Math.round(v)) : v.toFixed(3).replace(/\.?0+$/, '');
}

export function RecipeEditorView({ accessToken, warehouseId }: Props) {
  // --- Menu product search ---
  const [menuSearch, setMenuSearch] = useState('');
  const [menuSuggestions, setMenuSuggestions] = useState<InventoryProduct[]>([]);
  const [menuSearching, setMenuSearching] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<InventoryProduct | null>(null);

  // --- Recipe state ---
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'ok' | 'err'>('ok');

  // --- Ingredient search per line ---
  const [ingSearch, setIngSearch] = useState<Record<string, string>>({});
  const [ingSuggestions, setIngSuggestions] = useState<Record<string, InventoryProduct[]>>({});
  const [ingSearching, setIngSearching] = useState<Record<string, boolean>>({});

  const menuSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Search menu products
  useEffect(() => {
    if (menuSearchTimer.current) clearTimeout(menuSearchTimer.current);
    const q = menuSearch.trim();
    if (q.length < 2) { setMenuSuggestions([]); return; }

    menuSearchTimer.current = setTimeout(async () => {
      setMenuSearching(true);
      try {
        const { fetchInventoryProducts } = await import('../../inventory/api');
        const results = await fetchInventoryProducts(accessToken, {
          search: q,
          warehouseId: warehouseId ?? undefined,
          limit: 20,
          autocomplete: true,
        });
        setMenuSuggestions(results);
      } catch {
        setMenuSuggestions([]);
      } finally {
        setMenuSearching(false);
      }
    }, 280);

    return () => { if (menuSearchTimer.current) clearTimeout(menuSearchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuSearch]);

  // Load recipe when menu product selected
  useEffect(() => {
    if (!selectedMenu) { setLines([emptyLine()]); setNotes(''); return; }

    setRecipeLoading(true);
    setMessage('');

    fetchRestaurantRecipe(accessToken, selectedMenu.id)
      .then((recipe) => {
        if (!recipe || recipe.lines.length === 0) {
          setLines([emptyLine()]);
          setNotes('');
        } else {
          setNotes(recipe.notes ?? '');
          setLines(recipe.lines.map((l: RecipeLine) => ({
            key: crypto.randomUUID(),
            ingredient_product_id: l.ingredient_product_id,
            ingredient_name: l.ingredient_name ?? `Insumo #${l.ingredient_product_id}`,
            qty_required_base: formatQty(l.qty_required_base),
            unit_label: l.unit_label,
            wastage_percent: formatQty(l.wastage_percent),
          })));
        }
      })
      .catch(() => {
        setLines([emptyLine()]);
        setNotes('');
      })
      .finally(() => setRecipeLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMenu]);

  // Search ingredient for a given line
  function handleIngSearch(key: string, value: string) {
    setIngSearch((prev) => ({ ...prev, [key]: value }));
    if (ingSearchTimers.current[key]) clearTimeout(ingSearchTimers.current[key]);
    const q = value.trim();
    if (q.length < 2) { setIngSuggestions((prev) => ({ ...prev, [key]: [] })); return; }

    ingSearchTimers.current[key] = setTimeout(async () => {
      setIngSearching((prev) => ({ ...prev, [key]: true }));
      try {
        const { fetchInventoryProducts } = await import('../../inventory/api');
        const results = await fetchInventoryProducts(accessToken, {
          search: q,
          warehouseId: warehouseId ?? undefined,
          limit: 15,
          autocomplete: true,
        });
        setIngSuggestions((prev) => ({ ...prev, [key]: results }));
      } catch {
        setIngSuggestions((prev) => ({ ...prev, [key]: [] }));
      } finally {
        setIngSearching((prev) => ({ ...prev, [key]: false }));
      }
    }, 280);
  }

  function selectIngredient(key: string, product: InventoryProduct) {
    setLines((prev) => prev.map((l) =>
      l.key === key
        ? { ...l, ingredient_product_id: product.id, ingredient_name: product.name, unit_label: product.unit_code ?? '' }
        : l
    ));
    setIngSearch((prev) => ({ ...prev, [key]: '' }));
    setIngSuggestions((prev) => ({ ...prev, [key]: [] }));
  }

  function updateLine(key: string, field: keyof DraftLine, value: string) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function save() {
    if (!selectedMenu) return;

    const validLines = lines.filter((l) => l.ingredient_product_id !== null && Number(l.qty_required_base) > 0);
    if (validLines.length === 0) {
      setMessage('Agrega al menos un ingrediente con cantidad válida.');
      setMessageKind('err');
      return;
    }

    setSaveBusy(true);
    setMessage('');
    try {
      await upsertRestaurantRecipe(accessToken, selectedMenu.id, {
        notes: notes.trim() || null,
        lines: validLines.map((l) => ({
          ingredient_product_id: l.ingredient_product_id as number,
          qty_required_base: Number(l.qty_required_base),
          unit_label: l.unit_label.trim() || 'UND',
          wastage_percent: Number(l.wastage_percent) || 0,
        })),
      });
      setMessage(`Receta guardada para "${selectedMenu.name}".`);
      setMessageKind('ok');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar receta');
      setMessageKind('err');
    } finally {
      setSaveBusy(false);
    }
  }

  function selectMenu(product: InventoryProduct) {
    setSelectedMenu(product);
    setMenuSearch(product.name);
    setMenuSuggestions([]);
    setMessage('');
  }

  function clearMenu() {
    setSelectedMenu(null);
    setMenuSearch('');
    setMenuSuggestions([]);
    setLines([emptyLine()]);
    setNotes('');
    setMessage('');
  }

  return (
    <section className="module-panel restaurant-panel">
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Restaurante · Maestros</p>
          <h3>Recetas</h3>
          <p className="restaurant-toolbar__copy">
            Define los ingredientes e insumos requeridos para preparar cada plato del menú.
          </p>
        </div>
      </div>

      {/* ── Menu product selector ── */}
      <div className="recipe-editor-search-wrap">
        <label className="restaurant-field restaurant-field--wide">
          <span>Buscar plato del menú</span>
          <div style={{ position: 'relative' }}>
            <input
              className="restaurant-input"
              placeholder="Escribe el nombre del plato..."
              value={menuSearch}
              onChange={(e) => {
                setMenuSearch(e.target.value);
                if (selectedMenu) clearMenu();
              }}
              autoComplete="off"
            />
            {menuSearching && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#7a6f63' }}>
                Buscando...
              </span>
            )}
            {menuSuggestions.length > 0 && (
              <ul className="recipe-suggest-list">
                {menuSuggestions.map((p) => (
                  <li key={p.id} className="recipe-suggest-item" onClick={() => selectMenu(p)}>
                    <strong>{p.name}</strong>
                    {p.sku && <span className="recipe-suggest-item__sku"> · {p.sku}</span>}
                    {p.category_name && <span className="recipe-suggest-item__cat"> — {p.category_name}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>

        {selectedMenu && (
          <div className="recipe-selected-product">
            <span>
              <strong>{selectedMenu.name}</strong>
              {selectedMenu.sku && <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#7a6f63' }}>#{selectedMenu.sku}</span>}
            </span>
            <button type="button" className="restaurant-ghost-btn" onClick={clearMenu}>
              Cambiar
            </button>
          </div>
        )}
      </div>

      {/* ── Recipe form ── */}
      {selectedMenu && (
        <div className="recipe-editor-body">
          {recipeLoading ? (
            <p style={{ padding: '24px 0', color: '#7a6f63', fontSize: '0.85rem' }}>Cargando receta...</p>
          ) : (
            <>
              <div className="recipe-editor-header-row">
                <h4 className="recipe-editor-title">Ingredientes</h4>
                <button type="button" className="restaurant-ghost-btn" onClick={addLine}>
                  + Agregar ingrediente
                </button>
              </div>

              {/* Column headers */}
              <div className="recipe-lines-grid recipe-lines-grid--header">
                <span>Ingrediente / Insumo</span>
                <span>Cantidad base</span>
                <span>Unidad</span>
                <span>Merma %</span>
                <span></span>
              </div>

              {lines.map((line, idx) => (
                <div key={line.key} className="recipe-lines-grid recipe-lines-grid--row">
                  {/* Ingredient search */}
                  <div style={{ position: 'relative' }}>
                    {line.ingredient_product_id ? (
                      <div className="recipe-ingredient-chip">
                        <span>{line.ingredient_name}</span>
                        <button
                          type="button"
                          className="recipe-ingredient-chip__clear"
                          onClick={() => {
                            setLines((prev) => prev.map((l) => l.key === line.key
                              ? { ...l, ingredient_product_id: null, ingredient_name: '', unit_label: '' }
                              : l
                            ));
                          }}
                          aria-label="Quitar"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          className="restaurant-input restaurant-input--sm"
                          placeholder="Buscar insumo..."
                          value={ingSearch[line.key] ?? ''}
                          onChange={(e) => handleIngSearch(line.key, e.target.value)}
                          autoComplete="off"
                          aria-label={`Ingrediente línea ${idx + 1}`}
                        />
                        {ingSearching[line.key] && (
                          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#7a6f63' }}>…</span>
                        )}
                        {(ingSuggestions[line.key] ?? []).length > 0 && (
                          <ul className="recipe-suggest-list recipe-suggest-list--inline">
                            {(ingSuggestions[line.key] ?? []).map((p) => (
                              <li key={p.id} className="recipe-suggest-item" onClick={() => selectIngredient(line.key, p)}>
                                <strong>{p.name}</strong>
                                {p.unit_code && <span className="recipe-suggest-item__sku"> [{p.unit_code}]</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  {/* Qty */}
                  <input
                    className="restaurant-input restaurant-input--sm restaurant-input--num"
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="1"
                    value={line.qty_required_base}
                    onChange={(e) => updateLine(line.key, 'qty_required_base', e.target.value)}
                    aria-label={`Cantidad línea ${idx + 1}`}
                  />

                  {/* Unit label */}
                  <input
                    className="restaurant-input restaurant-input--sm"
                    type="text"
                    placeholder="KG, UND..."
                    maxLength={20}
                    value={line.unit_label}
                    onChange={(e) => updateLine(line.key, 'unit_label', e.target.value)}
                    aria-label={`Unidad línea ${idx + 1}`}
                  />

                  {/* Wastage */}
                  <input
                    className="restaurant-input restaurant-input--sm restaurant-input--num"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={line.wastage_percent}
                    onChange={(e) => updateLine(line.key, 'wastage_percent', e.target.value)}
                    aria-label={`Merma línea ${idx + 1}`}
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    className="recipe-remove-btn"
                    onClick={() => removeLine(line.key)}
                    aria-label="Eliminar línea"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Notes */}
              <label className="restaurant-field" style={{ marginTop: 16 }}>
                <span>Notas de preparación <em>(opcional)</em></span>
                <textarea
                  className="restaurant-input"
                  rows={2}
                  maxLength={500}
                  placeholder="Ej: marinar 2 horas, servir caliente..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </label>

              {message && (
                <p className={`notice ${messageKind === 'err' ? 'notice--error' : 'notice--success'} restaurant-notice`}>
                  {message}
                </p>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  type="button"
                  className="restaurant-primary-btn"
                  disabled={saveBusy}
                  onClick={() => void save()}
                >
                  {saveBusy ? 'Guardando...' : 'Guardar receta'}
                </button>
                <button type="button" className="restaurant-ghost-btn" onClick={addLine}>
                  + Ingrediente
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!selectedMenu && (
        <div className="restaurant-empty-state" style={{ marginTop: 32 }}>
          <strong>Selecciona un plato para editar su receta</strong>
          <p>Busca el plato del menú y define sus ingredientes, cantidades y mermas.</p>
        </div>
      )}
    </section>
  );
}
