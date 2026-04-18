$css = [System.IO.File]::ReadAllText("c:\xampp\htdocs\facturacion_frontend\src\styles\global.css", [System.Text.Encoding]::UTF8)

$newCss = @'

/* ============================================================
   AppConfig v2 - Diseno con pestanas
   ============================================================ */

/* Barra de contexto */
.cfg-context-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.cfg-context-pill {
  display: flex;
  flex-direction: column;
  padding: 4px 12px;
  border-right: 1px solid var(--line);
  min-width: 70px;
}
.cfg-context-pill:last-child { border-right: none; }
.cfg-context-pill span {
  font-size: 0.68rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cfg-context-pill strong {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--ink);
}
.cfg-context-pill--accent strong { color: var(--primary, #2563eb); }
.cfg-context-pill--rubro strong { color: #7c3aed; }

/* Pestanas */
.cfg-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--line);
  margin-bottom: 20px;
  overflow-x: auto;
}
.cfg-tab {
  padding: 8px 18px;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  border-radius: 6px 6px 0 0;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.cfg-tab:hover {
  color: var(--ink);
  background: var(--hover, #f5f5f5);
}
.cfg-tab.active {
  color: var(--primary, #2563eb);
  border-bottom-color: var(--primary, #2563eb);
  font-weight: 700;
}
.cfg-tab-panel { animation: cfg-fadein 0.18s ease; }
@keyframes cfg-fadein {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Cards */
.cfg-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 0;
}
.cfg-card-title {
  margin: 0 0 14px;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}

/* Grid 2 columnas */
.cfg-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 700px) { .cfg-grid-2 { grid-template-columns: 1fr; } }

/* Badges */
.cfg-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
}
.cfg-badge--yes { background: #dcfce7; color: #15803d; }
.cfg-badge--no  { background: #f1f5f9; color: #64748b; }
.cfg-badge--core { background: #ede9fe; color: #6d28d9; }

/* Barras de uso */
.cfg-usage-list { display: flex; flex-direction: column; gap: 10px; }
.cfg-usage-row { display: flex; flex-direction: column; gap: 4px; }
.cfg-usage-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.cfg-usage-full { color: #dc2626 !important; font-weight: 700; }
.cfg-usage-track {
  height: 6px;
  background: var(--line);
  border-radius: 99px;
  overflow: hidden;
}
.cfg-usage-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}

/* Cards de features */
.cfg-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.cfg-feature-card {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 14px;
  background: var(--card);
  opacity: 0.72;
  transition: opacity 0.15s, border-color 0.15s, box-shadow 0.15s;
  cursor: default;
}
.cfg-feature-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  opacity: 1;
}
.cfg-feature-card--on {
  opacity: 1;
  border-color: #86efac;
}
.cfg-feature-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}
.cfg-feature-card__name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}
.cfg-feature-card__status {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 20px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
}
.cfg-feature-card__status.on {
  background: #dcfce7;
  color: #15803d;
}
.cfg-feature-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cfg-feature-card__level {
  font-size: 0.7rem;
  color: var(--ink-soft);
  background: var(--hover, #f5f5f5);
  border-radius: 4px;
  padding: 1px 6px;
}

/* Toggle list */
.cfg-toggle-list { display: flex; flex-direction: column; }
.cfg-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  transition: background 0.1s;
}
.cfg-toggle-row:last-child { border-bottom: none; }
.cfg-toggle-row:hover { background: var(--hover, #f8f9fa); }
.cfg-toggle-row__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cfg-toggle-row__name {
  font-size: 0.87rem;
  font-weight: 600;
  color: var(--ink);
}

/* Toggle switch CSS puro */
.cfg-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.cfg-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.cfg-switch__slider {
  display: block;
  width: 42px;
  height: 24px;
  background: #cbd5e1;
  border-radius: 24px;
  transition: background 0.25s;
  position: relative;
}
.cfg-switch__slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s;
}
.cfg-switch input:checked ~ .cfg-switch__slider { background: var(--primary, #2563eb); }
.cfg-switch input:checked ~ .cfg-switch__slider::after { transform: translateX(18px); }

/* Miscelaneos */
.cfg-row--active { background: #f0fdf4; }
.cfg-code { font-size: 0.75rem; }
.cfg-empty {
  padding: 32px;
  text-align: center;
  color: var(--ink-soft);
  font-style: italic;
}
.cfg-lead {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}
'@

[System.IO.File]::WriteAllText(
  "c:\xampp\htdocs\facturacion_frontend\src\styles\global.css",
  $css + $newCss,
  [System.Text.Encoding]::UTF8
)
Write-Host "CSS updated. New length: $($css.Length + $newCss.Length)"
