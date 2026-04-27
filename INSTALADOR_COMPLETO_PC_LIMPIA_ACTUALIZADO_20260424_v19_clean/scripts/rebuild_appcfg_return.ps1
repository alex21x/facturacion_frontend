$file = "c:\xampp\htdocs\facturacion_frontend\src\modules\appcfg\components\AppConfigView.tsx"
$old = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Split before the return block
$splitMarker = "`n  return ("
$splitIdx = $old.LastIndexOf($splitMarker)
$before = $old.Substring(0, $splitIdx)

# Add activeTab state after selectedVerticalCode state
$stateMarker = "  const [selectedVerticalCode, setSelectedVerticalCode] = useState('');"
$stateIdx = $before.LastIndexOf($stateMarker) + $stateMarker.Length
$before = $before.Substring(0, $stateIdx) + "`n  const [activeTab, setActiveTab] = useState<'identidad' | 'plataforma' | 'modulos' | 'comercial'>('identidad');" + $before.Substring($stateIdx)

$newReturn = @'
  return (
    <section className="module-panel">
      <div className="module-header">
        <div>
          <h3>{UI_LABELS.title}</h3>
          <p className="cfg-lead">{UI_LABELS.description}</p>
        </div>
        <button type="button" onClick={() => void loadAppCfg()} disabled={loading}>
          {UI_LABELS.refresh}
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {/* Barra de contexto siempre visible */}
      <div className="cfg-context-bar">
        <div className="cfg-context-pill">
          <span>{UI_LABELS.branch}</span>
          <strong>{branchId ?? '—'}</strong>
        </div>
        <div className="cfg-context-pill">
          <span>{UI_LABELS.warehouse}</span>
          <strong>{warehouseId ?? '—'}</strong>
        </div>
        <div className="cfg-context-pill">
          <span>{UI_LABELS.cashRegister}</span>
          <strong>{cashRegisterId ?? '—'}</strong>
        </div>
        {igvSettings && (
          <div className="cfg-context-pill cfg-context-pill--accent">
            <span>IGV activo</span>
            <strong>{igvSettings.active_rate.rate_percent}%</strong>
          </div>
        )}
        {verticalSettings?.active_vertical && (
          <div className="cfg-context-pill cfg-context-pill--rubro">
            <span>Rubro</span>
            <strong>{verticalSettings.active_vertical.name}</strong>
          </div>
        )}
      </div>

      {/* Pestanas de navegacion */}
      <div className="cfg-tabs" role="tablist">
        {(
          [
            { id: 'identidad', label: '🏢 Identidad' },
            { id: 'plataforma', label: '⚙️ Plataforma' },
            { id: 'modulos', label: '🧩 Modulos' },
            ...(commerceFeatures.length > 0 ? [{ id: 'comercial', label: '💼 Comercial' }] : []),
          ] as { id: typeof activeTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`cfg-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pestana: Identidad */}
      {activeTab === 'identidad' && (
        <div className="cfg-tab-panel">
          {verticalSettings ? (
            <div className="cfg-card">
              <h4 className="cfg-card-title">{UI_LABELS.verticalHeader}</h4>
              <form className="grid-form" onSubmit={handleSaveVerticalSettings}>
                <label>
                  {UI_LABELS.activeVertical}
                  <select
                    value={selectedVerticalCode}
                    onChange={(e) => setSelectedVerticalCode(e.target.value)}
                  >
                    <option value="">{UI_LABELS.selectVertical}</option>
                    {verticalSettings.verticals.map((row) => (
                      <option key={row.id} value={row.code}>
                        {row.name} ({row.code})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="entity-filter-action">
                  <button type="submit" disabled={loading || !selectedVerticalCode}>
                    {UI_LABELS.saveVertical}
                  </button>
                </div>
              </form>
              <table style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>{UI_LABELS.code}</th>
                    <th>{UI_LABELS.name}</th>
                    <th>{UI_LABELS.assigned}</th>
                    <th>{UI_LABELS.primary}</th>
                  </tr>
                </thead>
                <tbody>
                  {verticalSettings.verticals.map((row) => (
                    <tr
                      key={row.id}
                      className={row.code === verticalSettings.active_vertical?.code ? 'cfg-row--active' : ''}
                    >
                      <td><code className="cfg-code">{row.code}</code></td>
                      <td>{row.name}</td>
                      <td>
                        {row.is_assigned
                          ? <span className="cfg-badge cfg-badge--yes">Si</span>
                          : <span className="cfg-badge cfg-badge--no">No</span>}
                      </td>
                      <td>
                        {row.is_primary
                          ? <span className="cfg-badge cfg-badge--yes">Si</span>
                          : <span className="cfg-badge cfg-badge--no">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="cfg-empty">Sin datos de verticalizacion disponibles.</div>
          )}
        </div>
      )}

      {/* Pestana: Plataforma */}
      {activeTab === 'plataforma' && (
        <div className="cfg-tab-panel">
          <div className="cfg-grid-2">
            <div className="cfg-card">
              <h4 className="cfg-card-title">Limites de plataforma</h4>
              <form className="grid-form" onSubmit={handleSaveLimits}>
                <label>
                  {UI_LABELS.maxCompanies}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_companies_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_companies_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxBranches}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_branches_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_branches_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxWarehouses}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_warehouses_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_warehouses_enabled: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  {UI_LABELS.maxCashRegisters}
                  <input
                    type="number"
                    min={1}
                    value={limitsForm.max_cash_registers_enabled ?? ''}
                    onChange={(e) => setLimitsForm((prev) => ({ ...prev, max_cash_registers_enabled: Number(e.target.value) }))}
                  />
                </label>
                <button className="wide" type="submit" disabled={loading}>
                  {UI_LABELS.saveLimits}
                </button>
              </form>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="cfg-card">
                <h4 className="cfg-card-title">IGV maestro</h4>
                <form className="grid-form" onSubmit={handleSaveIgvSettings}>
                  <label>
                    {UI_LABELS.igvLabel}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={igvRatePercent}
                      onChange={(e) => setIgvRatePercent(e.target.value)}
                    />
                  </label>
                  <div className="entity-filter-action">
                    <button type="submit" disabled={loading}>{UI_LABELS.saveIgv}</button>
                  </div>
                  <p className="notice" style={{ gridColumn: '1 / -1', fontSize: '0.8rem', margin: 0 }}>
                    {UI_LABELS.igvDescription}
                  </p>
                  {igvSettings && (
                    <p style={{ gridColumn: '1 / -1', margin: 0 }}>
                      <strong>{UI_LABELS.igvActive}</strong> {igvSettings.active_rate.name}
                    </p>
                  )}
                </form>
              </div>
              {limits && (
                <div className="cfg-card">
                  <h4 className="cfg-card-title">{UI_LABELS.currentUsage}</h4>
                  <div className="cfg-usage-list">
                    {[
                      { label: UI_LABELS.companies, used: limits.usage.enabled_companies, max: limits.platform_limits.max_companies_enabled },
                      { label: UI_LABELS.branches, used: limits.usage.enabled_branches, max: limits.company_limits.max_branches_enabled },
                      { label: UI_LABELS.warehouses, used: limits.usage.enabled_warehouses, max: limits.company_limits.max_warehouses_enabled },
                      { label: UI_LABELS.cashRegisters, used: limits.usage.enabled_cash_registers, max: limits.company_limits.max_cash_registers_enabled },
                    ].map((item) => {
                      const pct = Math.min(100, Math.round((item.used / item.max) * 100));
                      const color = item.used >= item.max ? '#dc2626' : pct > 80 ? '#f59e0b' : 'var(--primary, #2563eb)';
                      return (
                        <div key={item.label} className="cfg-usage-row">
                          <div className="cfg-usage-meta">
                            <span>{item.label}</span>
                            <span className={item.used >= item.max ? 'cfg-usage-full' : ''}>{item.used} / {item.max}</span>
                          </div>
                          <div className="cfg-usage-track">
                            <div className="cfg-usage-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pestana: Modulos */}
      {activeTab === 'modulos' && (
        <div className="cfg-tab-panel">
          <div className="cfg-card" style={{ marginBottom: '1rem' }}>
            <h4 className="cfg-card-title">{UI_LABELS.modulesHeader}</h4>
            <table>
              <thead>
                <tr>
                  <th>{UI_LABELS.code}</th>
                  <th>{UI_LABELS.name}</th>
                  <th>{UI_LABELS.coreModule}</th>
                  <th>{UI_LABELS.companyLevel}</th>
                  <th>{UI_LABELS.branchLevel}</th>
                  <th>{UI_LABELS.active}</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((row) => (
                  <tr key={row.id}>
                    <td><code className="cfg-code">{row.code}</code></td>
                    <td>{row.name}</td>
                    <td>{row.is_core ? <span className="cfg-badge cfg-badge--core">Core</span> : '—'}</td>
                    <td>
                      {row.company_enabled === null ? '—'
                        : row.company_enabled ? <span className="cfg-badge cfg-badge--yes">Si</span>
                        : <span className="cfg-badge cfg-badge--no">No</span>}
                    </td>
                    <td>
                      {row.branch_enabled === null ? '—'
                        : row.branch_enabled ? <span className="cfg-badge cfg-badge--yes">Si</span>
                        : <span className="cfg-badge cfg-badge--no">No</span>}
                    </td>
                    <td>
                      {row.is_enabled
                        ? <span className="cfg-badge cfg-badge--yes">Activo</span>
                        : <span className="cfg-badge cfg-badge--no">Inactivo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cfg-card">
            <h4 className="cfg-card-title">{UI_LABELS.featuresHeader}</h4>
            <div className="cfg-feature-grid">
              {features.map((row) => (
                <div
                  key={row.feature_code}
                  className={`cfg-feature-card${row.is_enabled ? ' cfg-feature-card--on' : ''}`}
                  title={row.feature_code}
                >
                  <div className="cfg-feature-card__header">
                    <span className="cfg-feature-card__name">{featureRowLabel(row)}</span>
                    <span className={`cfg-feature-card__status${row.is_enabled ? ' on' : ''}`}>
                      {row.is_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="cfg-feature-card__meta">
                    <span className={verticalSourceBadgeClass(row.vertical_source)}>
                      {verticalSourceLabel(row.vertical_source)}
                    </span>
                    {row.company_enabled !== null && (
                      <span className="cfg-feature-card__level">Empresa: {row.company_enabled ? 'Si' : 'No'}</span>
                    )}
                    {row.branch_enabled !== null && (
                      <span className="cfg-feature-card__level">Sucursal: {row.branch_enabled ? 'Si' : 'No'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pestana: Comercial */}
      {activeTab === 'comercial' && commerceFeatures.length > 0 && (
        <div className="cfg-tab-panel">
          <form onSubmit={handleSaveCommerceFeatures}>
            <div className="cfg-card" style={{ marginBottom: '1rem' }}>
              <h4 className="cfg-card-title">{UI_LABELS.commerceHeader}</h4>
              <div className="cfg-toggle-list">
                {commerceFeatures.map((row) => (
                  <div key={row.feature_code} className="cfg-toggle-row" title={row.feature_code}>
                    <div className="cfg-toggle-row__info">
                      <span className="cfg-toggle-row__name">{featureRowLabel(row)}</span>
                      <span className={verticalSourceBadgeClass(row.vertical_source)}>
                        {verticalSourceLabel(row.vertical_source)}
                      </span>
                    </div>
                    <label className="cfg-switch">
                      <input
                        type="checkbox"
                        checked={commerceFeaturesForm[row.feature_code] ?? false}
                        onChange={(e) =>
                          setCommerceFeaturesForm((prev) => ({ ...prev, [row.feature_code]: e.target.checked }))
                        }
                      />
                      <span className="cfg-switch__slider" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
            {(commerceFeaturesForm.SALES_TAX_BRIDGE ?? false) && (
              <div className="cfg-card" style={{ marginBottom: '1rem' }}>
                <h4 className="cfg-card-title">Puente tributario SUNAT</h4>
                <div className="grid-form">
                  <div className="tax-bridge-send-mode wide">
                    <span className="tax-bridge-send-mode__label">{UI_LABELS.taxBridgeSendMode}</span>
                    <label className="tax-bridge-send-mode__switch">
                      <input
                        type="checkbox"
                        checked={Boolean(taxBridgeForm.auto_send_on_issue)}
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_send_on_issue: e.target.checked }))}
                      />
                      <span>{taxBridgeForm.auto_send_on_issue ? UI_LABELS.autoSend : UI_LABELS.manualSend}</span>
                    </label>
                    <small className="tax-bridge-send-mode__hint">
                      {taxBridgeForm.auto_send_on_issue ? UI_LABELS.autoSendHint : UI_LABELS.manualSendHint}
                    </small>
                  </div>
                  <div className="tax-bridge-send-mode wide" style={{ background: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--card)' : '#fef2f2', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="tax-bridge-send-mode__label" style={{ fontWeight: 700 }}>
                        {UI_LABELS.autoReconciliation}
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={taxBridgeForm.auto_reconcile_enabled !== false}
                          onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auto_reconcile_enabled: e.target.checked }))}
                        />
                        <span style={{ fontWeight: 600, color: taxBridgeForm.auto_reconcile_enabled !== false ? 'var(--ok, #16a34a)' : '#dc2626' }}>
                          {taxBridgeForm.auto_reconcile_enabled !== false ? UI_LABELS.activeStatus : UI_LABELS.disabledStatus}
                        </span>
                      </label>
                    </div>
                    <small style={{ color: 'var(--ink-soft)', display: 'block', marginBottom: 10 }}>
                      {taxBridgeForm.auto_reconcile_enabled !== false
                        ? UI_LABELS.autoReconciliationEnabled
                        : UI_LABELS.autoReconciliationDisabled}
                    </small>
                    {taxBridgeForm.auto_reconcile_enabled !== false && (
                      <>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                            {UI_LABELS.maxDocsPerCycle} <strong>{taxBridgeForm.reconcile_batch_size ?? 20}</strong>
                            {' '}<span style={{ color: 'var(--ink-soft)', fontSize: '0.75rem' }}>{UI_LABELS.maxDocsRange}</span>
                          </span>
                          <input
                            type="range"
                            min={5}
                            max={50}
                            step={5}
                            value={taxBridgeForm.reconcile_batch_size ?? 20}
                            onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, reconcile_batch_size: Number(e.target.value) }))}
                            style={{ width: '100%', accentColor: 'var(--primary, #2563eb)' }}
                          />
                          <small style={{ color: 'var(--ink-soft)' }}>{UI_LABELS.batchSizeHint}</small>
                        </label>
                        {reconcileStats && (
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                            <div style={{ background: reconcileStats.pending_reconcile_count > 0 ? '#fef9c3' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.pending_reconcile_count > 0 ? '#92400e' : '#15803d' }}>{reconcileStats.pending_reconcile_count}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>{UI_LABELS.inQueue}</div>
                            </div>
                            <div style={{ background: reconcileStats.unsent_count > 0 ? '#fff7ed' : '#f0fdf4', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90, textAlign: 'center' }}>
                              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: reconcileStats.unsent_count > 0 ? '#9a3412' : '#15803d' }}>{reconcileStats.unsent_count}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>{UI_LABELS.notSent}</div>
                            </div>
                            {reconcileStats.next_reconcile_at && (
                              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 160 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)' }}>{UI_LABELS.nextRetry}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                                  {new Date(reconcileStats.next_reconcile_at).toLocaleString('es-PE', { hour12: false })}
                                </div>
                              </div>
                            )}
                            {reconcileStats.pending_reconcile_count === 0 && reconcileStats.unsent_count === 0 && (
                              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px', flex: 1, color: '#15803d', fontSize: '0.8rem', fontWeight: 600 }}>
                                {UI_LABELS.allClear}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <label>
                    {UI_LABELS.bridgeMode}
                    <select
                      value={taxBridgeForm.bridge_mode ?? 'PRODUCTION'}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, bridge_mode: e.target.value === 'BETA' ? 'BETA' : 'PRODUCTION' }))}
                    >
                      <option value="PRODUCTION">{UI_LABELS.production}</option>
                      <option value="BETA">{UI_LABELS.beta}</option>
                    </select>
                  </label>
                  <label>
                    {UI_LABELS.productionUrl}
                    <input
                      value={taxBridgeForm.production_url ?? ''}
                      placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNAT/index.php/Sunat"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, production_url: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.betaUrl}
                    <input
                      value={taxBridgeForm.beta_url ?? ''}
                      placeholder="https://mundosoftperu.com/MUNDOSOFTPERUSUNATBETA/index.php/Sunat"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, beta_url: e.target.value }))}
                    />
                  </label>
                  <p className="tax-bridge-send-mode__hint">{UI_LABELS.urlHint}</p>
                  <label>
                    {UI_LABELS.timeout}
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={taxBridgeForm.timeout_seconds ?? 15}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, timeout_seconds: Number(e.target.value || 15) }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.authScheme}
                    <select
                      value={taxBridgeForm.auth_scheme ?? 'none'}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, auth_scheme: e.target.value === 'bearer' ? 'bearer' : 'none' }))}
                    >
                      <option value="none">{UI_LABELS.noToken}</option>
                      <option value="bearer">{UI_LABELS.bearerToken}</option>
                    </select>
                  </label>
                  <label>
                    {UI_LABELS.tokenLabel}
                    <input
                      value={taxBridgeForm.token ?? ''}
                      placeholder="Bearer token"
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, token: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.solUser}
                    <input
                      value={taxBridgeForm.sol_user ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_user: e.target.value }))}
                    />
                  </label>
                  <label>
                    {UI_LABELS.solPassword}
                    <input
                      type="password"
                      value={taxBridgeForm.sol_pass ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, sol_pass: e.target.value }))}
                    />
                  </label>
                  {branchId ? (
                    <label>
                      {UI_LABELS.localCodeBranch}
                      <input
                        maxLength={4}
                        value={taxBridgeForm.codigolocal ?? ''}
                        placeholder="0000"
                        onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, codigolocal: e.target.value }))}
                      />
                    </label>
                  ) : null}
                  <label>
                    {UI_LABELS.pseSend}
                    <input
                      value={taxBridgeForm.envio_pse ?? ''}
                      onChange={(e) => setTaxBridgeForm((prev) => ({ ...prev, envio_pse: e.target.value }))}
                    />
                  </label>
                  {branchId ? (
                    <p className="tax-bridge-send-mode__hint wide">{UI_LABELS.branchLocalDescription}</p>
                  ) : null}
                </div>
              </div>
            )}
            <button type="submit" disabled={loading} style={{ marginTop: '10px' }}>
              {UI_LABELS.saveFeatures}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
'@

$newContent = $before + "`n" + $newReturn
[System.IO.File]::WriteAllText($file, $newContent, [System.Text.Encoding]::UTF8)
Write-Host "Done. New file length: $($newContent.Length) chars"
