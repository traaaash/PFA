import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

// Relative URL — Nginx proxies /api/* to the backend service internally.
// This works in both Kubernetes and Docker Compose with no config changes.
const API = '';

// --- COMPOSANT LOGIN ---
function Login({ setAuth }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (response.ok) {
        const data = await response.json();
        setAuth(data);
        navigate(data.role === 'admin' ? '/admin' : '/user');
      } else {
        setError('Identifiants incorrects. Vérifiez votre nom d\'utilisateur et mot de passe.');
      }
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#3b82f6"/>
            <path d="M14 18h20M14 24h12M14 30h16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="36" cy="30" r="7" fill="#1d4ed8" stroke="white" strokeWidth="2"/>
            <path d="M33.5 30l1.5 1.5 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="login-title">HelpDesk IT</h1>
        <p className="login-subtitle">Connectez-vous avec vos identifiants Active Directory</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              placeholder="ex: jean.dupont"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Se connecter'}
          </button>
        </form>
        <p className="login-footer">Plateforme sécurisée — Authentification via AD (LDAP)</p>
      </div>
    </div>
  );
}

// --- VUE GESTION UTILISATEURS ---
function GestionUtilisateurs() {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const [feedback, setFeedback] = useState('');

  const fetchUsers = () => {
    fetch(`${API}/api/ad/users`)
      .then(res => res.json())
      .then(data => setUsers(data.filter(u => u.username)))
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (username, role) => {
    if (!username) return;
    try {
      const res = await fetch(`${API}/api/admin/assign-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role })
      });
      if (res.ok) {
        setFeedback(`✅ Rôle "${role}" assigné à "${username}"`);
        setNewUser('');
        fetchUsers();
        setTimeout(() => setFeedback(''), 3000);
      }
    } catch {
      setFeedback('❌ Erreur lors du changement de rôle');
    }
  };

  return (
    <div>
      {feedback && <div className={`alert ${feedback.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{feedback}</div>}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 className="card-title">Assigner un rôle manuellement</h3>
        <p className="text-muted">Permet de donner des droits à un utilisateur de l'Active Directory.</p>
        <div className="input-row">
          <input
            type="text"
            placeholder="Nom d'utilisateur AD (ex: nasser)"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="admin">Administrateur</option>
            <option value="user">Utilisateur Simple</option>
          </select>
          <button className="btn btn-primary" onClick={() => handleRoleChange(newUser, newRole)}>Assigner</button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Utilisateurs connus de l'application</h3>
        <table>
          <thead><tr><th>Utilisateur AD</th><th>Actions</th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="2" className="text-center text-muted">Aucun utilisateur enregistré.</td></tr>
            ) : (
              users.map((u, index) => (
                <tr key={index}>
                  <td><strong>{u.username}</strong></td>
                  <td className="action-cell">
                    <button className="btn btn-sm btn-primary" onClick={() => handleRoleChange(u.username, 'admin')}>Promouvoir Admin</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleRoleChange(u.username, 'user')}>Retirer Admin</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- VUE PARAMÈTRES LDAP ---
function ParametresLDAP() {
  const [serverUrl, setServerUrl] = useState('ldap://192.168.0.9');
  const [baseDn, setBaseDn] = useState('dc=sotupa,dc=local');
  const [bindDn, setBindDn] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleTestLDAP = async () => {
    setLoading(true);
    setFeedback('');
    try {
      const response = await fetch(`${API}/api/ldap/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_url: serverUrl, base_dn: baseDn, bind_dn: bindDn, password })
      });
      const data = await response.json();
      setFeedback(response.ok ? `✅ ${data.message}` : `❌ ${data.detail}`);
    } catch {
      setFeedback('❌ Erreur de connexion au backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px' }}>
      <h3 className="card-title">Configuration Active Directory (LDAP)</h3>
      {feedback && <div className={`alert ${feedback.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{feedback}</div>}
      <div className="form-stack">
        <div className="form-group">
          <label>Serveur LDAP</label>
          <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Base DN</label>
          <input type="text" value={baseDn} onChange={e => setBaseDn(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Bind DN (UPN)</label>
          <input type="text" placeholder="admin@sotupa.local" value={bindDn} onChange={e => setBindDn(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Mot de passe</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleTestLDAP} disabled={loading}>
          {loading ? <><span className="spinner" /> Test en cours...</> : 'Tester la connexion'}
        </button>
      </div>
    </div>
  );
}

// --- DASHBOARD UTILISATEUR ---
function UserDashboard({ auth, setAuth }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();

  const fetchTickets = () => {
    if (!auth) return;
    fetch(`${API}/api/tickets?username=${auth.username}`)
      .then(res => res.json())
      .then(data => setTickets(data))
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchTickets(); }, [auth]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback('');
    try {
      const res = await fetch(`${API}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: desc, username: auth.username })
      });
      if (res.ok) {
        setFeedback('✅ Ticket créé avec succès !');
        setTitle(''); setDesc('');
        fetchTickets();
        setTimeout(() => setFeedback(''), 4000);
      }
    } catch {
      setFeedback('❌ Serveur injoignable.');
    } finally {
      setLoading(false);
    }
  };

  const openCount = tickets.filter(t => t.status === 'Open').length;
  const closedCount = tickets.filter(t => t.status === 'Closed').length;

  return (
    <div className="user-layout">
      <div className="top-bar">
        <div className="top-bar-brand">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#3b82f6"/>
            <path d="M14 18h20M14 24h12M14 30h16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span>HelpDesk IT</span>
        </div>
        <div className="top-bar-user">
          <span className="badge badge-user">{auth?.username}</span>
          <button className="btn btn-danger btn-sm" onClick={() => { localStorage.removeItem('userSession'); setAuth(null); navigate('/'); }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="stats-row">
          <div className="stat-card stat-blue">
            <div className="stat-number">{tickets.length}</div>
            <div className="stat-label">Total demandes</div>
          </div>
          <div className="stat-card stat-red">
            <div className="stat-number">{openCount}</div>
            <div className="stat-label">En attente</div>
          </div>
          <div className="stat-card stat-green">
            <div className="stat-number">{closedCount}</div>
            <div className="stat-label">Résolues</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 className="card-title">Ouvrir un nouveau ticket</h3>
          {feedback && <div className={`alert ${feedback.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{feedback}</div>}
          <form onSubmit={handleCreateTicket} className="form-stack">
            <div className="form-group">
              <label>Sujet</label>
              <input type="text" placeholder="Ex: Impossible d'accéder au VPN" value={title} onChange={e => setTitle(e.target.value)} required disabled={loading} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea placeholder="Décrivez votre problème en détail..." value={desc} onChange={e => setDesc(e.target.value)} required disabled={loading} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Envoi en cours...</> : 'Envoyer la demande'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="card-title">Mes Demandes</h3>
          <table>
            <thead><tr><th>Sujet</th><th>Statut</th><th>Détails</th></tr></thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr><td colSpan="3" className="text-center text-muted">Aucune demande pour le moment.</td></tr>
              ) : tickets.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.title}</strong><br /><small className="text-muted">{t.description}</small></td>
                  <td><span className={`badge ${t.status === 'Open' ? 'badge-open' : 'badge-closed'}`}>{t.status === 'Open' ? 'En attente' : 'Résolu'}</span></td>
                  <td className="text-muted" style={{ fontSize: '0.85em' }}>
                    {t.status === 'Closed'
                      ? <><strong>Traité par {t.resolved_by || 'Admin'} :</strong> {t.admin_report}</>
                      : 'En attente de traitement...'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- MONITORING PANEL ---
function MonitoringPanel() {
  const tools = [
    {
      id: 'prometheus',
      label: 'Prometheus',
      icon: '🔥',
      url: 'http://localhost:9090',
      description: 'Collecte et requêtes de métriques en temps réel',
      color: '#e6522c',
      badge: 'Actif',
    },
    {
      id: 'sonarqube',
      label: 'SonarQube',
      icon: '🔍',
      url: 'http://localhost:9000',
      description: 'Qualité du code & analyse statique',
      color: '#4e9bcd',
      badge: 'Actif',
    },
  ];

  return (
    <div>
      {/* Grafana embedded via iframe */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-toolbar" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📈</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Grafana</div>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>Dashboards & visualisation des métriques</div>
            </div>
          </div>
          <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
            ↗ Ouvrir
          </a>
        </div>
        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <iframe
            src="http://localhost:3001"
            title="Grafana"
            style={{ width: '100%', height: '60vh', border: 'none', display: 'block' }}
          />
        </div>
      </div>

      {/* Prometheus & SonarQube as cards */}
      <div className="stats-row">
        {tools.map(tool => (
          <div key={tool.id} className="card" style={{ borderLeft: `4px solid ${tool.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '1.6rem' }}>{tool.icon}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{tool.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>{tool.description}</div>
                </div>
              </div>
              <span className="badge badge-closed">{tool.badge}</span>
            </div>
            <a href={tool.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              ↗ Ouvrir {tool.label}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- DASHBOARD ADMIN ---
function AdminDashboard({ auth, setAuth }) {
  const [tickets, setTickets] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportTexts, setReportTexts] = useState({});
  const [sortBy, setSortBy] = useState('newest');
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();

  const fetchTickets = () => {
    fetch(`${API}/api/tickets`)
      .then(res => res.json())
      .then(data => setTickets(data));
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleFinalizeTicket = async (id) => {
    const report = reportTexts[id] || '';
    if (!report) { setFeedback('❌ Veuillez rédiger un rapport avant de clore.'); return; }
    try {
      const res = await fetch(`${API}/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Closed', admin_report: report, resolved_by: auth.username })
      });
      if (res.ok) {
        setFeedback('✅ Ticket clôturé avec succès.');
        fetchTickets();
        setReportTexts(prev => { const n = { ...prev }; delete n[id]; return n; });
        setTimeout(() => setFeedback(''), 4000);
      }
    } catch { setFeedback('❌ Erreur technique'); }
  };

  const sortedTickets = [...tickets].sort((a, b) => {
    if (sortBy === 'newest') return b.id - a.id;
    if (sortBy === 'oldest') return a.id - b.id;
    if (sortBy === 'resolver') return (a.resolved_by || 'ZZZ').localeCompare(b.resolved_by || 'ZZZ');
    return 0;
  });

  const getLeaderboard = () => {
    const counts = {};
    tickets.forEach(t => { if (t.status === 'Closed' && t.resolved_by) counts[t.resolved_by] = (counts[t.resolved_by] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const leaderboard = getLeaderboard();
  const openCount = tickets.filter(t => t.status === 'Open').length;
  const closedCount = tickets.filter(t => t.status === 'Closed').length;
  const medals = ['🥇', '🥈', '🥉'];

  const navItems = [
    { id: 'dashboard', label: 'Tickets', icon: '🎫' },
    { id: 'users', label: 'Utilisateurs', icon: '👥' },
    { id: 'ldap', label: 'Config LDAP', icon: '🔌' },
    { id: 'monitoring', label: 'Monitoring', icon: '📊' },
  ];

  return (
    <div className="admin-layout">
      <div className="sidebar">
        <div className="sidebar-brand">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#3b82f6"/>
            <path d="M14 18h20M14 24h12M14 30h16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span>HelpDesk IT</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{auth?.username?.[0]?.toUpperCase()}</div>
          <div>
            <div className="sidebar-username">{auth?.username}</div>
            <div className="sidebar-role">Administrateur</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <button className="btn btn-danger btn-full sidebar-logout" onClick={() => { localStorage.removeItem('userSession'); setAuth(null); navigate('/'); }}>
          Déconnexion
        </button>
      </div>

      <div className="main-content">
        {activeTab === 'dashboard' && (
          <>
            <div className="page-header">
              <h2>Gestion des Incidents</h2>
            </div>

            {feedback && <div className={`alert ${feedback.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{feedback}</div>}

            <div className="stats-row">
              <div className="stat-card stat-blue">
                <div className="stat-number">{tickets.length}</div>
                <div className="stat-label">Total tickets</div>
              </div>
              <div className="stat-card stat-red">
                <div className="stat-number">{openCount}</div>
                <div className="stat-label">Ouverts</div>
              </div>
              <div className="stat-card stat-green">
                <div className="stat-number">{closedCount}</div>
                <div className="stat-label">Résolus</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 className="card-title">🏆 Classement des Techniciens</h3>
              {leaderboard.length === 0 ? (
                <p className="text-muted">Fermez un ticket pour activer le classement.</p>
              ) : (
                <div className="leaderboard">
                  {leaderboard.map(([adminName, count], index) => (
                    <div key={adminName} className="leaderboard-item">
                      <span>{medals[index] || '🔹'} <strong>{adminName}</strong></span>
                      <span className="badge badge-closed">{count} ticket(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-toolbar">
                <h3 className="card-title" style={{ margin: 0 }}>Tous les tickets</h3>
                <div className="sort-control">
                  <label>Trier par :</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="newest">Plus récents</option>
                    <option value="oldest">Plus anciens</option>
                    <option value="resolver">Par technicien</option>
                  </select>
                </div>
              </div>
              <table>
                <thead>
                  <tr><th>#</th><th>Détails</th><th>Déclarant</th><th>Statut</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {sortedTickets.map(t => (
                    <tr key={t.id}>
                      <td className="text-muted">#{t.id}</td>
                      <td><strong>{t.title}</strong><br /><small className="text-muted">{t.description}</small></td>
                      <td><span className="badge badge-user">{t.username || 'Inconnu'}</span></td>
                      <td><span className={`badge ${t.status === 'Open' ? 'badge-open' : 'badge-closed'}`}>{t.status === 'Open' ? 'Ouvert' : 'Résolu'}</span></td>
                      <td>
                        {t.status === 'Open' ? (
                          <div className="resolve-cell">
                            <textarea
                              placeholder="Rapport d'intervention..."
                              value={reportTexts[t.id] || ''}
                              onChange={(e) => setReportTexts({ ...reportTexts, [t.id]: e.target.value })}
                            />
                            <button className="btn btn-sm btn-success" onClick={() => handleFinalizeTicket(t.id)}>✓ Résoudre</button>
                          </div>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.85em' }}>
                            ✅ Clos par <strong>{t.resolved_by || 'Inconnu'}</strong> : {t.admin_report}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {activeTab === 'users' && (
          <>
            <div className="page-header"><h2>Gestion des Utilisateurs</h2></div>
            <GestionUtilisateurs />
          </>
        )}
        {activeTab === 'ldap' && (
          <>
            <div className="page-header"><h2>Configuration LDAP / Active Directory</h2></div>
            <ParametresLDAP />
          </>
        )}
        {activeTab === 'monitoring' && (
          <>
            <div className="page-header"><h2>Monitoring & Qualité</h2></div>
            <MonitoringPanel />
          </>
        )}
      </div>
    </div>
  );
}

// --- APP ---
export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('userSession');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (auth) localStorage.setItem('userSession', JSON.stringify(auth));
  }, [auth]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={!auth ? <Login setAuth={setAuth} /> : <Navigate to={auth.role === 'admin' ? '/admin' : '/user'} />} />
        <Route path="/admin" element={auth?.role === 'admin' ? <AdminDashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/" />} />
        <Route path="/user" element={auth ? <UserDashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
