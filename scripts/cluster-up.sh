#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

CLUSTER_NAME=flotilla
KUBE_CONTEXT=kind-flotilla
NAMESPACE=flotilla
SERVICES=(auth-service inventory-service stats-service)
IMAGE_TAG=dev

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

k() { kubectl --context "$KUBE_CONTEXT" "$@"; }
h() { helm --kube-context "$KUBE_CONTEXT" "$@"; }

# --- Step 1: Check required tools ---
echo "[1/9] Checking required tools..."
for tool in docker kind kubectl helm openssl; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: required tool not found: ${tool}"
    exit 1
  fi
done
if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running or not accessible"
  exit 1
fi
docker --version
kind version
kubectl version --client
helm version
openssl version

# --- Step 2: Create the kind cluster if it does not already exist ---
echo ""
echo "[2/9] Checking kind cluster '${CLUSTER_NAME}'..."
if kind get clusters 2>/dev/null | grep -Fxq "$CLUSTER_NAME"; then
  echo "  Cluster '${CLUSTER_NAME}' already exists, reusing it."
else
  echo "  Creating cluster '${CLUSTER_NAME}'..."
  kind create cluster --config "${REPO_ROOT}/kind/cluster.yaml"
fi

# --- Step 3: Context guard ---
echo ""
echo "[3/9] Verifying kubectl context '${KUBE_CONTEXT}'..."
if ! kubectl config get-contexts -o name | grep -Fx "$KUBE_CONTEXT" >/dev/null; then
  echo "ERROR: kubectl context '${KUBE_CONTEXT}' not found"
  echo "       Has the cluster been created? Run: kind create cluster --config kind/cluster.yaml"
  exit 1
fi
if ! k get node flotilla-control-plane &>/dev/null; then
  echo "ERROR: expected node 'flotilla-control-plane' not found in context '${KUBE_CONTEXT}'"
  exit 1
fi
echo "  Context '${KUBE_CONTEXT}' is valid."

# --- Step 4: StorageClass check ---
echo ""
echo "[4/9] Checking default StorageClass..."
if ! k get storageclass 2>/dev/null | grep -Fq "(default)"; then
  echo "ERROR: no default StorageClass found in cluster '${CLUSTER_NAME}'"
  echo "       A default StorageClass is required for PostgreSQL persistent storage."
  exit 1
fi
echo "  Default StorageClass found."

# --- Step 5: Install metrics-server ---
echo ""
echo "[5/9] Installing metrics-server..."
if ! helm repo list 2>/dev/null | grep -Fq "metrics-server"; then
  helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
fi
helm repo update metrics-server
h upgrade --install metrics-server metrics-server/metrics-server \
  --version 3.14.0 \
  -n kube-system \
  --set 'args={--kubelet-insecure-tls}' \
  --wait

# --- Step 6: Build and load Docker images ---
echo ""
echo "[6/9] Building and loading Docker images..."
for service in "${SERVICES[@]}"; do
  image="local/flotilla-${service}:${IMAGE_TAG}"
  echo "  Building ${image}..."
  docker build -t "$image" "${REPO_ROOT}/services/${service}"
  echo "  Loading ${image} into kind cluster '${CLUSTER_NAME}'..."
  kind load docker-image "$image" --name "$CLUSTER_NAME"
done

# --- Step 7: Create namespace ---
echo ""
echo "[7/9] Creating namespace '${NAMESPACE}'..."
if ! k get namespace "$NAMESPACE" &>/dev/null; then
  k create namespace "$NAMESPACE"
  echo "  Namespace '${NAMESPACE}' created."
else
  echo "  Namespace '${NAMESPACE}' already exists."
fi

# --- Step 8: Create Secret ---
echo ""
echo "[8/9] Creating secret 'flotilla-secrets'..."
if ! k get secret flotilla-secrets -n "$NAMESPACE" &>/dev/null; then
  k create secret generic flotilla-secrets \
    -n "$NAMESPACE" \
    --from-literal=postgres-password="$(openssl rand -hex 24)" \
    --from-literal=api-token="$(openssl rand -hex 24)"
  echo "  Secret 'flotilla-secrets' created."
else
  echo "  Secret 'flotilla-secrets' already exists, keeping existing values."
fi

# --- Step 9: Summary ---
echo ""
echo "[9/9] Cluster is ready."
echo ""
echo "  URL: http://localhost:8080"
echo ""
echo "  Read the API token:"
echo "    kubectl --context kind-flotilla -n flotilla get secret flotilla-secrets -o jsonpath='{.data.api-token}' | base64 -d"
echo ""
echo "  Delete the cluster:"
echo "    kind delete cluster --name flotilla"
