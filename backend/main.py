from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import os
from ldap3 import Server, Connection, ALL
from ldap3.core.exceptions import LDAPException
from typing import Optional
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(title="Ticketing API")

# Expose /metrics endpoint for Prometheus scraping
Instrumentator().instrument(app).expose(app)

# Configuration CORS pour Kubernetes (Ports 30000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:30000",
        "http://127.0.0.1:30000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration Base de Données
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "ticket_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASSWORD", "postgres")

# Configuration LDAP
LDAP_SERVER_URL = os.getenv("LDAP_SERVER_URL", "")
LDAP_BASE_DN = os.getenv("LDAP_BASE_DN", "")

def get_db_connection():
    return psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS)

# --- SCHÉMAS ---
class LoginData(BaseModel):
    username: str
    password: str

class TicketCreate(BaseModel):
    title: str
    description: str
    username: str

class TicketUpdate(BaseModel):
    status: str
    admin_report: Optional[str] = None
    resolved_by: Optional[str] = None

class RoleAssignment(BaseModel):
    username: str
    role: str

class LDAPConfig(BaseModel):
    server_url: str
    base_dn: str
    bind_dn: str
    password: str

# --- AUTHENTIFICATION ---
ADMIN_USER = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "")

@app.post("/api/auth/login")
def login(data: LoginData):
    if ADMIN_USER and data.username == ADMIN_USER and data.password == ADMIN_PASS:
        return {"username": ADMIN_USER, "role": "admin"}
    
    raw_dn = LDAP_BASE_DN.lower()
    domain_parts = [p.replace('dc=', '').strip() for p in raw_dn.split(',') if p.strip().startswith('dc=')]
    upn_domain = ".".join(domain_parts) if domain_parts else "sotupa.local"
    short_domain = domain_parts[0] if domain_parts else "sotupa"

    candidates = [
        f"cn={data.username},ou=users,{LDAP_BASE_DN}",
        f"cn={data.username},{LDAP_BASE_DN}",
        f"{data.username}@{upn_domain}",
        f"{short_domain}\\{data.username}",
        data.username
    ]

    try:
        server = Server(LDAP_SERVER_URL, get_info=ALL, connect_timeout=3)
        bound = False

        for user_format in candidates:
            try:
                conn_ldap = Connection(server, user=user_format, password=data.password, auto_bind=True, receive_timeout=3)
                conn_ldap.unbind()
                bound = True
                break
            except LDAPException:
                continue

        if not bound:
            raise HTTPException(status_code=401, detail="Identifiants Active Directory invalides")

        role = "user"
        try:
            conn_db = get_db_connection()
            cur = conn_db.cursor()
            cur.execute("SELECT role FROM user_roles WHERE username = %s;", (data.username,))
            res = cur.fetchone()
            if res:
                role = res[0]
            cur.close()
            conn_db.close()
        except Exception:  # noqa: BLE001
            pass

        return {"username": data.username, "role": role}

    except HTTPException:
        raise
    except LDAPException as e:
        raise HTTPException(status_code=401, detail="Authentification échouée") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Erreur interne du serveur") from e

# --- GESTION DES TICKETS ET RAPPORTS ---
@app.get("/api/tickets")
def get_tickets(username: Optional[str] = None):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Requête sécurisée avec toutes les colonnes nécessaires
        query = "SELECT id, title, status, description, username, admin_report, resolved_by FROM tickets"
        
        if username:
            cur.execute(query + " WHERE username ILIKE %s ORDER BY id DESC;", (username,))
        else:
            cur.execute(query + " ORDER BY id DESC;")
        
        tickets = cur.fetchall()
        return [
            {
                "id": t[0], "title": t[1], "status": t[2], "description": t[3], 
                "username": t[4], "admin_report": t[5], "resolved_by": t[6]
            } 
            for t in tickets
        ]
    except Exception:  # noqa: BLE001
        return []
    finally:
        if conn: conn.close()

@app.post("/api/tickets")
def create_ticket(data: TicketCreate):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tickets (title, description, status, username) VALUES (%s, %s, %s, %s) RETURNING id;",
            (data.title, data.description, 'Open', data.username)
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        return {"id": new_id, "message": "Succès"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de la création du ticket") from e
    finally:
        if conn:
            conn.close()

@app.put("/api/tickets/{ticket_id}")
def update_ticket(ticket_id: int, data: TicketUpdate):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE tickets SET status = %s, admin_report = %s, resolved_by = %s WHERE id = %s RETURNING id;",
            (data.status, data.admin_report, data.resolved_by, ticket_id)
        )
        conn.commit()
        return {"message": "Mise à jour réussie"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du ticket") from e
    finally:
        if conn:
            conn.close()

# --- GESTION DES UTILISATEURS AD ET RÔLES ---
@app.get("/api/ad/users")
def list_ad_users():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT username FROM tickets WHERE username IS NOT NULL UNION SELECT username FROM user_roles WHERE username IS NOT NULL;")
        users = [{"username": row[0]} for row in cur.fetchall()]
        conn.close()
        return users
    except Exception:  # noqa: BLE001
        return []

@app.post("/api/admin/assign-role")
def assign_role(data: RoleAssignment):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO user_roles (username, role) VALUES (%s, %s) ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role;",
            (data.username, data.role)
        )
        conn.commit()
        return {"message": f"Rôle {data.role} assigné à {data.username}"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de l'assignation du rôle") from e
    finally:
        if conn:
            conn.close()

# --- TEST DE CONNEXION LDAP ---
@app.post("/api/ldap/test")
def test_ldap_connection(config: LDAPConfig):
    try:
        server = Server(config.server_url, get_info=ALL, connect_timeout=3)
        conn = Connection(server, user=config.bind_dn, password=config.password, auto_bind=True, receive_timeout=3)
        conn.unbind() 
        return {"status": "success", "message": "✅ Connexion réussie !"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Connexion LDAP échouée") from e