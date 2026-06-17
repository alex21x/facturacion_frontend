import { useEffect, useMemo, useState } from 'react';
import {
  createCustomerPayment,
  createSupplierPayment,
  deleteCustomerPayment,
  deleteSupplierPayment,
  fetchCustomerCreditDocuments,
  fetchCustomerPaymentMethods,
  fetchCustomerPayments,
  fetchPaymentTicketHtml,
  fetchSupplierCreditDocuments,
  fetchSupplierPaymentMethods,
  fetchSupplierPayments,
  updateCustomerPayment,
  updateSupplierPayment,
} from '../api';
import { nowLimaIso } from '../../../shared/utils/lima';
import type {
  CreditDocumentPayment,
  CreditDocumentRow,
  CreditPaymentsDetail,
  PaymentMethodOption,
} from '../types';

type CreditPaymentsMode = 'CUSTOMER' | 'SUPPLIER';

type CreditPaymentsViewProps = {
  accessToken: string;
  branchId: number | null;
  mode: CreditPaymentsMode;
};

type PaymentFormState = {
  id: number | null;
  payment_method_id: number | null;
  amount: string;
  status: 'PAID' | 'PENDING' | 'CANCELED';
  paid_at: string;
  due_at: string;
  notes: string;
};

function createEmptyForm(): PaymentFormState {
  return {
    id: null,
    payment_method_id: null,
    amount: '',
    status: 'PAID',
    paid_at: nowLimaIso().slice(0, 16),
    due_at: '',
    notes: '',
  };
}

const EMPTY_FORM: PaymentFormState = {
  id: null,
  payment_method_id: null,
  amount: '',
  status: 'PAID',
  paid_at: nowLimaIso().slice(0, 16),
  due_at: '',
  notes: '',
};

function toInputDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function statusLabel(status: string): string {
  return status === 'CANCELED' ? 'Cancelado' : 'Pendiente';
}

function documentLabel(row: Pick<CreditDocumentRow, 'document_kind' | 'document_kind_label'>): string {
  return row.document_kind_label?.trim() || row.document_kind;
}

export function CreditPaymentsView({ accessToken, branchId, mode }: CreditPaymentsViewProps) {
  const [rows, setRows] = useState<CreditDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CANCELED'>('ALL');

  const [selectedDocument, setSelectedDocument] = useState<CreditDocumentRow | null>(null);
  const [detail, setDetail] = useState<CreditPaymentsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [form, setForm] = useState<PaymentFormState>(EMPTY_FORM);
  const [savingPayment, setSavingPayment] = useState(false);
  const [viewPayment, setViewPayment] = useState<CreditDocumentPayment | null>(null);

  const title = mode === 'CUSTOMER' ? 'Cobros de Clientes' : 'Pagos a Proveedores';
  const counterpartLabel = mode === 'CUSTOMER' ? 'Cliente' : 'Proveedor';

  async function loadDocuments(currentPage = page): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        perPage,
        branchId,
        search,
        paymentStatus: statusFilter === 'ALL' ? null : statusFilter,
      };

      const result = mode === 'CUSTOMER'
        ? await fetchCustomerCreditDocuments(accessToken, params)
        : await fetchSupplierCreditDocuments(accessToken, params);

      setRows(result.data ?? []);
      setLastPage(Math.max(1, Number(result.meta?.last_page ?? 1)));
      setTotal(Number(result.meta?.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el listado');
    } finally {
      setLoading(false);
    }
  }

  async function loadMethods(): Promise<void> {
    try {
      const methods = mode === 'CUSTOMER'
        ? await fetchCustomerPaymentMethods(accessToken, branchId)
        : await fetchSupplierPaymentMethods(accessToken);
      setPaymentMethods(methods);
    } catch {
      setPaymentMethods([]);
    }
  }

  useEffect(() => {
    void loadDocuments(1);
    void loadMethods();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, branchId]);

  useEffect(() => {
    void loadDocuments(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function openPayments(document: CreditDocumentRow): Promise<void> {
    setSelectedDocument(document);
    setDetail(null);
    setDetailLoading(true);
    setForm(createEmptyForm());
    try {
      const result = mode === 'CUSTOMER'
        ? await fetchCustomerPayments(accessToken, document.id)
        : await fetchSupplierPayments(accessToken, document.id);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar pagos del comprobante');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeModal(): void {
    setSelectedDocument(null);
    setDetail(null);
    setViewPayment(null);
    setForm(createEmptyForm());
  }

  function editPayment(payment: CreditDocumentPayment): void {
    setForm({
      id: payment.id,
      payment_method_id: payment.payment_method_id,
      amount: String(payment.amount ?? ''),
      status: ['PAID', 'PENDING', 'CANCELED'].includes(payment.status) ? (payment.status as 'PAID' | 'PENDING' | 'CANCELED') : 'PAID',
      paid_at: toInputDateTime(payment.paid_at),
      due_at: toInputDateTime(payment.due_at),
      notes: payment.notes ?? '',
    });
  }

  function resetForm(): void {
    setForm(createEmptyForm());
  }

  async function submitPayment(): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    const payload = {
      payment_method_id: form.payment_method_id,
      amount: Number(form.amount),
      status: form.status,
      paid_at: form.paid_at || null,
      due_at: form.due_at || null,
      notes: form.notes || null,
    };

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      setError('Monto invalido');
      return;
    }

    setSavingPayment(true);
    setError(null);
    try {
      let nextDetail: CreditPaymentsDetail;
      if (mode === 'CUSTOMER') {
        nextDetail = form.id
          ? await updateCustomerPayment(accessToken, selectedDocument.id, form.id, payload)
          : await createCustomerPayment(accessToken, selectedDocument.id, payload);
      } else {
        nextDetail = form.id
          ? await updateSupplierPayment(accessToken, selectedDocument.id, form.id, payload)
          : await createSupplierPayment(accessToken, selectedDocument.id, payload);
      }
      setDetail(nextDetail);
      setForm(createEmptyForm());
      await loadDocuments(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar pago');
    } finally {
      setSavingPayment(false);
    }
  }

  async function removePayment(paymentId: number): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    setSavingPayment(true);
    setError(null);
    try {
      const nextDetail = mode === 'CUSTOMER'
        ? await deleteCustomerPayment(accessToken, selectedDocument.id, paymentId)
        : await deleteSupplierPayment(accessToken, selectedDocument.id, paymentId);
      setDetail(nextDetail);
      setViewPayment((prev) => (prev?.id === paymentId ? null : prev));
      await loadDocuments(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar pago');
    } finally {
      setSavingPayment(false);
    }
  }

  async function printTicket(paymentId: number): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    try {
      const endpoint = mode === 'CUSTOMER'
        ? `/api/sales/credit-payments/documents/${selectedDocument.id}/payments/${paymentId}/ticket`
        : `/api/purchases/credit-payments/documents/${selectedDocument.id}/payments/${paymentId}/ticket`;
      const html = await fetchPaymentTicketHtml(accessToken, endpoint);
      const popup = window.open('', '_blank', 'width=420,height=780');
      if (!popup) {
        setError('No se pudo abrir la ventana de impresion.');
        return;
      }
      const wrappedHtml = `<!doctype html><html><head><meta charset="UTF-8"><title>Ticket de pago</title><style>html,body{margin:0;padding:0;background:#fff;height:100%;}iframe{border:0;width:100%;height:100vh;display:block;}</style></head><body><iframe id="ticket-frame" srcdoc="${html.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" onload="setTimeout(() => { try { window.focus(); window.print(); } catch (e) {} }, 250);"></iframe></body></html>`;
      popup.document.open();
      popup.document.write(wrappedHtml);
      popup.document.close();
      popup.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo imprimir ticket');
    }
  }

  const paymentStatusBadge = useMemo(() => {
    return (status: string) => (
      <span className={`credit-payments-status ${status === 'CANCELED' ? 'is-canceled' : 'is-pending'}`}>
        {statusLabel(status)}
      </span>
    );
  }, []);

  const supplierModuleDisabled = mode === 'SUPPLIER' && detail?.payments_module_enabled === false;

  return (
    <section className="module-panel credit-payments-panel">
      <header className="module-header-row">
        <div className="credit-payments-hero">
          <p className="credit-payments-kicker">Control de cobros y pagos al credito</p>
          <h3>{title}</h3>
          <p>Listado de comprobantes al credito con control de saldo, pagos manuales y ticket de impresión.</p>
        </div>
      </header>

      <div className="credit-payments-filters">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Buscar por ${counterpartLabel.toLowerCase()} o comprobante...`}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'PENDING' | 'CANCELED')}>
          <option value="ALL">Todos</option>
          <option value="PENDING">Pendiente</option>
          <option value="CANCELED">Cancelado</option>
        </select>
        <button type="button" className="credit-button credit-button--primary" onClick={() => { setPage(1); void loadDocuments(1); }}>
          Buscar
        </button>
      </div>

      {error && <p className="notice" style={{ color: '#a40000' }}>{error}</p>}

      <div className="table-shell">
        <table className="sales-table credit-payments-table">
          <thead>
            <tr>
              <th>Comprobante</th>
              <th>{counterpartLabel}</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7}>Sin comprobantes en este filtro.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className={row.payment_status === 'CANCELED' ? 'credit-row-canceled' : 'credit-row-pending'}>
                <td>{documentLabel(row)} {row.series}-{row.number}</td>
                <td>{row.counterpart_name}</td>
                <td>S/ {row.total_amount.toFixed(2)}</td>
                <td>S/ {row.paid_amount.toFixed(2)}</td>
                <td>S/ {row.balance_amount.toFixed(2)}</td>
                <td>{paymentStatusBadge(row.payment_status)}</td>
                <td>
                  <button type="button" onClick={() => void openPayments(row)}>Agregar Pago</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="credit-payments-pagination">
        <span>Total: {total}</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Anterior</button>
        <span>Pagina {page} / {lastPage}</span>
        <button type="button" disabled={page >= lastPage} onClick={() => setPage((prev) => Math.min(lastPage, prev + 1))}>Siguiente</button>
      </footer>

      {selectedDocument && (
        <div className="credit-modal-backdrop" role="dialog" aria-modal="true">
          <div className="credit-modal-card">
            <header className="credit-modal-head">
              <h4>{mode === 'CUSTOMER' ? 'Pagos del Cliente' : 'Pagos al Proveedor'}: {documentLabel(selectedDocument)} {selectedDocument.series}-{selectedDocument.number}</h4>
              <button type="button" onClick={closeModal}>Cerrar</button>
            </header>

            {detailLoading && <p className="notice">Cargando pagos...</p>}

            {detail && (
              <>
                <div className="credit-summary-grid">
                  <article>
                    <small>Total</small>
                    <strong>S/ {detail.summary.total_amount.toFixed(2)}</strong>
                  </article>
                  <article>
                    <small>Pagado</small>
                    <strong>S/ {detail.summary.paid_amount.toFixed(2)}</strong>
                  </article>
                  <article>
                    <small>Saldo</small>
                    <strong>S/ {detail.summary.balance_amount.toFixed(2)}</strong>
                  </article>
                  <article>
                    <small>Estado</small>
                    <strong>{statusLabel(detail.summary.payment_status)}</strong>
                  </article>
                </div>

                <div className="credit-document-chiprow">
                  <span className="credit-document-chip">{documentLabel(selectedDocument)} {selectedDocument.series}-{selectedDocument.number}</span>
                  <span className="credit-document-chip credit-document-chip--soft">{selectedDocument.counterpart_name}</span>
                  <span className={`credit-document-chip ${detail.summary.payment_status === 'CANCELED' ? 'credit-document-chip--ok' : 'credit-document-chip--warn'}`}>
                    {detail.summary.payment_status === 'CANCELED' ? 'Cancelado' : 'Pendiente'}
                  </span>
                </div>

                {supplierModuleDisabled && (
                  <p className="notice" style={{ color: '#92400e', marginTop: 0 }}>
                    {detail.payments_module_message ?? 'La tabla de pagos a proveedores no existe en esta base. Solo se muestra el estado del comprobante.'}
                  </p>
                )}

                <div className="credit-form-grid">
                  <select
                    value={form.payment_method_id ?? ''}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, payment_method_id: event.target.value ? Number(event.target.value) : null }))}
                  >
                    <option value="">Metodo de pago</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>{method.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Monto"
                    value={form.amount}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                  <select
                    value={form.status}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as 'PAID' | 'PENDING' | 'CANCELED' }))}
                  >
                    <option value="PAID">Pagado</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="CANCELED">Cancelado</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={form.paid_at}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, paid_at: event.target.value }))}
                  />
                  <input
                    type="datetime-local"
                    value={form.due_at}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, due_at: event.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="Notas"
                    value={form.notes}
                    disabled={supplierModuleDisabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>

                <div className="credit-form-actions">
                  <button type="button" className="credit-button credit-button--primary" disabled={savingPayment || supplierModuleDisabled} onClick={() => void submitPayment()}>
                    {form.id ? 'Actualizar Pago' : 'Guardar Pago'}
                  </button>
                  <button type="button" className="credit-button credit-button--secondary" disabled={savingPayment || supplierModuleDisabled} onClick={resetForm}>Limpiar</button>
                </div>

                <div className="table-shell">
                  <table className="sales-table credit-payments-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Metodo</th>
                        <th>Monto</th>
                        <th>Estado</th>
                        <th>Fecha Pago</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.length === 0 && (
                        <tr><td colSpan={6}>Sin pagos registrados.</td></tr>
                      )}
                      {detail.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.id}</td>
                          <td>{payment.payment_method_name}</td>
                          <td>S/ {payment.amount.toFixed(2)}</td>
                          <td>{payment.status}</td>
                          <td>{payment.paid_at ?? '-'}</td>
                          <td>
                            <button type="button" disabled={supplierModuleDisabled} onClick={() => editPayment(payment)}>Editar</button>
                            <button type="button" onClick={() => setViewPayment(payment)}>Ver detalle</button>
                            <button type="button" disabled={supplierModuleDisabled} onClick={() => void removePayment(payment.id)}>Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {viewPayment && (
              <aside className="credit-detail-box">
                <h5>Detalle de pago #{viewPayment.id}</h5>
                <p><strong>Metodo:</strong> {viewPayment.payment_method_name}</p>
                <p><strong>Monto:</strong> S/ {viewPayment.amount.toFixed(2)}</p>
                <p><strong>Estado:</strong> {viewPayment.status}</p>
                <p><strong>Fecha pago:</strong> {viewPayment.paid_at ?? '-'}</p>
                <p><strong>Fecha vencimiento:</strong> {viewPayment.due_at ?? '-'}</p>
                <p><strong>Notas:</strong> {viewPayment.notes ?? '-'}</p>
                <button type="button" className="credit-button credit-button--print" onClick={() => void printTicket(viewPayment.id)}>Imprimir ticket</button>
              </aside>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
