import { useEffect, useState } from 'react';
import {
  fetchCompanyProfile,
  updateCompanyProfile,
  uploadCompanyCert,
  uploadCompanyLogo,
} from '../api';
import type { BankAccount, CompanyProfile } from '../types';

type CompanyConfigViewProps = {
  accessToken: string;
};

const EMPTY_BANK: BankAccount = { bank_name: '', account_number: '', currency: 'PEN', account_type: 'Corriente' };

export function CompanyConfigView({ accessToken }: CompanyConfigViewProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Campos del formulario
  const [taxId, setTaxId] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Certificado digital
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploadingCert, setUploadingCert] = useState(false);

  function populateForm(p: CompanyProfile) {
    setTaxId(p.tax_id ?? '');
    setLegalName(p.legal_name ?? '');
    setTradeName(p.trade_name ?? '');
    setAddress(p.address ?? '');
    setPhone(p.phone ?? '');
    setEmail(p.email ?? '');
    setWebsite(p.website ?? '');
    setBankAccounts(p.bank_accounts ?? []);
  }

  async function loadProfile() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const p = await fetchCompanyProfile(accessToken);
      setProfile(p);
      populateForm(p);
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cargar perfil');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setIsError(false);
    try {
      const updated = await updateCompanyProfile(accessToken, {
        tax_id: taxId || undefined,
        legal_name: legalName || undefined,
        trade_name: tradeName || undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        website: website || undefined,
        bank_accounts: bankAccounts,
      });
      setProfile(updated);
      populateForm(updated);
      setMessage('Perfil actualizado correctamente');
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo() {
    if (!logoFile) return;
    setUploadingLogo(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await uploadCompanyLogo(accessToken, logoFile);
      setMessage(res.message);
      setLogoFile(null);
      setLogoPreview(null);
      await loadProfile();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al subir logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleUploadCert() {
    if (!certFile || !certPassword) {
      setMessage('Selecciona el certificado y escribe la contrasena');
      setIsError(true);
      return;
    }
    setUploadingCert(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await uploadCompanyCert(accessToken, certFile, certPassword);
      setMessage(res.message);
      setCertFile(null);
      setCertPassword('');
      await loadProfile();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al subir certificado');
    } finally {
      setUploadingCert(false);
    }
  }

  function addBankAccount() {
    setBankAccounts((prev) => [...prev, { ...EMPTY_BANK }]);
  }

  function removeBankAccount(index: number) {
    setBankAccounts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBankAccount(index: number, field: keyof BankAccount, value: string) {
    setBankAccounts((prev) =>
      prev.map((acc, i) => (i === index ? { ...acc, [field]: value } : acc))
    );
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Configuracion de Empresa</h3>
        <button type="button" onClick={() => void loadProfile()} disabled={loading}>
          Refrescar
        </button>
      </div>

      {message && <p className={isError ? 'error-box' : 'notice'}>{message}</p>}

      {/* ── DATOS BASICOS ── */}
      <form onSubmit={(e) => void handleSaveProfile(e)}>
        <div className="form-card">
          <h4>Datos de la Empresa</h4>
          <div className="grid-form">
            <label>
              RUC / Tax ID
              <input
                type="text"
                maxLength={20}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="20123456789"
              />
            </label>
            <label>
              Razon Social
              <input
                type="text"
                maxLength={200}
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="EMPRESA SAC"
              />
            </label>
            <label>
              Nombre Comercial
              <input
                type="text"
                maxLength={200}
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder="Mi Empresa"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Direccion
              <input
                type="text"
                maxLength={500}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Principal 123, Lima"
              />
            </label>
            <label>
              Telefono
              <input
                type="text"
                maxLength={60}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+51 1 234 5678"
              />
            </label>
            <label>
              Correo electronico
              <input
                type="email"
                maxLength={200}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@empresa.com"
              />
            </label>
            <label>
              Sitio web
              <input
                type="url"
                maxLength={300}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.empresa.com"
              />
            </label>
          </div>
        </div>

        {/* ── CUENTAS BANCARIAS ── */}
        <div className="form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4>Cuentas Bancarias</h4>
            <button type="button" onClick={addBankAccount}>
              + Agregar cuenta
            </button>
          </div>

          {bankAccounts.length === 0 && (
            <p className="notice">Sin cuentas bancarias registradas.</p>
          )}

          {bankAccounts.map((acc, idx) => (
            <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.75rem', marginTop: '0.5rem' }}>
              <div className="grid-form">
                <label>
                  Banco
                  <input
                    type="text"
                    maxLength={100}
                    value={acc.bank_name}
                    onChange={(e) => updateBankAccount(idx, 'bank_name', e.target.value)}
                    placeholder="BCP, BBVA, Interbank..."
                  />
                </label>
                <label>
                  Numero de cuenta
                  <input
                    type="text"
                    maxLength={50}
                    value={acc.account_number}
                    onChange={(e) => updateBankAccount(idx, 'account_number', e.target.value)}
                    placeholder="123-4567890-0-12"
                  />
                </label>
                <label>
                  Moneda
                  <select value={acc.currency} onChange={(e) => updateBankAccount(idx, 'currency', e.target.value)}>
                    <option value="PEN">PEN - Soles</option>
                    <option value="USD">USD - Dolares</option>
                    <option value="EUR">EUR - Euros</option>
                  </select>
                </label>
                <label>
                  Tipo de cuenta
                  <select value={acc.account_type} onChange={(e) => updateBankAccount(idx, 'account_type', e.target.value)}>
                    <option value="Corriente">Corriente</option>
                    <option value="Ahorros">Ahorros</option>
                    <option value="CCI">CCI</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="danger"
                style={{ marginTop: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => removeBankAccount(idx)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        <button type="submit" disabled={saving || loading}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </form>

      {/* ── LOGO ── */}
      <div className="form-card" style={{ marginTop: '1.5rem' }}>
        <h4>Logo de la Empresa</h4>
        {profile?.logo_url && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>Logo actual:</p>
            <img
              src={profile.logo_url}
              alt="Logo empresa"
              style={{ maxHeight: 100, maxWidth: 300, border: '1px solid var(--color-border)', borderRadius: 4 }}
            />
          </div>
        )}
        {logoPreview && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>Vista previa:</p>
            <img
              src={logoPreview}
              alt="Vista previa"
              style={{ maxHeight: 100, maxWidth: 300, border: '1px dashed var(--color-border)', borderRadius: 4 }}
            />
          </div>
        )}
        <div className="grid-form">
          <label>
            Seleccionar imagen (JPG, PNG, GIF, WEBP — max 2 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleLogoChange}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleUploadLogo}
          disabled={!logoFile || uploadingLogo}
          style={{ marginTop: '0.5rem' }}
        >
          {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
        </button>
      </div>

      {/* ── CERTIFICADO DIGITAL ── */}
      <div className="form-card" style={{ marginTop: '1.5rem' }}>
        <h4>Certificado Digital</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          Estado:{' '}
          <strong style={{ color: profile?.has_cert ? 'var(--color-ok)' : undefined }}>
            {profile?.has_cert ? 'Certificado configurado' : 'Sin certificado'}
          </strong>
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
          Sube tu certificado digital (.p12 / .pfx / .pem) para firma electronica.
          La contrasena se almacena cifrada con la clave de la aplicacion.
        </p>
        <div className="grid-form">
          <label>
            Archivo del certificado (.p12, .pfx, .pem)
            <input
              type="file"
              accept=".p12,.pfx,.pem"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Contrasena del certificado
            <input
              type="password"
              value={certPassword}
              autoComplete="new-password"
              onChange={(e) => setCertPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleUploadCert}
          disabled={!certFile || !certPassword || uploadingCert}
          style={{ marginTop: '0.5rem' }}
        >
          {uploadingCert ? 'Subiendo...' : profile?.has_cert ? 'Reemplazar Certificado' : 'Subir Certificado'}
        </button>
      </div>
    </section>
  );
}
