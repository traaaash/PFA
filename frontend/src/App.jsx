import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

// --- COMPOSANT LOGIN ---
function Login({ setAuth }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (response.ok) {
        const data = await response.json();
        setAuth(data); 
        navigate(data.role === 'admin' ? '/admin' : '/user');
      } else {
        alert("Identifiants incorrects");
      }
    } catch (error) {
      alert("❌ Impossible de joindre le serveur.");
    }
  };

  return (
    <div className="container">
      <h2 style={{textAlign: 'center'}}>Connexion Active Directory</h2>
      <form className="login-form" onSubmit={handleLogin}>
        <input type="text" placeholder="Nom d'utilisateur" value={username} onChange={e => setUsername(e.target.value)} required />
        <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required />
        <button className="btn" type="submit">Se connecter</button>
      </form>
    </div>
  );
}

// --- VUE GESTION UTILISATEURS ---
function GestionUtilisateurs() {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState('admin');

  const fetchUsers = () => {
    fetch('http://localhost:8000/api/ad/users')
      .then(res => res.json())
      .then(data => setUsers(data.filter(u => u.username))) 
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (username, role) => {
    if (!username) return;
    try {
      const res = await fetch('http://localhost:8000/api/admin/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role })
      });
      if (res.ok) {
        alert(`Rôle ${role} assigné à ${username} avec succès !`);
        setNewUser('');
        fetchUsers();
      }
    } catch (err) {
      alert("Erreur lors du changement de rôle");
    }
  };

  return (
    <div>
      <div className="table-container" style={{ marginBottom: '20px' }}>
        <h3>Assigner un rôle manuellement</h3>
        <p style={{fontSize:'0.9em', color:'#666', marginBottom:'10px'}}>
          Permet de donner des droits à un utilisateur de l'Active Directory.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Nom d'utilisateur AD (ex: nasser)" 
            value={newUser} 
            onChange={(e) => setNewUser(e.target.value)} 
            style={{ padding: '8px', flex: '1', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
            <option value="admin">Administrateur</option>
            <option value="user">Utilisateur Simple</option>
          </select>
          <button className="btn btn-action" onClick={() => handleRoleChange(newUser, newRole)}>Assigner</button>
        </div>
      </div>

      <div className="table-container">
        <h3>Utilisateurs connus de l'application</h3>
        <table>
          <thead><tr><th>Utilisateur AD</th><th>Action</th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="2" style={{textAlign:'center'}}>Aucun utilisateur enregistré.</td></tr>
            ) : (
              users.map((u, index) => (
                <tr key={index}>
                  <td><strong>{u.username}</strong></td>
                  <td style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-action" onClick={() => handleRoleChange(u.username, 'admin')}>Promouvoir Admin</button>
                    <button className="btn" style={{backgroundColor: '#ef4444'}} onClick={() => handleRoleChange(u.username, 'user')}>Retirer Admin</button>
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

  const handleTestLDAP = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/ldap/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_url: serverUrl, base_dn: baseDn, bind_dn: bindDn, password: password })
      });
      const data = await response.json();
      alert(response.ok ? data.message : "❌ Erreur : " + data.detail);
    } catch (error) {
      alert("❌ Erreur de connexion au backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="table-container" style={{ maxWidth: '600px' }}>
      <h3>Configuration Active Directory (LDAP)</h3>
      <div className="login-form">
        <input type="text" placeholder="Serveur" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
        <input type="text" placeholder="Base DN" value={baseDn} onChange={e => setBaseDn(e.target.value)} />
        <input type="text" placeholder="Bind DN (UPN)" value={bindDn} onChange={e => setBindDn(e.target.value)} />
        <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
        <button className="btn" onClick={handleTestLDAP} disabled={loading}>{loading ? 'Test...' : 'Tester la connexion'}</button>
      </div>
    </div>
  );
}

// --- DASHBOARD UTILISATEUR ---
function UserDashboard({ auth, setAuth }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tickets, setTickets] = useState([]);
  const navigate = useNavigate();

  const fetchTickets = () => {
    if (!auth) return;
    fetch(`http://localhost:8000/api/tickets?username=${auth.username}`)
      .then(res => res.json())
      .then(data => setTickets(data))
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchTickets(); }, [auth]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: desc, username: auth.username })
      });
      if (res.ok) {
        alert("✅ Ticket créé avec succès !");
        setTitle(''); setDesc(''); fetchTickets();
      }
    } catch (err) {
      alert("❌ Serveur injoignable.");
    }
  };

  return (
    <div className="main-content">
      <div className="header">
        <h2>Espace Support - Bienvenue {auth?.username}</h2>
        <button className="btn btn-logout" onClick={() => {localStorage.removeItem('userSession'); setAuth(null); navigate('/');}}>Déconnexion</button>
      </div>
      <div className="stats-grid" style={{marginTop: '20px'}}>
        <div className="stat-card">
          <h3>Ouvrir un ticket</h3>
          <form onSubmit={handleCreateTicket} className="login-form">
            <input type="text" placeholder="Sujet" value={title} onChange={e => setTitle(e.target.value)} required />
            <textarea placeholder="Décrivez votre problème..." value={desc} onChange={e => setDesc(e.target.value)} style={{width:'100%', height:'60px', padding:'10px'}} required />
            <button className="btn" type="submit">Envoyer la demande</button>
          </form>
        </div>
      </div>
      <div className="table-container" style={{marginTop: '20px'}}>
        <h3>Mes Demandes</h3>
        <table>
          <thead><tr><th>Date</th><th>Sujet</th><th>Statut</th><th>Détails</th></tr></thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id}>
                <td style={{fontSize:'0.8em', color:'#666'}}>{t.created_at}</td>
                <td>{t.title}</td>
                <td><span className={`badge ${t.status === 'Open' ? 'badge-open' : 'badge-closed'}`}>{t.status}</span></td>
                <td style={{fontSize:'0.85em', color:'#555'}}>
                  {t.status === 'Closed' ? (
                    <span><strong>Traité par {t.resolved_by || 'Admin'} :</strong> {t.admin_report}</span>
                  ) : "En attente de traitement..."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- DASHBOARD ADMIN AVEC LEADERBOARD ET TRI ---
function AdminDashboard({ auth, setAuth }) {
  const [tickets, setTickets] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportTexts, setReportTexts] = useState({});
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'resolver'
  const navigate = useNavigate();

  const fetchTickets = () => {
    fetch('http://localhost:8000/api/tickets')
      .then(res => res.json()).then(data => setTickets(data));
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleFinalizeTicket = async (id) => {
    const report = reportTexts[id] || "";
    if (!report) return alert("Veuillez rédiger un rapport avant de clore.");

    try {
      const res = await fetch(`http://localhost:8000/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Closed', admin_report: report, resolved_by: auth.username })
      });
      if (res.ok) {
        fetchTickets();
      }
    } catch (err) {
      alert("Erreur technique");
    }
  };

  // Logique de tri
  const sortedTickets = [...tickets].sort((a, b) => {
    if (sortBy === 'newest') return b.id - a.id;
    if (sortBy === 'oldest') return a.id - b.id;
    if (sortBy === 'resolver') {
      const resA = a.resolved_by || 'ZZZ'; // Les non-résolus en bas
      const resB = b.resolved_by || 'ZZZ';
      return resA.localeCompare(resB);
    }
    return 0;
  });

  // Calcul du classement
  const getLeaderboard = () => {
    const counts = {};
    tickets.forEach(t => {
      if (t.status === 'Closed' && t.resolved_by) {
        counts[t.resolved_by] = (counts[t.resolved_by] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const leaderboard = getLeaderboard();

  return (
    <div className="admin-layout">
      <div className="sidebar">
        <h2>IT Admin</h2>
        <ul>
          <li className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Tickets</li>
          <li className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>Utilisateurs</li>
          <li className={activeTab === 'ldap' ? 'active' : ''} onClick={() => setActiveTab('ldap')}>LDAP</li>
        </ul>
        <button className="btn btn-logout" onClick={() => {localStorage.removeItem('userSession'); setAuth(null); navigate('/');}}>Déconnexion</button>
      </div>
      <div className="main-content">
        {activeTab === 'dashboard' && (
          <>
            {/* WIDGET LEADERBOARD (CLASSEMENT) */}
            <div className="stats-grid" style={{ marginBottom: '20px' }}>
              <div className="stat-card" style={{ backgroundColor: '#f8fafc', borderLeft: '5px solid #fbbf24' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>🏆 Classement des Techniciens</h3>
                {leaderboard.length === 0 ? (
                  <p style={{ color: '#64748b', margin: 0 }}>Aucun ticket attribué pour le moment. Fermez un ticket pour activer le classement !</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {leaderboard.map(([adminName, count], index) => (
                      <li key={adminName} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '1.1em' }}>
                        <span>
                          {index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '🔹 '}
                          <strong>{adminName}</strong>
                        </span>
                        <span className="badge badge-closed">{count} ticket(s)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="table-container">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h3 style={{margin: 0}}>Gestion des Incidents</h3>
                
                {/* MENU DE TRI */}
                <div>
                  <label style={{marginRight: '10px', fontSize: '0.9em', color: '#64748b'}}>Trier par :</label>
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{padding: '5px', borderRadius: '4px', border: '1px solid #ccc'}}
                  >
                    <option value="newest">Plus récents d'abord</option>
                    <option value="oldest">Plus anciens d'abord</option>
                    <option value="resolver">Par Technicien (A-Z)</option>
                  </select>
                </div>
              </div>

              <table>
                <thead>
                  <tr><th>Date</th><th>Détails</th><th>Déclarant</th><th>Action / Rapport</th></tr>
                </thead>
                <tbody>
                  {sortedTickets.map(t => (
                    <tr key={t.id}>
                      <td style={{fontSize:'0.8em', color:'#666', width:'120px'}}>{t.created_at}</td>
                      <td><strong>{t.title}</strong><br/><small>{t.description}</small></td>
                      <td><span className="badge" style={{backgroundColor: '#e2e8f0', color: '#475569'}}>{t.username || "Inconnu"}</span></td>
                      <td>
                        {t.status === 'Open' ? (
                          <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                            <textarea 
                              placeholder="Rédiger le rapport d'intervention..."
                              value={reportTexts[t.id] || ''}
                              onChange={(e) => setReportTexts({...reportTexts, [t.id]: e.target.value})}
                              style={{width:'100%', height:'50px', fontSize:'0.8em', padding:'5px', borderRadius:'4px', border:'1px solid #ccc'}}
                            />
                            <button className="btn btn-action" onClick={() => handleFinalizeTicket(t.id)}>Résoudre & Clôturer</button>
                          </div>
                        ) : (
                          <span style={{color:'green', fontSize:'0.9em'}}>✅ Clos par <strong>{t.resolved_by || 'Inconnu'}</strong> : {t.admin_report}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {activeTab === 'users' && <GestionUtilisateurs />}
        {activeTab === 'ldap' && <ParametresLDAP />}
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
        <Route path="/" element={!auth ? <Login setAuth={setAuth} /> : <Navigate to={auth.role === 'admin' ? "/admin" : "/user"} />} />
        <Route path="/admin" element={auth?.role === 'admin' ? <AdminDashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/" />} />
        <Route path="/user" element={auth ? <UserDashboard auth={auth} setAuth={setAuth} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}