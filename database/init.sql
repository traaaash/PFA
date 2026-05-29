-- Création de la table pour gérer les rôles locaux (Séparation Auth AD / Autorisation locale)
CREATE TABLE IF NOT EXISTS user_roles (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'user'
);

-- Création de la table des tickets avec toute la traçabilité DevOps
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Open',
    username TEXT,             -- Le déclarant (récupéré depuis l'AD)
    admin_report TEXT,         -- Le rapport d'intervention
    resolved_by TEXT,          -- Le technicien qui a fermé le ticket
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertion du compte de secours et d'un rôle admin par défaut
INSERT INTO user_roles (username, role) VALUES ('admin', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO user_roles (username, role) VALUES ('dhia-it', 'admin') ON CONFLICT DO NOTHING;