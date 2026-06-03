"""
Unit tests for the HelpDesk IT backend API.
"""
import os
import pytest
from unittest.mock import patch, MagicMock, call
from fastapi.testclient import TestClient

# Set env vars before importing app
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin"
os.environ["DB_HOST"] = "localhost"
os.environ["DB_NAME"] = "ticket_db"
os.environ["DB_USER"] = "postgres"
os.environ["DB_PASSWORD"] = "postgres"
os.environ["LDAP_SERVER_URL"] = "ldap://localhost:389"
os.environ["LDAP_BASE_DN"] = "dc=sotupa,dc=local"

from main import app  # noqa: E402

client = TestClient(app)


def make_mock_conn(rows=None, fetchone_val=None):
    """Helper: returns a mock psycopg2 connection."""
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = rows or []
    mock_cur.fetchone.return_value = fetchone_val
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cur
    return mock_conn, mock_cur


# ── Auth ──────────────────────────────────────────────────────────────

def test_login_admin_success():
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_login_admin_wrong_password():
    response = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    # Falls through to LDAP path
    assert response.status_code in (401, 500)


def test_login_missing_fields():
    response = client.post("/api/auth/login", json={"username": "admin"})
    assert response.status_code == 422


def test_login_ldap_success_user_role():
    """LDAP bind succeeds, user has no DB role → returns 'user'."""
    mock_conn, mock_cur = make_mock_conn(fetchone_val=None)
    mock_ldap_conn = MagicMock()

    with patch("main.Connection", return_value=mock_ldap_conn) as mock_conn_cls, \
         patch("main.get_db_connection", return_value=mock_conn):
        mock_ldap_conn.auto_bind = True
        response = client.post("/api/auth/login", json={"username": "alice", "password": "pass"})

    assert response.status_code == 200
    assert response.json()["role"] == "user"


def test_login_ldap_success_admin_role_from_db():
    """LDAP bind succeeds, DB returns 'admin' role for the user."""
    mock_conn, mock_cur = make_mock_conn(fetchone_val=("admin",))
    mock_ldap_conn = MagicMock()

    with patch("main.Connection", return_value=mock_ldap_conn), \
         patch("main.get_db_connection", return_value=mock_conn):
        response = client.post("/api/auth/login", json={"username": "alice", "password": "pass"})

    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_login_ldap_all_candidates_fail():
    """All LDAP bind candidates fail → 401."""
    from ldap3.core.exceptions import LDAPException
    with patch("main.Connection", side_effect=LDAPException("failed")):
        response = client.post("/api/auth/login", json={"username": "nobody", "password": "wrong"})
    assert response.status_code == 401


# ── Tickets ───────────────────────────────────────────────────────────

def test_get_all_tickets_success():
    rows = [(1, "VPN issue", "Open", "Cannot connect", "alice", None, None)]
    mock_conn, _ = make_mock_conn(rows=rows)
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.get("/api/tickets")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "VPN issue"


def test_get_tickets_filtered_by_username():
    rows = [(2, "Mouse broken", "Open", "USB mouse not working", "bob", None, None)]
    mock_conn, _ = make_mock_conn(rows=rows)
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.get("/api/tickets?username=bob")
    assert response.status_code == 200
    assert response.json()[0]["username"] == "bob"


def test_get_tickets_db_error_returns_empty():
    with patch("main.get_db_connection", side_effect=Exception("DB down")):
        response = client.get("/api/tickets")
    assert response.status_code == 200
    assert response.json() == []


def test_create_ticket_success():
    mock_conn, mock_cur = make_mock_conn(fetchone_val=(42,))
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.post("/api/tickets", json={
            "title": "Printer issue",
            "description": "Printer offline",
            "username": "carol"
        })
    assert response.status_code == 200
    assert response.json()["id"] == 42


def test_create_ticket_db_error():
    with patch("main.get_db_connection", side_effect=Exception("DB down")):
        response = client.post("/api/tickets", json={
            "title": "Test", "description": "Desc", "username": "user"
        })
    assert response.status_code == 500


def test_create_ticket_missing_fields():
    response = client.post("/api/tickets", json={"title": "Test"})
    assert response.status_code == 422


def test_update_ticket_success():
    mock_conn, mock_cur = make_mock_conn(fetchone_val=(1,))
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.put("/api/tickets/1", json={
            "status": "Closed",
            "admin_report": "Fixed the issue",
            "resolved_by": "admin"
        })
    assert response.status_code == 200


def test_update_ticket_db_error():
    with patch("main.get_db_connection", side_effect=Exception("DB down")):
        response = client.put("/api/tickets/1", json={"status": "Closed"})
    assert response.status_code == 500


# ── Users / Roles ─────────────────────────────────────────────────────

def test_list_ad_users_success():
    mock_conn, _ = make_mock_conn(rows=[("alice",), ("bob",)])
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.get("/api/ad/users")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_ad_users_db_error():
    with patch("main.get_db_connection", side_effect=Exception("DB down")):
        response = client.get("/api/ad/users")
    assert response.status_code == 200
    assert response.json() == []


def test_assign_role_success():
    mock_conn, _ = make_mock_conn()
    with patch("main.get_db_connection", return_value=mock_conn):
        response = client.post("/api/admin/assign-role", json={"username": "alice", "role": "admin"})
    assert response.status_code == 200
    assert "admin" in response.json()["message"]


def test_assign_role_db_error():
    with patch("main.get_db_connection", side_effect=Exception("DB down")):
        response = client.post("/api/admin/assign-role", json={"username": "alice", "role": "admin"})
    assert response.status_code == 500


def test_assign_role_missing_fields():
    response = client.post("/api/admin/assign-role", json={"username": "alice"})
    assert response.status_code == 422


# ── LDAP test endpoint ────────────────────────────────────────────────

def test_ldap_test_connection_success():
    mock_ldap_conn = MagicMock()
    with patch("main.Connection", return_value=mock_ldap_conn):
        response = client.post("/api/ldap/test", json={
            "server_url": "ldap://localhost:389",
            "base_dn": "dc=test,dc=local",
            "bind_dn": "admin@test.local",
            "password": "pass"
        })
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_ldap_test_connection_failure():
    with patch("main.Connection", side_effect=Exception("Connection refused")):
        response = client.post("/api/ldap/test", json={
            "server_url": "ldap://127.0.0.1:9999",
            "base_dn": "dc=test,dc=local",
            "bind_dn": "admin@test.local",
            "password": "wrong"
        })
    assert response.status_code == 400


def test_ldap_test_missing_fields():
    response = client.post("/api/ldap/test", json={"server_url": "ldap://localhost"})
    assert response.status_code == 422


# ── Metrics endpoint ──────────────────────────────────────────────────

def test_metrics_endpoint_exists():
    response = client.get("/metrics")
    assert response.status_code == 200
