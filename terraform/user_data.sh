#!/bin/bash
set -e

# ─── SYSTEM UPDATE ────────────────────────────────────────────────
apt-get update -y
apt-get install -y curl wget git

# ─── INSTALL k3s (lightweight Kubernetes) ────────────────────────
curl -sfL https://get.k3s.io | sh -

# Wait for k3s to be ready
sleep 20
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# ─── CREATE APP DIRECTORY ─────────────────────────────────────────
mkdir -p /opt/pfa-app/kubernetes

# ─── KUBERNETES MANIFESTS ─────────────────────────────────────────

# Database
cat > /opt/pfa-app/kubernetes/postgres-db.yaml << 'YAML'
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init-sql
data:
  init.sql: |
    CREATE TABLE IF NOT EXISTS user_roles (username TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'Open', username TEXT, admin_report TEXT, resolved_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO user_roles (username, role) VALUES ('admin', 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO user_roles (username, role) VALUES ('dhia-it', 'admin') ON CONFLICT DO NOTHING;
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ticketing-db
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ticketing-db
  template:
    metadata:
      labels:
        app: ticketing-db
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: POSTGRES_DB
              value: ticket_db
            - name: POSTGRES_USER
              value: postgres
            - name: POSTGRES_PASSWORD
              value: postgres
          ports:
            - containerPort: 5432
          volumeMounts:
            - mountPath: /var/lib/postgresql/data
              name: postgres-storage
            - mountPath: /docker-entrypoint-initdb.d/init.sql
              subPath: init.sql
              name: init-sql
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
        - name: init-sql
          configMap:
            name: postgres-init-sql
---
apiVersion: v1
kind: Service
metadata:
  name: db-service
spec:
  selector:
    app: ticketing-db
  ports:
    - port: 5432
      targetPort: 5432
YAML

# Backend
cat > /opt/pfa-app/kubernetes/backend-api.yaml << YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ticketing-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ticketing-backend
  template:
    metadata:
      labels:
        app: ticketing-backend
    spec:
      containers:
        - name: backend
          image: ${dockerhub_username}/my-ticketing-backend:latest
          imagePullPolicy: Always
          env:
            - name: DB_HOST
              value: "db-service"
            - name: DB_NAME
              value: "ticket_db"
            - name: DB_USER
              value: "postgres"
            - name: DB_PASSWORD
              value: "postgres"
            - name: LDAP_SERVER_URL
              value: "${ldap_server_url}"
            - name: LDAP_BASE_DN
              value: "${ldap_base_dn}"
          ports:
            - containerPort: 8000
---
apiVersion: v1
kind: Service
metadata:
  name: backend-service
spec:
  type: NodePort
  selector:
    app: ticketing-backend
  ports:
    - port: 8000
      targetPort: 8000
      nodePort: 30001
YAML

# Frontend
cat > /opt/pfa-app/kubernetes/frontend-ui.yaml << YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ticketing-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ticketing-frontend
  template:
    metadata:
      labels:
        app: ticketing-frontend
    spec:
      containers:
        - name: frontend
          image: ${dockerhub_username}/my-ticketing-frontend:latest
          imagePullPolicy: Always
          env:
            - name: BACKEND_HOST
              value: "backend-service"
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
spec:
  type: NodePort
  selector:
    app: ticketing-frontend
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30000
YAML

# ─── DEPLOY TO k3s ────────────────────────────────────────────────
kubectl apply -f /opt/pfa-app/kubernetes/postgres-db.yaml
kubectl apply -f /opt/pfa-app/kubernetes/backend-api.yaml
kubectl apply -f /opt/pfa-app/kubernetes/frontend-ui.yaml

# ─── WAIT FOR PODS ────────────────────────────────────────────────
kubectl rollout status deployment/ticketing-db --timeout=120s || true
kubectl rollout status deployment/ticketing-backend --timeout=120s || true
kubectl rollout status deployment/ticketing-frontend --timeout=120s || true

echo "✅ PFA Ticketing App deployed successfully on k3s!"
echo "🌐 Access the app at: http://$(curl -s ifconfig.me):30000"
