from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import os
from ldap3 import Server, Connection, ALL
from ldap3.core.exceptions import LDAPException
from typing import List, Optional

app = FastAPI(title="Ticketing API")

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

# Configuration DB
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
@app.post("/api/auth/login")
def login(data: LoginData):
    if data.username == "admin" and data.password == "admin":
        return {"username": "admin", "role": "admin"}
    if data.username == "user" and data.password == "user":
        return {"username": "user", "role": "user"}
    
    raw_dn = LDAP_BASE_DN.lower()
    domain_parts = [p.replace('dc=', '').strip() for p in raw_dn.split(',') if p.strip().startswith('dc=')]
    upn_domain = ".".join(domain_parts) if domain_parts else "sotupa.local"
    short_domain = domain_parts[0] if domain_parts else "sotupa"

    candidates = [
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
        except:
            pass
            
        return {"username": data.username, "role": role}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- GESTION DES TICKETS ET RAPPORTS ---
@app.get("/api/tickets")
def get_tickets(username: Optional[str] = None):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # On récupère les colonnes incluant la date (created_at formaté)
        query = "SELECT id, title, status, description, username, admin_report, resolved_by, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') FROM tickets"
        
        if username:
            cur.execute(f"{query} WHERE username ILIKE %s ORDER BY id DESC;", (username,))
        else:
            cur.execute(f"{query} ORDER BY id DESC;")
        
        tickets = cur.fetchall()
        return [
            {
                "id": t[0], "title": t[1], "status": t[2], "description": t[3], 
                "username": t[4], "admin_report": t[5], "resolved_by": t[6], 
                "created_at": t[7] or "Date inconnue"
            } 
            for t in tickets
        ]
    except Exception as e:
        print(f"Erreur DB: {e}")
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
    except Exception:
        return []