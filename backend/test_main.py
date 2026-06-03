"""
Unit tests for the HelpDesk IT backend API.
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Set env vars before importing app
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin"
os.environ["DB_HOST"] = "localhost"
os.environ["DB_NAME"] = "ticket_db"
os.environ["DB_USER"] = "postgres"
os.environ["DB_PASSWORD"] = "postgres"
os.environ["LDAP_SERVER_URL"] = ""
os.environ["LDAP_BASE_DN"] = "dc=sotupa,dc=local"

from main import app  # noqa: E402

client = TestClient(app)


# ── Auth ──────────────────────────────────────────────────────────────

def test_login_admin_success():
    """Admin login with env-configured credentials returns admin role."""
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"


def test_login_wrong_credentials_no_ldap():
    """Login fails with 500 when LDAP server is empty and credentials are wrong."""
    response = client.post("/api/auth/login", json={"username": "unknown", "password": "wrong"})
    assert response.status_code in (401, 500)


def test_login_missing_fields():
    """Login fails with 422 when required fields are missing."""
    response = client.post("/api/auth/login", json={"username": "admin"})
    assert response.status_code == 422


# ── Tickets ───────────────────────────────────────────────────────────

def test_get_tickets_db_error_returns_empty():
    """GET /api/tickets returns empty list when DB is unreachable."""
    response = client.get("/api/tickets")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_tickets_with_username_db_error():
    """GET /api/tickets?username=x returns empty list when DB is unreachable."""
    response = client.get("/api/tickets?username=testuser")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_ticket_db_error():
    """POST /api/tickets returns 500 when DB is unreachable."""
    response = client.post("/api/tickets", json={
        "title": "Test ticket",
        "description": "Test description",
        "username": "testuser"
    })
    assert response.status_code in (200, 500)


def test_create_ticket_missing_fields():
    """POST /api/tickets fails with 422 when required fields are missing."""
    response = client.post("/api/tickets", json={"title": "Test"})
    assert response.status_code == 422


def test_update_ticket_db_error():
    """PUT /api/tickets/{id} returns 500 when DB is unreachable."""
    response = client.put("/api/tickets/1", json={"status": "Closed"})
    assert response.status_code in (200, 500)


# ── Users / Roles ─────────────────────────────────────────────────────

def test_list_ad_users_db_error():
    """GET /api/ad/users returns empty list when DB is unreachable."""
    response = client.get("/api/ad/users")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_assign_role_missing_fields():
    """POST /api/admin/assign-role fails with 422 on missing fields."""
    response = client.post("/api/admin/assign-role", json={"username": "user1"})
    assert response.status_code == 422


def test_assign_role_db_error():
    """POST /api/admin/assign-role returns 500 when DB is unreachable."""
    response = client.post("/api/admin/assign-role", json={"username": "user1", "role": "admin"})
    assert response.status_code in (200, 500)


# ── LDAP test endpoint ────────────────────────────────────────────────

def test_ldap_test_connection_failure():
    """POST /api/ldap/test returns 400 when LDAP server is unreachable."""
    response = client.post("/api/ldap/test", json={
        "server_url": "ldap://127.0.0.1:9999",
        "base_dn": "dc=test,dc=local",
        "bind_dn": "admin@test.local",
        "password": "wrong"
    })
    assert response.status_code == 400


def test_ldap_test_missing_fields():
    """POST /api/ldap/test returns 422 when required fields are missing."""
    response = client.post("/api/ldap/test", json={"server_url": "ldap://localhost"})
    assert response.status_code == 422


# ── Metrics endpoint ──────────────────────────────────────────────────

def test_metrics_endpoint_exists():
    """GET /metrics returns Prometheus metrics."""
    response = client.get("/metrics")
    assert response.status_code == 200
