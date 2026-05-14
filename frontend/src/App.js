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
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusLabel(status) {
  return String(status || 'pending').replace(/_/g, ' ');
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
    const message = typeof payload === 'object' ? payload.detail || payload.message || 'Request failed' : payload || 'Request failed';
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
    if (!uploadFile) {
      setToast('Select a file first.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('vehicle', vehicleLabel || uploadFile.name);
      formData.append('ecu', vehicleForm.ecu || ecuOptions[0] || 'Otherwise, namely');
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

      setToast('File uploaded.');
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
      setToast('Message sent.');
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
      setToast('Credits added.');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function toggleNotificationRead() {
    await markNotificationsRead();
    setToast('Notifications marked as read.');
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
              Eén paneel voor uploads, status, support en credits.
            </h1>
            <p className="hero-copy">
              Dit dashboard koppelt direct op de bestaande FastAPI-backend. Na inloggen kun je voertuigen kiezen,
              files uploaden, berichten sturen en adminacties uitvoeren voor de werkstroom.
            </p>
            <div className="hero-tiles" style={{ marginTop: 24 }}>
              <div className="tile">
                <span className="tile-value">API</span>
                <span className="tile-label">Backend connected</span>
              </div>
              <div className="tile">
                <span className="tile-value">24/7</span>
                <span className="tile-label">Auth tokens</span>
              </div>
              <div className="tile">
                <span className="tile-value">Files</span>
                <span className="tile-label">Upload and track</span>
              </div>
              <div className="tile">
                <span className="tile-value">Admin</span>
                <span className="tile-label">Support workflow</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="auth-tabs">
              <button className={classNames('auth-tab', authMode === 'login' && 'active')} onClick={() => setAuthMode('login')}>
                Login
              </button>
              <button className={classNames('auth-tab', authMode === 'register' && 'active')} onClick={() => setAuthMode('register')}>
                Register
              </button>
            </div>

            {authMode === 'login' ? (
              <form className="grid" onSubmit={handleLogin}>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                </div>
                <button className="button button-primary" type="submit" disabled={loading}>
                  {loading ? 'Signing in...' : 'Open panel'}
                </button>
                <p className="muted small" style={{ margin: 0 }}>
                  Admin seed: admin@fast-chiptuningfiles.com / admin1234
                </p>
              </form>
            ) : (
              <form className="grid two" onSubmit={handleRegister}>
                <div className="field">
                  <label>First name</label>
                  <input className="input" value={authForm.firstName} onChange={(event) => setAuthForm({ ...authForm, firstName: event.target.value })} />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input className="input" value={authForm.lastName} onChange={(event) => setAuthForm({ ...authForm, lastName: event.target.value })} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                </div>
                <div className="field">
                  <label>Company</label>
                  <input className="input" value={authForm.company} onChange={(event) => setAuthForm({ ...authForm, company: event.target.value })} />
                </div>
                <div className="field">
                  <label>Country</label>
                  <input className="input" value={authForm.country} onChange={(event) => setAuthForm({ ...authForm, country: event.target.value })} />
                </div>
                <button className="button button-primary" type="submit" style={{ gridColumn: '1 / -1' }} disabled={loading}>
                  {loading ? 'Creating account...' : 'Create account'}
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
        <section className="hero">
          <div className="hero-panel">
            <span className="eyebrow">Operational panel</span>
            <h1 className="hero-title">Werk je chiptuning-flow vanuit één helder scherm.</h1>
            <p className="hero-copy">
              Upload originele files, volg de status, reageer op supportberichten en beheer credits zonder tussen tabbladen te springen.
              De app haalt de data direct op via {API_BASE}.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => setTab('upload')}>Nieuwe upload</button>
              <button className="button button-secondary" onClick={() => setTab('files')}>Open files</button>
              <button className="button button-secondary" onClick={refreshCurrentView}>Refresh data</button>
            </div>
          </div>

          <div className="hero-side">
            <div className="hero-tiles">
              <div className="tile"><span className="tile-value">{user?.credits ?? 0}</span><span className="tile-label">Available credits</span></div>
              <div className="tile"><span className="tile-value">{files.length}</span><span className="tile-label">My files</span></div>
              <div className="tile"><span className="tile-value">{unreadCount}</span><span className="tile-label">Unread alerts</span></div>
              <div className="tile"><span className="tile-value">{user?.is_admin ? 'Yes' : 'No'}</span><span className="tile-label">Admin access</span></div>
            </div>

            <div className="card">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h2 className="card-title">{(user?.firstName || '') + ' ' + (user?.lastName || '')}</h2>
                  <p className="card-subtitle">{user?.email}</p>
                </div>
                <button className="button button-secondary" onClick={handleLogout}>Logout</button>
              </div>
              <div className="pill-row">
                <span className="pill ok">{user?.credits ?? 0} credits</span>
              </div>
            </div>
          </div>
        </section>

              <nav className="nav-bar">
                {(() => {
                  const basic = [
                    ['overview', 'Overview'],
                    ['upload', 'Upload'],
                    ['files', 'Files'],
                  ];
                  const advanced = [
                    ['credits', 'Credits'],
                    ['notifications', `Notifications (${unreadCount})`],
                    ...(user?.is_admin ? [['admin', 'Admin']] : []),
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
                      {showAdvanced ? 'Hide advanced' : 'Show advanced'}
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
                      <h2 className="card-title">Current work queue</h2>
                      <p className="card-subtitle">A compact summary of everything the backend already knows about your account.</p>
                    </div>
                    <span className="pill">{files.filter((item) => item.status === 'pending').length} pending</span>
                  </div>
                  {files.length ? (
                    <div className="list">
                      {files.slice(0, 4).map((item) => (
                        <div className="list-item" key={item.id}>
                          <div className="list-top">
                            <div>
                              <h3 className="list-title">{item.fileName}</h3>
                              <div className="list-meta">{item.brand || 'Unknown brand'} · {item.model || 'Unknown model'} · {formatDate(item.uploadedAt)}</div>
                            </div>
                            <span className={classNames('status', item.status)}>{statusLabel(item.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">No files yet. Upload your first one from the Upload tab.</div>
                  )}
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Notifications</h2>
                      <p className="card-subtitle">Updates from support and status changes.</p>
                    </div>
                    <button className="button button-secondary" onClick={toggleNotificationRead}>Mark all read</button>
                  </div>
                  <div className="list">
                    {notifications.slice(0, 4).map((item) => (
                      <div className="list-item" key={item.id}>
                        <div className="list-top">
                          <div>
                            <h3 className="list-title">{item.title}</h3>
                            <div className="list-meta">{item.body || 'No details provided.'}</div>
                          </div>
                          <span className={classNames('pill', item.read ? '' : 'warn')}>{item.read ? 'Read' : 'New'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {tab === 'upload' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Upload request</h2>
                    <p className="card-subtitle">Fill in the workflow fields, then submit the original file.</p>
                  </div>
                  <span className="pill ok">{uploadCredits} credits</span>
                </div>

                {(!user?.is_admin && !showAdvanced) ? (
                  <form className="grid" onSubmit={handleUpload}>
                    <div className="field">
                      <label>Original file</label>
                      <input className="input" type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
                    </div>

                    <div className="grid two">
                      <div className="field">
                        <label>Brand</label>
                        <select className="select" value={vehicleForm.brand} onChange={(event) => fetchCascade({ brand: event.target.value, model: '', generation: '', engine: '', ecu: '' })}>
                          <option value="">Select brand</option>
                          {brandOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <select className="select" value={vehicleForm.model} onChange={(event) => fetchCascade({ model: event.target.value, generation: '', engine: '', ecu: '' })} disabled={!modelOptions.length}>
                          <option value="">Select model</option>
                          {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Generation</label>
                        <select className="select" value={vehicleForm.generation} onChange={(event) => fetchCascade({ generation: event.target.value, engine: '', ecu: '' })} disabled={!generationOptions.length}>
                          <option value="">Select generation</option>
                          {generationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Engine</label>
                        <select className="select" value={vehicleForm.engine} onChange={(event) => fetchCascade({ engine: event.target.value, ecu: '' })} disabled={!engineOptions.length}>
                          <option value="">Select engine</option>
                          {engineOptions.map((item) => <option key={item.name || item} value={item.name || item}>{item.name || item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>ECU</label>
                        <select className="select" value={vehicleForm.ecu || ecuOptions[0] || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, ecu: event.target.value })} disabled={!ecuOptions.length}>
                          <option value="">Select ECU</option>
                          {ecuOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label>Request note (optional)</label>
                      <textarea className="textarea" value={vehicleForm.note} onChange={(event) => setVehicleForm({ ...vehicleForm, note: event.target.value })} />
                    </div>

                    <div className="pill-row">
                      <span className="pill">Vehicle: {vehicleLabel || 'not chosen yet'}</span>
                      <span className="pill ok">Credits: {uploadCredits}</span>
                    </div>

                    {user?.approval_status !== 'approved' ? (
                      <div className="empty-state">
                        Je account is nog niet goedgekeurd door een admin. Uploads en betalingen zijn geblokkeerd totdat je account is goedgekeurd.
                      </div>
                    ) : (
                      <button className="button button-primary" type="submit" disabled={uploading || !uploadFile}>
                        {uploading ? 'Uploading...' : 'Submit request'}
                      </button>
                    )}
                  </form>
                ) : (
                  <form className="grid" onSubmit={handleUpload}>
                    <div className="field">
                      <label>Original file</label>
                      <input className="input" type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
                    </div>

                    <div className="grid two">
                      <div className="field">
                        <label>Brand</label>
                        <select className="select" value={vehicleForm.brand} onChange={(event) => fetchCascade({ brand: event.target.value, model: '', generation: '', engine: '', ecu: '' })}>
                          <option value="">Select brand</option>
                          {brandOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Model</label>
                        <select className="select" value={vehicleForm.model} onChange={(event) => fetchCascade({ model: event.target.value, generation: '', engine: '', ecu: '' })} disabled={!modelOptions.length}>
                          <option value="">Select model</option>
                          {modelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Generation</label>
                        <select className="select" value={vehicleForm.generation} onChange={(event) => fetchCascade({ generation: event.target.value, engine: '', ecu: '' })} disabled={!generationOptions.length}>
                          <option value="">Select generation</option>
                          {generationOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Engine</label>
                        <select className="select" value={vehicleForm.engine} onChange={(event) => fetchCascade({ engine: event.target.value, ecu: '' })} disabled={!engineOptions.length}>
                          <option value="">Select engine</option>
                          {engineOptions.map((item) => <option key={item.name || item} value={item.name || item}>{item.name || item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>ECU</label>
                        <select className="select" value={vehicleForm.ecu || ecuOptions[0] || ''} onChange={(event) => setVehicleForm({ ...vehicleForm, ecu: event.target.value })} disabled={!ecuOptions.length}>
                          <option value="">Select ECU</option>
                          {ecuOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Tuning type</label>
                        <select className="select" value={vehicleForm.tuningType} onChange={(event) => setVehicleForm({ ...vehicleForm, tuningType: event.target.value })}>
                          <option value="">Select tuning type</option>
                          {tuningOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid three">
                      <div className="field"><label>Engine hp</label><input className="input" value={vehicleForm.engineHp} onChange={(event) => setVehicleForm({ ...vehicleForm, engineHp: event.target.value })} /></div>
                      <div className="field"><label>Engine kW</label><input className="input" value={vehicleForm.engineKw} onChange={(event) => setVehicleForm({ ...vehicleForm, engineKw: event.target.value })} /></div>
                      <div className="field"><label>Year</label><input className="input" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} /></div>
                    </div>

                    <div className="grid two">
                      <div className="field"><label>Gearbox</label><select className="select" value={vehicleForm.gearbox} onChange={(event) => setVehicleForm({ ...vehicleForm, gearbox: event.target.value })}><option value="">Select gearbox</option>{toolOptions?.gearboxes?.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
                      <div className="field"><label>Time frame</label><select className="select" value={vehicleForm.timeFrame} onChange={(event) => setVehicleForm({ ...vehicleForm, timeFrame: event.target.value })}><option value="">Select timeframe</option>{toolOptions?.timeFrames?.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
                    </div>

                    <div className="grid two">
                      <div className="field"><label>License plate</label><input className="input" value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm({ ...vehicleForm, licensePlate: event.target.value })} /></div>
                      <div className="field"><label>VIN</label><input className="input" value={vehicleForm.vin} onChange={(event) => setVehicleForm({ ...vehicleForm, vin: event.target.value })} /></div>
                      <div className="field"><label>Hardware number</label><input className="input" value={vehicleForm.hardwareNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, hardwareNumber: event.target.value })} /></div>
                      <div className="field"><label>Software number</label><input className="input" value={vehicleForm.softwareNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, softwareNumber: event.target.value })} /></div>
                    </div>

                    <div className="field">
                      <label>Additional options</label>
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
                      <label>Request note</label>
                      <textarea className="textarea" value={vehicleForm.note} onChange={(event) => setVehicleForm({ ...vehicleForm, note: event.target.value })} />
                    </div>

                    <div className="pill-row">
                      <span className="pill">Vehicle: {vehicleLabel || 'not chosen yet'}</span>
                      <span className="pill ok">Credits: {uploadCredits}</span>
                    </div>

                    {user?.approval_status !== 'approved' ? (
                      <div className="empty-state">
                        Je account is nog niet goedgekeurd door een admin. Uploads en betalingen zijn geblokkeerd totdat je account is goedgekeurd.
                      </div>
                    ) : (
                      <button className="button button-primary" type="submit" disabled={uploading || !uploadFile}>
                        {uploading ? 'Uploading...' : 'Submit request'}
                      </button>
                    )}
                  </form>
                )}
              </section>
            ) : null}

            {tab === 'files' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">My files</h2>
                    <p className="card-subtitle">Pick a request to review the file thread and download links.</p>
                  </div>
                </div>
                {files.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((item) => (
                        <tr key={item.id} onClick={() => setSelectedFileId(item.id)} style={{ cursor: 'pointer' }}>
                          <td>{item.fileName}</td>
                          <td>{[item.brand, item.model, item.engine].filter(Boolean).join(' · ') || item.vehicle || 'Unknown'}</td>
                          <td><span className={classNames('status', item.status)}>{statusLabel(item.status)}</span></td>
                          <td>{formatDate(item.uploadedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">No uploads available yet.</div>
                )}
              </section>
            ) : null}

            {tab === 'credits' ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Credits</h2>
                    <p className="card-subtitle">Purchase a package, then keep the ledger visible for the team.</p>
                  </div>
                </div>
                <div className="grid two">
                  <div className="field">
                    <label>Package</label>
                    <select className="select" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}>
                      {packages.map((item) => <option key={item.id} value={item.id}>{item.credits} credits - {item.price} EUR</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ alignSelf: 'end' }}>
                    <button className="button button-primary" onClick={purchaseCredits}>Purchase credits</button>
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
                    <h2 className="card-title">Notifications</h2>
                    <p className="card-subtitle">Direct messages, file events and credits updates.</p>
                  </div>
                  <button className="button button-secondary" onClick={toggleNotificationRead}>Mark all read</button>
                </div>
                <div className="list">
                  {notifications.map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.title}</h3>
                          <div className="list-meta">{item.body || 'No extra details.'}</div>
                        </div>
                        <span className={classNames('pill', item.read ? '' : 'warn')}>{item.read ? 'Read' : 'Unread'}</span>
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
                    <h2 className="card-title">Admin console</h2>
                    <p className="card-subtitle">User management and file flow controls.</p>
                  </div>
                </div>

                <div className="grid three" style={{ marginBottom: 18 }}>
                  <div className="tile"><span className="tile-value">{adminStats?.totalUsers ?? 0}</span><span className="tile-label">Users</span></div>
                  <div className="tile"><span className="tile-value">{adminStats?.totalFiles ?? 0}</span><span className="tile-label">Files</span></div>
                  <div className="tile"><span className="tile-value">{adminStats?.completed ?? 0}</span><span className="tile-label">Completed</span></div>
                </div>

                <div className="list" style={{ marginBottom: 20 }}>
                  {adminFiles.slice(0, 8).map((item) => (
                    <div className="list-item" key={item.id}>
                      <div className="list-top">
                        <div>
                          <h3 className="list-title">{item.fileName}</h3>
                          <div className="list-meta">{item.userEmail} · {item.brand || 'Unknown brand'} · {formatDate(item.uploadedAt)}</div>
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
                          Upload tuned file
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
                          <div className="list-meta">{item.email} · {item.company || 'No company'} · Credits {item.credits}</div>
                        </div>
                        <div className="pill-row">
                          <button className="pill ok" onClick={() => adjustCredits(item.id, 5)}>+5</button>
                          <button className="pill danger" onClick={() => adjustCredits(item.id, -5)}>-5</button>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div className="pill-row">
                          <span className="pill">Status: {item.approval_status || 'pending'}</span>
                          {item.approval_status !== 'approved' && (
                            <button className="button button-primary" onClick={() => setUserApproval(item.id, 'approved')}>Approve</button>
                          )}
                          {item.approval_status !== 'rejected' && (
                            <button className="button button-secondary" onClick={() => setUserApproval(item.id, 'rejected')}>Reject</button>
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
                  <h2 className="card-title">Selected file</h2>
                  <p className="card-subtitle">Detail view and support thread.</p>
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
                    <div className="list-meta">{[fileDetail.brand, fileDetail.model, fileDetail.engine].filter(Boolean).join(' · ') || 'No vehicle data yet.'}</div>
                    <div className="list-meta">Uploaded {formatDate(fileDetail.uploadedAt)}</div>
                    <div className="list-meta">User {fileDetail.userEmail}</div>
                  </div>
                  <div className="pill-row">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!fileDetail.hasOriginal}
                      onClick={() => downloadAuthorizedFile(`/api/files/${fileDetail.id}/download/original`, fileDetail.fileName)}
                    >
                      Download original
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={!fileDetail.hasTuned}
                      onClick={() => downloadAuthorizedFile(`/api/files/${fileDetail.id}/download/tuned`, fileDetail.tunedFileName || 'tuned.bin')}
                    >
                      Download tuned
                    </button>
                  </div>
                  <div className="list">
                    {fileMessages.map((item) => (
                      <div className="list-item" key={item.id}>
                        <div className="list-top">
                          <div>
                            <h3 className="list-title">{item.senderName || 'System'}</h3>
                            <div className="list-meta">{formatDate(item.createdAt)}</div>
                          </div>
                          <span className="pill">{item.senderRole}</span>
                        </div>
                        <p className="card-subtitle" style={{ marginBottom: 0 }}>{item.content}</p>
                      </div>
                    ))}
                  </div>
                  <form className="grid" onSubmit={handleSendMessage}>
                    <div className="field">
                      <label>Reply</label>
                      <textarea className="textarea" value={messageText} onChange={(event) => setMessageText(event.target.value)} />
                    </div>
                    <button className="button button-primary" type="submit">Send message</button>
                  </form>
                </div>
              ) : (
                <div className="empty-state">Select a file to see the thread.</div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">API coverage</h2>
                  <p className="card-subtitle">The panel is wired to the routes already present in the backend.</p>
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