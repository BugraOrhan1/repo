import React, { useEffect, useMemo, useState } from 'react';

const defaultApiBase = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';
const API_BASE = (process.env.REACT_APP_BACKEND_URL || defaultApiBase).replace(/\/$/, '');
const TOKEN_KEY = 'fct_token';

const emptyVehicleForm = {
  brand: '',
  model: '',
  generation: '',
  engine: '',
  engineHp: '',
  engineKw: '',
  year: '',
  gearbox: '',
  licensePlate: '',
  vin: '',
  octane: '',
  toolType: '',
  readMethod: '',
  hardwareNumber: '',
  softwareNumber: '',
  ecu: '',
  tuningType: '',
  modifiedParts: '',
  modifiedPartsDetails: '',
  timeFrame: '',
  note: '',
};

const statusOrder = ['pending', 'in_progress', 'completed', 'rejected'];

function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

function formatDate(value) {
  if (!value) return 'Onbekend';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusLabel(status) {
  const labels = {
    pending: 'In afwachting',
    in_progress: 'In behandeling',
    completed: 'Voltooid',
    rejected: 'Afgewezen',
  };
  return labels[String(status || 'pending')] || String(status || 'Onbekend').replace(/_/g, ' ');
}

async function apiFetch(path, { token, method = 'GET', body, isForm = false } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' ? payload.detail || payload.message || 'Verzoek mislukt' : payload || 'Verzoek mislukt';
    throw new Error(message);
  }

  return payload;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    country: '',
    vatNumber: '',
  });
  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [fileDetail, setFileDetail] = useState(null);
  const [fileMessages, setFileMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [packages, setPackages] = useState([]);
  const [creditsTransactions, setCreditsTransactions] = useState([]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [generationOptions, setGenerationOptions] = useState([]);
  const [engineOptions, setEngineOptions] = useState([]);
  const [ecuOptions, setEcuOptions] = useState([]);
  const [toolOptions, setToolOptions] = useState(null);
  const [tuningOptions, setTuningOptions] = useState([]);
  const [additionalOptions, setAdditionalOptions] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminFiles, setAdminFiles] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminSelectedFiles, setAdminSelectedFiles] = useState({});
  const [purchaseId, setPurchaseId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plateLookupMessage, setPlateLookupMessage] = useState('');
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);

  const selectedTuning = useMemo(
    () => tuningOptions.find((item) => item.id === vehicleForm.tuningType),
    [tuningOptions, vehicleForm.tuningType]
  );

  const selectedAdditional = useMemo(
    () => additionalOptions.filter((item) => selectedOptions.includes(item.id)),
    [additionalOptions, selectedOptions]
  );

  const uploadCredits = useMemo(() => {
    const base = selectedTuning?.credits ?? 0;
    const extra = selectedAdditional.reduce((sum, item) => sum + (Number(item.credits) || 0), 0);
    return Number((base + extra).toFixed(2));
  }, [selectedTuning, selectedAdditional]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const unreadByFileId = useMemo(() => {
    return notifications.reduce((accumulator, item) => {
      if (!item.read && item.fileId) {
        accumulator[item.fileId] = (accumulator[item.fileId] || 0) + 1;
      }
      return accumulator;
    }, {});
  }, [notifications]);

  const displayedFiles = user?.is_admin ? (adminFiles.length ? adminFiles : files) : files;

  const recentOrders = useMemo(() => {
    return [...displayedFiles]
      .sort((left, right) => new Date(right.uploadedAt || 0) - new Date(left.uploadedAt || 0))
      .slice(0, 6);
  }, [displayedFiles]);

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, token || '');
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setUser(null);
      setFiles([]);
      setNotifications([]);
      return;
    }

    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      try {
        const [me, fileList, noteList, packageList, transactionList, tuningList, additionalList, tools, brands] = await Promise.all([
          apiFetch('/api/auth/me', { token }),
          apiFetch('/api/files', { token }),
          apiFetch('/api/notifications', { token }),
          apiFetch('/api/credits/packages', { token }),
          apiFetch('/api/credits/transactions', { token }),
          apiFetch('/api/options/tuning-types', { token }),
          apiFetch('/api/options/additional', { token }),
          apiFetch('/api/options/tools', { token }),
          apiFetch('/api/vehicles/brands', { token }),
        ]);

        if (cancelled) return;

        setUser(me);
        setFiles(fileList);
        setNotifications(noteList);
        setPackages(packageList);
        setCreditsTransactions(transactionList);
        setTuningOptions(tuningList);
        setAdditionalOptions(additionalList);
        setToolOptions(tools);
        setBrandOptions(brands);
        setPurchaseId(packageList[0]?.id || '');
        setSelectedFileId((current) => current || fileList[0]?.id || '');
      } catch (error) {
        if (!cancelled) {
          setToast(error.message);
          handleLogout();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedFileId) {
      setFileDetail(null);
      setFileMessages([]);
      return;
    }

    let cancelled = false;

    async function loadFile() {
      try {
        const [detail, messages] = await Promise.all([
          apiFetch(`/api/files/${selectedFileId}`, { token }),
          apiFetch(`/api/files/${selectedFileId}/messages`, { token }),
        ]);

        if (!cancelled) {
          setFileDetail(detail);
          setFileMessages(messages);
        }
      } catch (error) {
        if (!cancelled) setToast(error.message);
      }
    }

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [selectedFileId, token]);

  useEffect(() => {
    if (!token || !user?.is_admin) return;

    let cancelled = false;

    async function loadAdminData() {
      try {
        const [users, adminFileList, stats] = await Promise.all([
          apiFetch('/api/admin/users', { token }),
          apiFetch('/api/admin/files?status_filter=all', { token }),
          apiFetch('/api/admin/stats', { token }),
        ]);

        if (!cancelled) {
          setAdminUsers(users);
          setAdminFiles(adminFileList);
          setAdminStats(stats);
          setSelectedFileId((current) => current || adminFileList[0]?.id || '');
        }
      } catch (error) {
        if (!cancelled) setToast(error.message);
      }
    }

    loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [token, user?.is_admin]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const brand = vehicleForm.brand;
    const model = vehicleForm.model;
    const generation = vehicleForm.generation;
    const engine = vehicleForm.engine;
    const parts = [brand, model, generation, engine].filter(Boolean);
    setVehicleLabel(parts.length ? parts.join(' · ') : '');
  }, [vehicleForm]);

  function normalizePlate(value) {
    return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  async function lookupLicensePlate() {
    const normalized = normalizePlate(vehicleForm.licensePlate);
    if (normalized.length < 5) {
      setPlateLookupMessage('Kenteken is te kort. Gebruik minimaal 5 tekens zonder streepjes.');
      return;
    }

    setPlateLookupLoading(true);
    try {
      const result = await apiFetch(`/api/vehicles/lookup-license-plate?plate=${encodeURIComponent(normalized)}`, { token });
      await applyPlateLookup(result);
    } catch (error) {
      setPlateLookupMessage(error.message || 'Kenteken kon niet worden opgehaald. Vul merk/model handmatig in.');
    } finally {
      setPlateLookupLoading(false);
    }
  }

  async function applyPlateLookup(result) {
    if (!result?.found) {
      setPlateLookupMessage('Geen automatische match gevonden. Handmatig selecteren blijft mogelijk.');
      return;
    }

    setVehicleForm((current) => ({
      ...current,
      brand: result.brand || '',
      model: result.model || '',
      generation: result.generation || '',
      engine: result.engine || '',
      engineHp: result.engineHp ? String(result.engineHp) : current.engineHp,
      engineKw: result.engineKw ? String(result.engineKw) : current.engineKw,
      ecu: result.ecu || '',
    }));

    setModelOptions(result.models || []);
    setGenerationOptions(result.generations || []);
    setEngineOptions(result.engines || []);
    setEcuOptions(result.ecus || []);
    setPlateLookupMessage(`Automatisch herkend: ${[result.brand, result.model, result.generation, result.engine].filter(Boolean).join(' · ')}`);
  }

  // Auto lookup removed: lookup only triggers on explicit button press

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await apiFetch('/api/auth/login', { method: 'POST', body: authForm });
      setToken(result.token);
      setUser(result.user);
      setToast('Welcome back.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await apiFetch('/api/auth/register', { method: 'POST', body: authForm });
      setToken(result.token);
      setUser(result.user);
      setToast('Account created.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setFiles([]);
    setFileDetail(null);
    setFileMessages([]);
    setNotifications([]);
    setCreditsTransactions([]);
    setAdminUsers([]);
    setAdminFiles([]);
    setAdminStats(null);
    setAdminSelectedFiles({});
    setSelectedFileId('');
    setToast('Logged out.');
  }

  async function refreshCurrentView() {
    if (!token) return;
    try {
      const [fileList, noteList, transactionList] = await Promise.all([
        apiFetch('/api/files', { token }),
        apiFetch('/api/notifications', { token }),
        apiFetch('/api/credits/transactions', { token }),
      ]);
      setFiles(fileList);
      setNotifications(noteList);
      setCreditsTransactions(transactionList);
      if (user?.is_admin) {
        const [users, adminFileList, stats] = await Promise.all([
          apiFetch('/api/admin/users', { token }),
          apiFetch('/api/admin/files?status_filter=all', { token }),
          apiFetch('/api/admin/stats', { token }),
        ]);
        setAdminUsers(users);
        setAdminFiles(adminFileList);
        setAdminStats(stats);
      }
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    const requiredFields = [
      { value: uploadFile, message: 'Selecteer eerst een bestand.' },
      { value: vehicleForm.brand, message: 'Kies een merk.' },
      { value: vehicleForm.model, message: 'Kies een model.' },
      { value: vehicleForm.engine, message: 'Kies een motor.' },
      { value: vehicleForm.tuningType, message: 'Kies een tuningtype.' },
    ];
    const missingField = requiredFields.find((field) => !field.value);
    if (missingField) {
      setToast(missingField.message);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('vehicle', vehicleLabel || uploadFile.name);
      formData.append('ecu', vehicleForm.ecu || ecuOptions[0] || 'Overig');
      formData.append('tuningOptions', selectedOptions.join(','));
      formData.append('credits', String(uploadCredits));
      formData.append('note', vehicleForm.note || '');
      Object.entries(vehicleForm).forEach(([key, value]) => {
        formData.append(key, value ?? '');
      });

      await apiFetch('/api/files', {
        token,
        method: 'POST',
        body: formData,
        isForm: true,
      });

      setToast('Bestand geüpload.');
      setVehicleForm(emptyVehicleForm);
      setSelectedOptions([]);
      setUploadFile(null);
      await refreshCurrentView();
      setTab('files');
    } catch (error) {
      setToast(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    if (!messageText.trim() || !selectedFileId) return;
    try {
      await apiFetch(`/api/files/${selectedFileId}/messages`, {
        token,
        method: 'POST',
        body: { content: messageText.trim() },
      });
      setMessageText('');
      const messages = await apiFetch(`/api/files/${selectedFileId}/messages`, { token });
      setFileMessages(messages);
      setToast('Bericht verzonden.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function markNotificationsRead() {
    try {
      await apiFetch('/api/notifications/read-all', { token, method: 'POST' });
      const noteList = await apiFetch('/api/notifications', { token });
      setNotifications(noteList);
    } catch (error) {
      setToast(error.message);
    }
  }

  async function purchaseCredits() {
    if (!purchaseId) return;
    try {
      const result = await apiFetch('/api/credits/purchase', {
        token,
        method: 'POST',
        body: { packageId: purchaseId },
      });
      setUser(result.user);
      setCreditsTransactions((current) => [result.transaction, ...current]);
      setToast('Credits toegevoegd.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function toggleNotificationRead() {
    await markNotificationsRead();
    setToast('Meldingen als gelezen gemarkeerd.');
  }

  async function updateFileStatus(fileId, status) {
    try {
      await apiFetch(`/api/admin/files/${fileId}/status`, {
        token,
        method: 'PATCH',
        body: { status },
      });
      await refreshCurrentView();
      if (selectedFileId === fileId) {
        const detail = await apiFetch(`/api/files/${fileId}`, { token });
        const messages = await apiFetch(`/api/files/${fileId}/messages`, { token });
        setFileDetail(detail);
        setFileMessages(messages);
      }
      setToast('File status updated.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function uploadTunedFile(fileId, file) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiFetch(`/api/admin/files/${fileId}/upload-tuned`, {
        token,
        method: 'POST',
        body: formData,
        isForm: true,
      });
      setAdminSelectedFiles((current) => ({ ...current, [fileId]: null }));
      await refreshCurrentView();
      setToast('Tuned file uploaded.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function adjustCredits(userId, amount) {
    try {
      await apiFetch(`/api/admin/users/${userId}/credits`, {
        token,
        method: 'PATCH',
        body: { amount, reason: 'manual adjustment' },
      });
      await refreshCurrentView();
      setToast('Credits updated.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function setUserApproval(userId, status) {
    try {
      await apiFetch(`/api/admin/users/${userId}/approval`, { token, method: 'PATCH', body: { status } });
      await refreshCurrentView();
      setToast('User approval updated.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function fetchCascade(nextForm) {
    const merged = { ...vehicleForm, ...nextForm };
    setVehicleForm(merged);

    try {
      if (Object.prototype.hasOwnProperty.call(nextForm, 'brand')) {
        if (!nextForm.brand) {
          setModelOptions([]);
          setGenerationOptions([]);
          setEngineOptions([]);
          setEcuOptions([]);
          setVehicleForm((current) => ({ ...current, ecu: '' }));
          return;
        }
        const models = await apiFetch(`/api/vehicles/models?brand=${encodeURIComponent(nextForm.brand)}`, { token });
        setModelOptions(models);
        setGenerationOptions([]);
        setEngineOptions([]);
        setEcuOptions([]);
        setVehicleForm((current) => ({ ...current, ecu: '' }));
      }

      if (Object.prototype.hasOwnProperty.call(nextForm, 'model')) {
        if (!nextForm.model) {
          setGenerationOptions([]);
          setEngineOptions([]);
          setEcuOptions([]);
          setVehicleForm((current) => ({ ...current, ecu: '' }));
          return;
        }
        const generations = await apiFetch(
          `/api/vehicles/generations?brand=${encodeURIComponent(merged.brand)}&model=${encodeURIComponent(nextForm.model)}`,
          { token }
        );
        setGenerationOptions(generations);
        setEngineOptions([]);
        setEcuOptions([]);
        setVehicleForm((current) => ({ ...current, ecu: '' }));
      }

      if (Object.prototype.hasOwnProperty.call(nextForm, 'generation')) {
        if (!nextForm.generation) {
          setEngineOptions([]);
          setEcuOptions([]);
          setVehicleForm((current) => ({ ...current, ecu: '' }));
          return;
        }
        const engines = await apiFetch(
          `/api/vehicles/engines?brand=${encodeURIComponent(merged.brand)}&model=${encodeURIComponent(merged.model)}&generation=${encodeURIComponent(nextForm.generation)}`,
          { token }
        );
        setEngineOptions(engines);
        setEcuOptions([]);
        setVehicleForm((current) => ({ ...current, ecu: '' }));
      }

      if (Object.prototype.hasOwnProperty.call(nextForm, 'engine')) {
        if (!nextForm.engine) {
          setEcuOptions([]);
          setVehicleForm((current) => ({ ...current, ecu: '' }));
          return;
        }
        const ecus = await apiFetch(
          `/api/vehicles/ecus?brand=${encodeURIComponent(merged.brand)}&model=${encodeURIComponent(merged.model)}&generation=${encodeURIComponent(merged.generation)}&engine=${encodeURIComponent(nextForm.engine)}`,
          { token }
        );
        setEcuOptions(ecus);
        setVehicleForm((current) => ({
          ...current,
          ecu: current.ecu || ecus[0] || '',
        }));
      }
    } catch (error) {
      setToast(error.message);
    }
  }

  async function downloadAuthorizedFile(path, filename) {
    try {
      const response = await fetch(apiUrl(path), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setToast(error.message);
    }
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <div className="backdrop-grid" />
        <div className="login-panel">
          <div className="login-visual">
            <span className="eyebrow">Fast Chiptuningfiles</span>
            <h1 className="hero-title" style={{ marginTop: 18 }}>
              Eén paneel voor uploads, status, ondersteuning en credits.
            </h1>
            <p className="hero-copy">
              Dit dashboard koppelt direct met de bestaande FastAPI-backend. Na inloggen kun je voertuigen kiezen,
              bestanden uploaden, berichten sturen en beheeracties uitvoeren voor de werkstroom.
            </p>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="auth-tabs">
              <button className={classNames('auth-tab', authMode === 'login' && 'active')} onClick={() => setAuthMode('login')}>
                Inloggen
              </button>
              <button className={classNames('auth-tab', authMode === 'register' && 'active')} onClick={() => setAuthMode('register')}>
                Registreren
              </button>
            </div>

            {authMode === 'login' ? (
                <form className="grid" onSubmit={handleLogin}>
                <div className="field">
                  <label>E-mail</label>
                  <input className="input" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
                </div>
                <div className="field">
                  <label>Wachtwoord</label>
                  <input className="input" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                </div>
                <button className="button button-primary" type="submit" disabled={loading}>
                  {loading ? 'Bezig met inloggen...' : 'Paneel openen'}
                </button>
                {/* Admin seed removed from UI for security. */}
              </form>
            ) : (
              <form className="grid two" onSubmit={handleRegister}>
                <div className="field">
                  <label>Voornaam</label>
                  <input className="input" value={authForm.firstName} onChange={(event) => setAuthForm({ ...authForm, firstName: event.target.value })} />
                </div>
                <div className="field">
                  <label>Achternaam</label>
                  <input className="input" value={authForm.lastName} onChange={(event) => setAuthForm({ ...authForm, lastName: event.target.value })} />
                </div>
                <div className="field">
                  <label>E-mail</label>
                  <input className="input" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
                </div>
                <div className="field">
                  <label>Wachtwoord</label>
                  <input className="input" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                </div>
                <div className="field">
                  <label>Bedrijf</label>
                  <input className="input" value={authForm.company} onChange={(event) => setAuthForm({ ...authForm, company: event.target.value })} />
                </div>
                <div className="field">
                  <label>Land</label>
                  <input className="input" value={authForm.country} onChange={(event) => setAuthForm({ ...authForm, country: event.target.value })} />
                </div>
                <button className="button button-primary" type="submit" style={{ gridColumn: '1 / -1' }} disabled={loading}>
                  {loading ? 'Account wordt aangemaakt...' : 'Account aanmaken'}
                </button>
              </form>
            )}
          </div>
        </div>
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="backdrop-grid" />
      <div className="container">
        <div className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div>
              <h2 className="card-title">{(user?.firstName || '') + ' ' + (user?.lastName || '')}</h2>
              <p className="card-subtitle">{user?.email}</p>
            </div>
            <button className="button button-secondary" onClick={handleLogout}>Uitloggen</button>
          </div>
          <div className="pill-row">
            <span className="pill ok">{user?.credits ?? 0} credits</span>
          </div>
        </div>

        <nav className="nav-bar">
          {(() => {
            const basic = [
              ['overview', 'Overzicht'],
              ['chat', 'Chat'],
              ['upload', 'Uploaden'],
              ['files', 'Bestanden'],
            ];
            const advanced = [
              ['credits', 'Credits'],
              ['notifications', `Meldingen (${unreadCount})`],
              ...(user?.is_admin ? [['admin', 'Beheer']] : []),
            ];
            const items = showAdvanced ? [...basic, ...advanced] : basic;
            return items.map(([key, label]) => (
              <button key={key} className={classNames('nav-item', tab === key && 'active')} onClick={() => setTab(key)}>
                {label}
              </button>
            ));
          })()}

          {user?.is_admin ? (
            <div style={{ marginLeft: 'auto' }}>
              <button className="button button-secondary" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? 'Verberg uitgebreid' : 'Toon uitgebreid'}
              </button>
            </div>
          ) : null}
        </nav>

        <div className="layout">
          <div className="stack">
            {tab === 'overview' ? (
              <>
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Huidige wachtrij</h2>
                      <p className="card-subtitle">Een compact overzicht van alles wat de backend al weet over je account.</p>
                    </div>
                    <span className="pill">{files.filter((item) => item.status === 'pending').length} in afwachting</span>
                  </div>
                  {files.length ? (
                    <div className="list">
                      {files.slice(0, 4).map((item) => (
                        <div className="list-item" key={item.id}>
                          <div className="list-top">
                            <div>
                              <h3 className="list-title">{item.fileName}</h3>
                              <div className="list-meta">{item.brand || 'Onbekend merk'} · {item.model || 'Onbekend model'} · {formatDate(item.uploadedAt)}</div>
                            </div>
                            <span className={classNames('status', item.status)}>{statusLabel(item.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">Nog geen bestanden. Upload je eerste bestand via het tabblad Uploaden.</div>
                  )}
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Meldingen</h2>
                      <p className="card-subtitle">Updates van support en statuswijzigingen.</p>
                    </div>
                    <button className="button button-secondary" onClick={toggleNotificationRead}>Alles als gelezen markeren</button>
                  </div>
                  <div className="list">
                    {notifications.slice(0, 4).map((item) => (
                      <div className="list-item" key={item.id}>
                        <div className="list-top">
                          <div>
                            <h3 className="list-title">{item.title}</h3>
                            <div className="list-meta">{item.body || 'Geen details beschikbaar.'}</div>
                          </div>
                          <span className={classNames('pill', item.read ? '' : 'warn')}>{item.read ? 'Gelezen' : 'Nieuw'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {tab === 'chat' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Chat</h2>
                    <p className="card-subtitle">Alle berichten worden per opdracht in de backend opgeslagen, dus niets verdwijnt na verversen.</p>
                  </div>
                </div>
                {recentOrders.length ? (
                  <div className="order-switcher">
                    {recentOrders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={classNames('order-chip', selectedFileId === item.id && 'active')}
                        onClick={() => setSelectedFileId(item.id)}
                      >
                        <span className="order-chip-title">{item.fileName}</span>
                        <span className="order-chip-meta">{statusLabel(item.status)}</span>
                        {unreadByFileId[item.id] ? <span className="order-chip-badge">{unreadByFileId[item.id]}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                {fileDetail ? (
                  <div className="grid" style={{ gap: 12 }}>
                    <div className="pill-row">
                      <span className={classNames('status', fileDetail.status)}>{statusLabel(fileDetail.status)}</span>
                      <span className="pill">{fileDetail.fileName}</span>
                      <span className="pill">{fileDetail.credits} credits</span>
                    </div>
                    <div className="list-item">
                      <div className="list-meta">{[fileDetail.brand, fileDetail.model, fileDetail.engine].filter(Boolean).join(' · ') || 'Nog geen voertuiggegevens.'}</div>
                      <div className="list-meta">Geüpload {formatDate(fileDetail.uploadedAt)}</div>
                      <div className="list-meta">Gebruiker {fileDetail.userEmail}</div>
                    </div>
                    <div className="pill-row">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={!fileDetail.hasOriginal}
                        onClick={() => downloadAuthorizedFile(`/api/files/${fileDetail.id}/download/original`, fileDetail.fileName)}
                      >
                        Origineel downloaden
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={!fileDetail.hasTuned}
                        onClick={() => downloadAuthorizedFile(`/api/files/${fileDetail.id}/download/tuned`, fileDetail.tunedFileName || 'tuned.bin')}
                      >
                        Gewijzigd bestand downloaden
                      </button>
                    </div>

                    {user?.is_admin ? (
                      <div className="grid" style={{ gap: 12 }}>
                        <div className="field">
                          <label>Gewijzigd bestand uploaden</label>
                          <input
                            className="input"
                            type="file"
                            onChange={(event) => setAdminSelectedFiles((current) => ({ ...current, [fileDetail.id]: event.target.files?.[0] || null }))}
                          />
                        </div>
                        <div className="form-actions" style={{ marginTop: 0 }}>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={!adminSelectedFiles[fileDetail.id]}
                            onClick={() => uploadTunedFile(fileDetail.id, adminSelectedFiles[fileDetail.id])}
                          >
                            Gewijzigd bestand uploaden
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="list">
                      {fileMessages.map((item) => (
                        <div className={classNames('chat-message', item.senderRole === 'admin' ? 'admin' : 'user')} key={item.id}>
                          <div className="chat-message-meta">
                            <span className="chat-message-name">{item.senderName || 'System'}</span>
                            <span className="chat-message-role">{item.senderRole}</span>
                            <span className="chat-message-time">{formatDate(item.createdAt)}</span>
                          </div>
                          <p className="chat-message-body">{item.content}</p>
                        </div>
                      ))}
                    </div>
                    <form className="grid" onSubmit={handleSendMessage}>
                      <div className="field">
                        <label>Antwoord</label>
                        <textarea className="textarea" value={messageText} onChange={(event) => setMessageText(event.target.value)} />
                      </div>
                      <button className="button button-primary" type="submit">Bericht verzenden</button>
                    </form>
                  </div>
                ) : (
                  <div className="empty-state">Selecteer een opdracht via Bestanden om te chatten.</div>
                )}
              </section>
            ) : null}

            {tab === 'upload' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Uploadverzoek</h2>
                    <p className="card-subtitle">Vul de gegevens in en dien daarna het originele bestand in.</p>
                  </div>
                  <span className="pill ok">{uploadCredits} credits</span>
                </div>

                {(!user?.is_admin && !showAdvanced) ? (
                  <form className="grid" onSubmit={handleUpload}>
                    <div className="field">
                      <label>Origineel bestand</label>
                      <input className="input" type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
                    </div>

                    <div className="field">
                      <label>Kenteken</label>
                      <input className="input" value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm({ ...vehicleForm, licensePlate: event.target.value })} />
                      <div className="muted small">Kenteken invullen vult merk, model, generatie en motor automatisch in. Handmatig kiezen blijft mogelijk.</div>
                      <div className="muted small">
                        {plateLookupLoading ? ' Zoeken...' : ''}
                        {plateLookupMessage ? ` ${plateLookupMessage}` : ''}
                      </div>
                      <div className="form-actions" style={{ marginTop: 0 }}>
                        <button type="button" className="button button-secondary" onClick={lookupLicensePlate} disabled={plateLookupLoading || normalizePlate(vehicleForm.licensePlate).length < 5}>
                          Kenteken herkennen
                        </button>
                      </div>
                    </div>

                    <div className="grid two">
                      <div className="field">
                        <label>Merk</label>
                        <select className="select" value={vehicleForm.brand} onChange={(event) => fetchCascade({ brand: event.target.value, model: '', generation: '', engine: '', ecu: '' })}>
                          <option value="">Kies merk</option>
                          {brandOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <select className="select" value={vehicleForm.model} onChange={(event) => fetchCascade({ model: event.target.value, generation: '', engine: '', ecu: '' })} disabled={!modelOptions.length}>
                          <option value="">Kies model</option>
                          {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Generatie</label>
                        <select className="select" value={vehicleForm.generation} onChange={(event) => fetchCascade({ generation: event.target.value, engine: '', ecu: '' })} disabled={!generationOptions.length}>
                          <option value="">Kies generatie</option>
                          {generationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Motor</label>
                        <select className="select" value={vehicleForm.engine} onChange={(event) => fetchCascade({ engine: event.target.value, ecu: '' })} disabled={!engineOptions.length}>
                          <option value="">Kies motor</option>
                          {engineOptions.map((item) => <option key={item.name || item} value={item.name || item}>{item.name || item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>ECU</label>
                        <select className="select" value={vehicleForm.ecu || ecuOptions[0] || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, ecu: event.target.value })} disabled={!ecuOptions.length}>
                          <option value="">Kies ECU</option>
                          {ecuOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Tuningtype</label>
                        <select className="select" value={vehicleForm.tuningType} onChange={(event) => setVehicleForm({ ...vehicleForm, tuningType: event.target.value })}>
                          <option value="">Kies tuningtype</option>
                          {tuningOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label>Opmerking bij aanvraag (optioneel)</label>
                      <textarea className="textarea" value={vehicleForm.note} onChange={(event) => setVehicleForm({ ...vehicleForm, note: event.target.value })} />
                    </div>

                    <div className="pill-row">
                      <span className="pill">Voertuig: {vehicleLabel || 'nog niet gekozen'}</span>
                      <span className="pill ok">Credits: {uploadCredits}</span>
                    </div>

                    {user?.approval_status !== 'approved' ? (
                      <div className="empty-state">
                        Je account is nog niet goedgekeurd door een admin. Uploads en betalingen zijn geblokkeerd totdat je account is goedgekeurd.
                      </div>
                    ) : (
                      <div className="form-actions">
                        <button className="button button-primary" type="submit" disabled={uploading || !uploadFile}>
                          {uploading ? 'Bezig met uploaden...' : 'Indienen'}
                        </button>
                      </div>
                    )}
                  </form>
                ) : (
                  <form className="grid" onSubmit={handleUpload}>
                    <div className="field">
                      <label>Origineel bestand</label>
                      <input className="input" type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
                    </div>

                    <div className="field">
                      <label>Kenteken</label>
                      <input className="input" value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm({ ...vehicleForm, licensePlate: event.target.value })} />
                      <div className="muted small">Kenteken invullen vult merk, model, generatie en motor automatisch in. Handmatig kiezen blijft mogelijk.</div>
                      <div className="muted small">
                        {plateLookupLoading ? ' Zoeken...' : ''}
                        {plateLookupMessage ? ` ${plateLookupMessage}` : ''}
                      </div>
                      <div className="form-actions" style={{ marginTop: 0 }}>
                        <button type="button" className="button button-secondary" onClick={lookupLicensePlate} disabled={plateLookupLoading || normalizePlate(vehicleForm.licensePlate).length < 5}>
                          Kenteken herkennen
                        </button>
                      </div>
                    </div>

                    <div className="grid two">
                      <div className="field">
                        <label>Merk</label>
                        <select className="select" value={vehicleForm.brand} onChange={(event) => fetchCascade({ brand: event.target.value, model: '', generation: '', engine: '', ecu: '' })}>
                          <option value="">Kies merk</option>
                          {brandOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <select className="select" value={vehicleForm.model} onChange={(event) => fetchCascade({ model: event.target.value, generation: '', engine: '', ecu: '' })} disabled={!modelOptions.length}>
                          <option value="">Kies model</option>
                          {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Generatie</label>
                        <select className="select" value={vehicleForm.generation} onChange={(event) => fetchCascade({ generation: event.target.value, engine: '', ecu: '' })} disabled={!generationOptions.length}>
                          <option value="">Kies generatie</option>
                          {generationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Motor</label>
                        <select className="select" value={vehicleForm.engine} onChange={(event) => fetchCascade({ engine: event.target.value, ecu: '' })} disabled={!engineOptions.length}>
                          <option value="">Kies motor</option>
                          {engineOptions.map((item) => <option key={item.name || item} value={item.name || item}>{item.name || item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>ECU</label>
                        <select className="select" value={vehicleForm.ecu || ecuOptions[0] || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, ecu: event.target.value })} disabled={!ecuOptions.length}>
                          <option value="">Kies ECU</option>
                          {ecuOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Tuningtype</label>
                        <select className="select" value={vehicleForm.tuningType} onChange={(event) => setVehicleForm({ ...vehicleForm, tuningType: event.target.value })}>
                          <option value="">Kies tuningtype</option>
                          {tuningOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid three">
                      <div className="field"><label>Motor pk</label><input className="input" value={vehicleForm.engineHp} onChange={(event) => setVehicleForm({ ...vehicleForm, engineHp: event.target.value })} /></div>
                      <div className="field"><label>Motor kW</label><input className="input" value={vehicleForm.engineKw} onChange={(event) => setVehicleForm({ ...vehicleForm, engineKw: event.target.value })} /></div>
                      <div className="field"><label>Bouwjaar</label><input className="input" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} /></div>
                    </div>

                    <div className="grid two">
                      <div className="field"><label>Transmissie</label><select className="select" value={vehicleForm.gearbox} onChange={(event) => setVehicleForm({ ...vehicleForm, gearbox: event.target.value })}><option value="">Kies transmissie</option>{toolOptions?.gearboxes?.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                      <div className="field"><label>Doorlooptijd</label><select className="select" value={vehicleForm.timeFrame} onChange={(event) => setVehicleForm({ ...vehicleForm, timeFrame: event.target.value })}><option value="">Kies doorlooptijd</option>{toolOptions?.timeFrames?.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
                    </div>

                    <div className="grid two">
                      <div className="field"><label>VIN</label><input className="input" value={vehicleForm.vin} onChange={(event) => setVehicleForm({ ...vehicleForm, vin: event.target.value })} /></div>
                      <div className="field"><label>Hardwarenummer</label><input className="input" value={vehicleForm.hardwareNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, hardwareNumber: event.target.value })} /></div>
                      <div className="field"><label>Softwarenummer</label><input className="input" value={vehicleForm.softwareNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, softwareNumber: event.target.value })} /></div>
                    </div>

                    <div className="field">
                      <label>Extra opties</label>
                      <div className="pill-row">
                        {additionalOptions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={classNames('pill', selectedOptions.includes(item.id) && 'ok')}
                            onClick={() => setSelectedOptions((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field">
                      <label>Opmerking bij aanvraag</label>
                      <textarea className="textarea" value={vehicleForm.note} onChange={(event) => setVehicleForm({ ...vehicleForm, note: event.target.value })} />
                    </div>

                    <div className="pill-row">
                      <span className="pill">Voertuig: {vehicleLabel || 'nog niet gekozen'}</span>
                      <span className="pill ok">Credits: {uploadCredits}</span>
                    </div>

                    {user?.approval_status !== 'approved' ? (
                      <div className="empty-state">
                        Je account is nog niet goedgekeurd door een admin. Uploads en betalingen zijn geblokkeerd totdat je account is goedgekeurd.
                      </div>
                    ) : (
                      <div className="form-actions">
                        <button className="button button-primary" type="submit" disabled={uploading || !uploadFile}>
                          {uploading ? 'Bezig met uploaden...' : 'Indienen'}
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </section>
            ) : null}

            {tab === 'files' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Mijn bestanden</h2>
                    <p className="card-subtitle">Kies een aanvraag om de bestands-thread en downloadlinks te bekijken.</p>
                  </div>
                </div>
                {displayedFiles.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bestand</th>
                        <th>Voertuig</th>
                        <th>Status</th>
                        <th>Geüpload</th>
                        <th>Actie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedFiles.map((item) => (
                        <tr key={item.id} onClick={() => setSelectedFileId(item.id)} style={{ cursor: 'pointer' }} className={classNames(selectedFileId === item.id && 'active-row')}>
                          <td>{item.fileName}</td>
                          <td>{[item.brand, item.model, item.engine].filter(Boolean).join(' · ') || item.vehicle || 'Onbekend'}</td>
                          <td>
                            <div className="pill-row">
                              <span className={classNames('status', item.status)}>{statusLabel(item.status)}</span>
                              {unreadByFileId[item.id] ? <span className="pill warn">{unreadByFileId[item.id]} nieuw</span> : null}
                            </div>
                          </td>
                          <td>{formatDate(item.uploadedAt)}</td>
                          <td>
                            <button type="button" className="pill" onClick={(event) => { event.stopPropagation(); setSelectedFileId(item.id); }}>
                              Openen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">Nog geen uploads beschikbaar.</div>
                )}
              </section>
            ) : null}

            {tab === 'credits' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Credits</h2>
                    <p className="card-subtitle">Koop een pakket en houd het overzicht zichtbaar voor het team.</p>
                  </div>
                </div>
                <div className="grid two">
                  <div className="field">
                    <label>Pakket</label>
                    <select className="select" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}>
                      {packages.map((item) => <option key={item.id} value={item.id}>{item.credits} credits - {item.price} EUR</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ alignSelf: 'end' }}>
                    <button className="button button-primary" onClick={purchaseCredits}>Credits kopen</button>
                  </div>
                </div>
                <div className="list" style={{ marginTop: 16 }}>
                  {creditsTransactions.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.type}</h3>
                          <div className="list-meta">{item.method || 'System'} · {formatDate(item.date)}</div>
                        </div>
                        <span className={classNames('pill', item.amount >= 0 ? 'ok' : 'danger')}>{item.amount >= 0 ? '+' : ''}{item.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === 'notifications' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Meldingen</h2>
                    <p className="card-subtitle">Directe berichten, bestandsgebeurtenissen en credit-updates.</p>
                  </div>
                  <button className="button button-secondary" onClick={toggleNotificationRead}>Alles als gelezen markeren</button>
                </div>
                <div className="list">
                  {notifications.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.title}</h3>
                          <div className="list-meta">{item.body || 'Geen extra details.'}</div>
                        </div>
                          <span className={classNames('pill', item.read ? '' : 'warn')}>{item.read ? 'Gelezen' : 'Ongelezen'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === 'admin' && user?.is_admin ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Beheerconsole</h2>
                    <p className="card-subtitle">Gebruikersbeheer en bestandscontrole.</p>
                  </div>
                </div>

                <div className="grid three" style={{ marginBottom: 18 }}>
                  <div className="tile"><span className="tile-value">{adminStats?.totalUsers ?? 0}</span><span className="tile-label">Gebruikers</span></div>
                  <div className="tile"><span className="tile-value">{adminStats?.totalFiles ?? 0}</span><span className="tile-label">Bestanden</span></div>
                  <div className="tile"><span className="tile-value">{adminStats?.completed ?? 0}</span><span className="tile-label">Voltooid</span></div>
                </div>

                <div className="list" style={{ marginBottom: 20 }}>
                  {adminFiles.slice(0, 8).map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.fileName}</h3>
                          <div className="list-meta">{item.userEmail} · {item.brand || 'Onbekend merk'} · {formatDate(item.uploadedAt)}</div>
                        </div>
                        <div className="pill-row" style={{ justifyContent: 'flex-end' }}>
                          {statusOrder.map((status) => (
                            <button key={status} type="button" className="pill" onClick={() => updateFileStatus(item.id, status)}>{statusLabel(status)}</button>
                          ))}
                        </div>
                      </div>
                      <div className="grid two" style={{ marginTop: 12 }}>
                        <input
                          className="input"
                          type="file"
                          onChange={(event) => setAdminSelectedFiles((current) => ({ ...current, [item.id]: event.target.files?.[0] || null }))}
                        />
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!adminSelectedFiles[item.id]}
                          onClick={() => uploadTunedFile(item.id, adminSelectedFiles[item.id])}
                        >
                          Gewijzigd bestand uploaden
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="list">
                  {adminUsers.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.firstName} {item.lastName}</h3>
                          <div className="list-meta">{item.email} · {item.company || 'Geen bedrijf'} · Credits {item.credits}</div>
                        </div>
                        <div className="pill-row">
                          <button className="pill ok" onClick={() => adjustCredits(item.id, 5)}>+5</button>
                          <button className="pill danger" onClick={() => adjustCredits(item.id, -5)}>-5</button>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div className="pill-row">
                          <span className="pill">Status: {item.approval_status || 'in afwachting'}</span>
                          {item.approval_status !== 'approved' && (
                            <button className="button button-primary" onClick={() => setUserApproval(item.id, 'approved')}>Goedkeuren</button>
                          )}
                          {item.approval_status !== 'rejected' && (
                            <button className="button button-secondary" onClick={() => setUserApproval(item.id, 'rejected')}>Afwijzen</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="stack">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Geselecteerd bestand</h2>
                  <p className="card-subtitle">Detailweergave van de huidige opdracht.</p>
                </div>
              </div>
              {fileDetail ? (
                <div className="grid" style={{ gap: 12 }}>
                  <div className="pill-row">
                    <span className={classNames('status', fileDetail.status)}>{statusLabel(fileDetail.status)}</span>
                    <span className="pill">{fileDetail.fileName}</span>
                    <span className="pill">{fileDetail.credits} credits</span>
                  </div>
                  <div className="list-item">
                    <div className="list-meta">{[fileDetail.brand, fileDetail.model, fileDetail.engine].filter(Boolean).join(' · ') || 'Nog geen voertuiggegevens.'}</div>
                    <div className="list-meta">Geüpload {formatDate(fileDetail.uploadedAt)}</div>
                    <div className="list-meta">Gebruiker {fileDetail.userEmail}</div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">Selecteer een opdracht via Chat of Bestanden.</div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">API-dekking</h2>
                  <p className="card-subtitle">Het paneel is gekoppeld aan de routes die al in de backend bestaan.</p>
                </div>
              </div>
              <div className="pill-row">
                {['auth', 'files', 'credits', 'notifications', 'vehicles', user?.is_admin ? 'admin' : null].filter(Boolean).map((item) => (
                  <span className="pill ok" key={item}>{item}</span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default App;