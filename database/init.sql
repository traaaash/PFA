-- Table des utilisateurs (pour gérer les rôles locaux)
CREATE TABLE IF NOT EXISTS user_roles (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'user'
);

-- Table des tickets (avec toutes les colonnes nécessaires à votre Backend)
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Open',
    username TEXT, -- Le déclarant (via LDAP)
    admin_report TEXT,
    resolved_by TEXT, -- Qui a traité le ticket
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertion de données de test (optionnel)
INSERT INTO user_roles (username, role) VALUES ('admin', 'admin') ON CONFLICT DO NOTHING;