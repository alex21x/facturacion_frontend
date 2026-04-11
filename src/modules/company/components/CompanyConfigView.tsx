import { useEffect, useState } from 'react';
import {
  fetchCompanyProfile,
  updateCompanyProfile,
  uploadCompanyCert,
  uploadCompanyLogo,
} from '../api';
import type { BankAccount, CompanyCertBridgeDebug, CompanyProfile } from '../types';

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
  const [mobilePhone, setMobilePhone] = useState('');
  const [landlinePhone, setLandlinePhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [ubigeo, setUbigeo] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [provincia, setProvincia] = useState('');
  const [distrito, setDistrito] = useState('');
  const [urbanizacion, setUrbanizacion] = useState('');
  const [sunatSecondaryUser, setSunatSecondaryUser] = useState('');
  const [sunatSecondaryPass, setSunatSecondaryPass] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Certificado digital
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certBridgeDebug, setCertBridgeDebug] = useState<CompanyCertBridgeDebug | null>(null);
  const [certBridgeResponse, setCertBridgeResponse] = useState<unknown>(null);

  function populateForm(p: CompanyProfile) {
    setTaxId(p.tax_id ?? '');
    setLegalName(p.legal_name ?? '');
    setTradeName(p.trade_name ?? '');
    setAddress(p.address ?? '');
    setPhone(p.phone ?? '');
    setMobilePhone(p.telefono_movil ?? '');
    setLandlinePhone(p.telefono_fijo ?? p.phone ?? '');
    setEmail(p.email ?? '');
    setWebsite(p.website ?? '');
    setUbigeo(p.ubigeo ?? '');
    setDepartamento(p.departamento ?? '');
    setProvincia(p.provincia ?? '');
    setDistrito(p.distrito ?? '');
    setUrbanizacion(p.urbanizacion ?? '');
    setSunatSecondaryUser(p.sunat_secondary_user ?? '');
    setSunatSecondaryPass(p.sunat_secondary_pass ?? '');
    setClientId(p.client_id ?? '');
    setClientSecret(p.client_secret ?? '');
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

    if (certFile && !certPassword) {
      setIsError(true);
      setMessage('Si seleccionas certificado, debes ingresar la contrasena para guardarlo.');
      return;
    }

    setSaving(true);
    setMessage('');
    setIsError(false);
    setCertBridgeDebug(null);
    setCertBridgeResponse(null);

    try {
      const updated = await updateCompanyProfile(accessToken, {
        tax_id: taxId || undefined,
        legal_name: legalName || undefined,
        trade_name: tradeName || undefined,
        address: address || undefined,
        phone: phone || undefined,
        telefono_movil: mobilePhone || undefined,
        telefono_fijo: landlinePhone || undefined,
        email: email || undefined,
        website: website || undefined,
        ubigeo: ubigeo || undefined,
        departamento: departamento || undefined,
        provincia: provincia || undefined,
        distrito: distrito || undefined,
        urbanizacion: urbanizacion || undefined,
        sunat_secondary_user: sunatSecondaryUser || undefined,
        sunat_secondary_pass: sunatSecondaryPass || undefined,
        client_id: clientId || undefined,
        client_secret: clientSecret || undefined,
        bank_accounts: bankAccounts,
      });

      setProfile(updated);
      populateForm(updated);

      if (certFile) {
        setUploadingCert(true);
        try {
          const certRes = await uploadCompanyCert(accessToken, certFile, certPassword);
          setCertBridgeDebug(certRes.bridge_debug ?? null);
          setCertBridgeResponse(certRes.bridge_response ?? null);
          setCertFile(null);
          setCertPassword('');
          setMessage(`Perfil actualizado. ${certRes.message}`);
          await loadProfile();
        } catch (certError) {
          setIsError(true);
          setMessage(
            `Perfil actualizado en BD, pero fallo el registro del certificado en puente: ${
              certError instanceof Error ? certError.message : 'Error al subir certificado'
            }`
          );
        } finally {
          setUploadingCert(false);
        }
      } else {
        setMessage('Perfil actualizado correctamente');
      }
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
              Telefono principal
              <input
                type="text"
                maxLength={60}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+51 1 234 5678"
              />
            </label>
            <label>
              Telefono movil
              <input
                type="text"
                maxLength={60}
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                placeholder="+51 999 888 777"
              />
            </label>
            <label>
              Telefono fijo
              <input
                type="text"
                maxLength={60}
                value={landlinePhone}
                onChange={(e) => setLandlinePhone(e.target.value)}
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

        {/* ── UBICACION ── */}
        <div className="form-card">
          <h4>Ubicacion Geográfica</h4>
          <div className="grid-form">
            <label>
              UBIGEO (6 dígitos)
              <input
                type="text"
                maxLength={6}
                value={ubigeo}
                onChange={(e) => setUbigeo(e.target.value)}
                placeholder="150131"
              />
            </label>
            <label>
              Departamento
              <input
                type="text"
                maxLength={100}
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                placeholder="LIMA"
              />
            </label>
            <label>
              Provincia
              <input
                type="text"
                maxLength={100}
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                placeholder="LIMA"
              />
            </label>
            <label>
              Distrito
              <input
                type="text"
                maxLength={100}
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                placeholder="SAN ISIDRO"
              />
            </label>
            <label>
              Urbanizacion
              <input
                type="text"
                maxLength={100}
                value={urbanizacion}
                onChange={(e) => setUrbanizacion(e.target.value)}
                placeholder="ORRANTIA"
              />
            </label>
          </div>
        </div>

        <div className="form-card">
          <h4>Credenciales SUNAT Secundarias</h4>
          <div className="grid-form">
            <label>
              Usuario secundario SUNAT
              <input
                type="text"
                maxLength={100}
                value={sunatSecondaryUser}
                onChange={(e) => setSunatSecondaryUser(e.target.value)}
                placeholder="MODDATOS"
              />
            </label>
            <label>
              Password secundario SUNAT
              <input
                type="password"
                maxLength={100}
                value={sunatSecondaryPass}
                onChange={(e) => setSunatSecondaryPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>

        <div className="form-card">
          <h4>Credenciales API GRE</h4>
          <div className="grid-form">
            <label>
              Client ID
              <input
                type="text"
                maxLength={200}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Ingresa client_id"
              />
            </label>
            <label>
              Client Secret
              <input
                type="password"
                maxLength={500}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Ingresa client_secret"
                autoComplete="new-password"
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

        <div className="form-card" style={{ marginTop: '1rem' }}>
          <h4 style={{ margin: 0 }}>Certificado Digital</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            Estado:{' '}
            <strong style={{ color: profile?.has_cert ? 'var(--color-ok)' : undefined }}>
              {profile?.has_cert ? 'Certificado configurado' : 'Sin certificado'}
            </strong>
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Este bloque usa el mismo boton Guardar Cambios.
            Si seleccionas certificado: guarda en BD y luego registra en el puente.
            Si no seleccionas certificado: solo guarda en BD.
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

          {certBridgeDebug && (
            <div style={{ marginTop: '1rem' }}>
              <h5 style={{ marginBottom: '0.25rem' }}>Destino del puente</h5>
              <div className="notice" style={{ overflowX: 'auto' }}>
                {certBridgeDebug.method} {certBridgeDebug.endpoint}
              </div>

              <h5 style={{ marginTop: '0.75rem', marginBottom: '0.25rem' }}>Payload enviado</h5>
              <pre style={{ margin: 0, padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: '#f8fafc', overflowX: 'auto', fontSize: '0.8rem' }}>
                {JSON.stringify(certBridgeDebug.payload, null, 2)}
              </pre>

              {certBridgeResponse !== null && (
                <>
                  <h5 style={{ marginTop: '0.75rem', marginBottom: '0.25rem' }}>Respuesta del puente</h5>
                  <pre style={{ margin: 0, padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, background: '#f8fafc', overflowX: 'auto', fontSize: '0.8rem' }}>
                    {typeof certBridgeResponse === 'string'
                      ? certBridgeResponse
                      : JSON.stringify(certBridgeResponse, null, 2)}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>

        <button type="submit" disabled={saving || loading || uploadingCert}>
          <span style={{ display: 'inline-block', padding: '0.5rem 1.2rem' }}>
            {saving || uploadingCert ? 'Guardando...' : 'Guardar Cambios'}
          </span>
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

    </section>
  );
}
