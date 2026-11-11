 <a id="top"></a>
# Flotilla — Kubernetes Microservices & DevOps Project

**Kubernetes · Helm · Docker · Microservices · CI/CD · DevSecOps**

Flotilla is a Kubernetes-focused project that packages and deploys three Node.js microservices, an NGINX API gateway, and PostgreSQL using Docker, Helm, and kind.

The project demonstrates practical Kubernetes and DevOps workflows: reusable Helm templating, persistent storage, service-to-service communication, ingress NetworkPolicies, CPU-based autoscaling, container hardening, and automated end-to-end testing in GitHub Actions.

The application logic is intentionally small. The main focus is the infrastructure, deployment, security, and operational behavior around the services. Flotilla is a learning and portfolio project, not a production-ready platform.

## Architecture

```text
                         Developer / API Client
                                  |
                                  |
                         http://localhost:8080
                                  |
                                  v
                       +----------------------+
                       |   kind NodePort      |
                       |     Port 30080       |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       |    NGINX Gateway     |
                       |    2 replicas        |
                       |    Unprivileged      |
                       +----------+-----------+
                                  |
                    +--------------+--------------+
                    |                             |
           /api/inventory/*                /api/stats/*
                    |                             |
                    v                             v
        +----------------------+       +----------------------+
        |  Inventory Service   |<------|    Stats Service     |
        |  Node.js / Express   | GET   |   Node.js / Express  |
        |  HPA: 2-4 replicas   | /items|   HPA: 2-4 replicas   |
        +----------+-----------+       +----------------------+
                   |
           +--------+---------+
           |                  |
           | SQL :5432        | GET /validate
           |                  |
           v                  v
     +----------------+  +----------------------+
     |   PostgreSQL   |  |    Auth Service      |
     |   StatefulSet  |  |   Node.js / Express  |
     |   postgres-0   |  |   HPA: 2-4 replicas  |
     |   PVC: 1Gi     |  +----------------------+
     +----------------+

              Kubernetes Cluster: kind
```

### Architecture Overview

| Component | Responsibility | Reachable from |
|---|---|---|
| NGINX Gateway | Single HTTP entry point; routes inventory and statistics requests | Local host through kind NodePort |
| `auth-service` | Validates Bearer tokens | `inventory-service` only |
| `inventory-service` | Lists and creates inventory records; communicates with PostgreSQL | Gateway and `stats-service` |
| `stats-service` | Calculates total item count and total quantity | Gateway only |
| PostgreSQL | Stores inventory records persistently | `inventory-service` only |

The gateway is the only externally reachable application component in the local kind setup. It routes inventory and statistics requests to their respective services.

The Inventory Service validates write requests through the internal Auth Service and stores inventory records in PostgreSQL. The Stats Service obtains inventory data from the Inventory Service and calculates aggregate totals.

Ingress NetworkPolicies use a default-deny approach and explicitly allow the required service-to-service traffic. The Auth Service and PostgreSQL are not exposed through the gateway.

The three Node.js services run as Kubernetes Deployments and are configured with Horizontal Pod Autoscalers. The gateway runs with two replicas. PostgreSQL runs as a single-replica StatefulSet with a PersistentVolumeClaim.

## Technology Stack

| Category | Technology | Version / Notes |
|---|---|---|
| Runtime | Node.js | 26.13.0 |
| Application framework | Express | 5.3.0 |
| PostgreSQL client | `pg` / node-postgres | 8.23.1 |
| Database | PostgreSQL | 18.6-alpine3.24 |
| API gateway | NGINX Unprivileged | 1.31.7-alpine |
| Containerization | Docker | Alpine-based production images |
| Local Kubernetes | kind | v0.33.0 |
| Kubernetes node image | kindest/node | v1.37.0 |
| Kubernetes CLI | kubectl | v1.37.1 |
| Package manager | Helm | v4.3.1 |
| Local test image | BusyBox | 1.38.0 |
| CI/CD | GitHub Actions | Services, chart, and kind-based E2E jobs |
| Image scanning | Trivy | v0.36.0 action |
| Container registry | GitHub Container Registry | Release workflow target |
| Helm chart registry | GHCR OCI | Release workflow target |

## Getting Started

This section explains how to download the repository, prepare the local environment, deploy Flotilla to Kubernetes, test the API, and remove the cluster afterwards.

The main deployment path uses a local kind cluster. No AWS account or cloud infrastructure is required.

### 1. Prerequisites

Before cloning and running the project, install the following tools:

| Tool | Purpose |
|---|---|
| Git | Clone the repository |
| Docker | Build and run container images |
| kind | Create a local Kubernetes cluster |
| kubectl | Manage Kubernetes resources |
| Helm 4 | Install and manage the Flotilla chart |
| Bash | Execute deployment and test scripts |
| curl | Send HTTP requests to the API |
| jq | Format and inspect JSON responses |
| OpenSSL | Generate and handle local credentials |

Make sure the Docker daemon is running before starting the deployment.

Check that the tools are available:

```bash
git --version
docker --version
kind version
kubectl version --client
helm version
curl --version
jq --version
openssl version
```

Node.js 26 and npm are required when running the service tests directly on the host. Building the production container images is handled by Docker.

The commands below assume a Linux environment. On Windows, use WSL or another compatible Bash environment with Docker available.

### 2. Clone the Repository

Clone the project from GitHub:

```bash
git clone https://github.com/bukovinszkiakos/k8s-microservices-helm-ci.git
```

Enter the newly downloaded project directory:

```bash
cd k8s-microservices-helm-ci
```

At this point, the repository should contain the application services, Helm chart, kind configuration, and deployment scripts.

You can inspect the project files:

```bash
ls -la
```

### 3. Start the Local Kubernetes Environment

Run the deployment script from the repository root:

```bash
./scripts/cluster-up.sh
```

This script automates the local Kubernetes setup and application deployment.

The process performs the following steps:

1. Checks the required tools: Docker, kind, kubectl, Helm, and OpenSSL.
2. Creates the kind cluster named `flotilla` if it does not already exist.
3. Verifies that the `kind-flotilla` Kubernetes context is available.
4. Checks that a default StorageClass is available for PostgreSQL persistent storage.
5. Installs or upgrades metrics-server using Helm.
6. Builds the Docker images for the three Node.js services.
7. Loads the locally built images into the kind cluster.
8. Creates the `flotilla` namespace if it does not exist.
9. Creates the `flotilla-secrets` Kubernetes Secret when it does not already exist.
10. Installs or upgrades the Flotilla Helm release and waits for the deployment.

The three service images are built locally:

- `local/flotilla-auth-service:dev`
- `local/flotilla-inventory-service:dev`
- `local/flotilla-stats-service:dev`

The script is designed to be reusable. When an existing cluster and Secret are detected, they are reused rather than recreated. Existing credentials are preserved.

When deployment is complete, the gateway is available at:

```text
http://localhost:8080
```

### 4. Verify the Kubernetes Deployment

Check the deployed Pods, Services, persistent storage, autoscalers, and NetworkPolicies:

```bash
kubectl --context kind-flotilla -n flotilla get pods,svc,pvc,hpa,networkpolicy
```

Expected results:

- The three Node.js services are running.
- The NGINX gateway Pods are running.
- PostgreSQL is running as `postgres-0`.
- The PostgreSQL PVC has status `Bound`.
- The three microservice HPAs are available.
- The NetworkPolicies are present.

All application Pods should eventually show `Running` and `Ready`.

Check the resource usage:

```bash
kubectl --context kind-flotilla -n flotilla top pods
```

Inspect the Helm release:

```bash
helm --kube-context kind-flotilla -n flotilla list
```

### 5. Check Gateway Availability

Test the gateway health endpoint:

```bash
curl -i http://localhost:8080/healthz
```

Expected response:

```text
HTTP/1.1 200 OK

ok
```

This confirms that the NGINX gateway is responding to HTTP requests.

### 6. Run the End-to-End Tests

Execute the end-to-end test script:

```bash
bash ./scripts/e2e-test.sh
```

The script reads the API token from the Kubernetes Secret, waits for the gateway, and performs eight checks against the running application.

The checks cover:

1. Auth Service is not publicly exposed.
2. Inventory rejects requests without a token.
3. Inventory rejects invalid tokens.
4. Inventory rejects invalid request bodies.
5. Inventory accepts an authenticated item creation request.
6. The created item is returned by the inventory endpoint.
7. The Stats Service returns valid aggregate values.
8. An unlabeled test Pod cannot reach PostgreSQL because of the NetworkPolicy.

A successful run should finish with:

```text
Results: 8 passed, 0 failed
```

### 7. Read the API Token

The API token is stored in the Kubernetes Secret `flotilla-secrets`.

Retrieve it into a shell variable:

```bash
TOKEN=$(kubectl --context kind-flotilla -n flotilla get secret flotilla-secrets \
  -o jsonpath='{.data.api-token}' | base64 -d)
```

The token is now available in the current terminal session as `$TOKEN`.

Do not print, commit, or share the token.

### 8. Try the API

All public application requests go through the NGINX gateway:

```text
http://localhost:8080
```

#### List Inventory Items

```bash
curl http://localhost:8080/api/inventory/items
```

This returns the inventory records stored in PostgreSQL.

#### Create an Inventory Item

A valid Bearer token is required to create an item.

```bash
curl -i -X POST http://localhost:8080/api/inventory/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-item","quantity":5}'
```

A successful request returns:

```text
HTTP/1.1 201 Created
```

Requests without a token or with an invalid token return `401 Unauthorized`. Invalid request data returns `400 Bad Request`.

#### Get Statistics

```bash
curl http://localhost:8080/api/stats/summary
```

Example response:

```json
{
  "totalItems": 8,
  "totalQuantity": 24
}
```

The values depend on the records currently stored in PostgreSQL.

The Stats Service retrieves inventory data through the Inventory Service and calculates the aggregate values.

### 9. Inspect Kubernetes Resources

Check the Pod status:

```bash
kubectl --context kind-flotilla -n flotilla get pods
```

Check the Deployments:

```bash
kubectl --context kind-flotilla -n flotilla get deployments
```

Check the Services:

```bash
kubectl --context kind-flotilla -n flotilla get services
```

Check persistent storage:

```bash
kubectl --context kind-flotilla -n flotilla get pvc
```

Check autoscaling:

```bash
kubectl --context kind-flotilla -n flotilla get hpa
```

Watch autoscaling decisions in real time:

```bash
kubectl --context kind-flotilla -n flotilla get hpa -w
```

### 10. Remove the Local Environment

When finished testing, delete the local kind cluster:

```bash
kind delete cluster --name flotilla
```

This removes the Kubernetes cluster, including:

- Application Pods and Deployments.
- Services and NetworkPolicies.
- Helm release resources.
- PostgreSQL StatefulSet and PersistentVolumeClaim.
- Local database data stored inside the cluster.

The Git repository and source files remain untouched.

**Important:** deleting the kind cluster permanently removes the local PostgreSQL data. Run this command only when the local environment is no longer needed.

To recreate the environment later, return to the repository directory and run:

```bash
./scripts/cluster-up.sh
```

## API Reference

All public application requests go through the NGINX gateway on `http://localhost:8080`.

| Method | Gateway path | Authentication | Description |
|---|---|---|---|
| `GET` | `/healthz` | None | Gateway health check; returns `200 ok` |
| `GET` | `/api/inventory/items` | None | Returns inventory records |
| `POST` | `/api/inventory/items` | Bearer token | Creates an inventory record |
| `GET` | `/api/stats/summary` | None | Returns total item count and total quantity |
| Any other path | — | — | Returns `404`; the Auth Service is not publicly routed |

### Internal Service Endpoints

Each service exposes internal health and readiness endpoints for Kubernetes probes. The Auth Service also exposes its token validation endpoint internally.

These endpoints are not routed through the public gateway.

## Kubernetes and Helm Features

- **Reusable Helm templates:** service Deployments and Services are generated from shared templates and per-service values, reducing duplicated manifests.
- **Helm values:** environment-specific configuration is separated from templates, including local kind settings.
- **Deployments and Services:** each Node.js microservice is deployed independently and discovered through Kubernetes Services.
- **StatefulSet and PVC:** PostgreSQL receives a stable Pod identity and persistent storage that survives Pod recreation.
- **Health probes:** readiness and liveness checks help Kubernetes distinguish ready containers from unhealthy ones.
- **Resource requests and limits:** resource settings provide the baseline required by the Horizontal Pod Autoscalers.
- **Horizontal Pod Autoscaler:** the three Node.js services use CPU-based autoscaling with a 70% target and a configured range of two to four replicas.
- **ConfigMap checksum rollout:** changes to the gateway configuration trigger a new gateway rollout.
- **Kubernetes Secret:** database and API credentials are injected from an existing Secret rather than stored in chart values.
- **Helm test hook:** a test Pod checks gateway health and statistics routing after installation.
- **NetworkPolicies:** default-deny ingress policy is combined with explicit rules for required service communication.

## Security

### Container and Pod Hardening

The application containers are configured with restricted security settings:

- Non-root execution with explicit user and group IDs.
- Read-only root filesystems where supported, with writable temporary paths provided explicitly.
- Privilege escalation disabled.
- Linux capabilities dropped.
- RuntimeDefault seccomp profile.
- Automatic mounting of Kubernetes ServiceAccount tokens is disabled for all workloads.

The Node.js services run as the non-root `node` user, the unprivileged NGINX gateway uses its dedicated non-root user, and PostgreSQL is configured to run with UID 70. PostgreSQL has image-specific initialization and volume requirements, so its security configuration should be considered separately from the Node.js and gateway containers.

### Application and Network Security

- **Default-deny ingress:** NetworkPolicies block unsolicited inbound Pod traffic and allow only the required communication paths.
- **Database isolation:** PostgreSQL is reachable only from the Inventory Service through the configured ingress policy.
- **Private authentication service:** the Auth Service has no public gateway route.
- **Token comparison:** token validation uses SHA-256 digests and constant-time comparison.
- **Database queries:** inventory persistence uses parameterized SQL queries.
- **Input validation:** request payloads are validated before database operations, and JSON request size is limited.
- **Externalized credentials:** the API token and PostgreSQL password are supplied through a Kubernetes Secret and are not stored in the chart values or source repository.
- **Image scanning:** Trivy scans the three service images for HIGH and CRITICAL vulnerabilities in the CI workflow on every pull request and push to `main`, and again in the release workflow before images are pushed. Unfixed findings are ignored, and scan failures block the corresponding workflow job.
- **Workflow permissions:** GitHub Actions jobs use scoped permissions. Third-party actions that require immutable references are pinned to commit SHAs.

NetworkPolicies currently restrict ingress. Egress traffic is not restricted by the current policy set.

## CI/CD

The project uses separate GitHub Actions workflows for pull-request validation and version-tagged releases.

### Continuous Integration — `ci.yml`

The CI workflow validates the services, Helm chart, and deployed application:

1. **Services job:** runs as a matrix across the three Node.js services, checks Node.js version consistency, installs locked dependencies with `npm ci`, runs tests, builds Docker images, and scans images with Trivy.
2. **Chart job:** installs the pinned Helm version, runs `helm lint`, and renders the chart with default and local values.
3. **E2E job:** waits for the services and chart jobs, creates an ephemeral kind environment, runs the same `cluster-up.sh` deployment script used locally, executes the eight end-to-end checks, and runs `helm test`.
4. **Diagnostics:** when the E2E job fails, the workflow collects Kubernetes resources, events, Pod descriptions, and application logs to help investigate the failure.

The E2E job uses the same deployment script as the local workflow. This keeps local and CI deployment behavior aligned.

### Release Workflow — `release.yml`

The release workflow is configured to run when a version tag matching the `v*.*.*` pattern is pushed.

The workflow validates the version and performs the following steps:

1. Builds the Auth, Inventory, and Stats service images with the release version.
2. Scans each image with Trivy before publishing it.
3. Pushes versioned images to GitHub Container Registry (GHCR).
4. Packages the Helm chart using the same application version.
5. Pushes the chart to GHCR as an OCI artifact.
6. Creates a GitHub Release and attaches the packaged chart.

The workflow does not publish a mutable `latest` image tag. The first complete tag-based release and public installation still need to be verified.

## Demonstrated Behavior

The following results were measured during a local demonstration on kind. Manual observations are identified separately from checks automated by the E2E script.

### PostgreSQL Persistence — Manual Test

An inventory record was created, the PostgreSQL Pod (`postgres-0`) was deleted, and Kubernetes recreated it. The same record was still returned by the API after the new Pod became Ready.

**Observed result:** the record with ID `8`, name `demo-1794414108`, and quantity `5` survived PostgreSQL Pod deletion and recreation.

### Kubernetes Self-Healing — Manual Test

An Inventory Service Pod was manually deleted. The Deployment created a replacement Pod and returned to its desired replica count. The E2E script passed after the replacement was Ready.

**Observed result:** a replacement Pod became `1/1 Running`; the subsequent E2E run reported eight passed checks and zero failures.

### Horizontal Pod Autoscaling — Manual Test

A BusyBox load-generator Pod continuously requested the statistics endpoint. The HPA increased the number of service replicas under CPU load.

**Observed result:**

- Stats Service scaled from 2 to 4 replicas.
- Inventory Service scaled from 2 to 3 replicas.
- After the load-generator Pod was removed, both services returned to 2 replicas.

### Rolling Restart — Manual Measurement

Inventory and Stats Deployments were restarted while requests were sent continuously to the statistics endpoint for 90 seconds.

**Measured result:** `ok=6190 fail=0` — 6,190 successful HTTP responses and zero failed requests during the measurement window.

### NetworkPolicy Database Isolation — Automated E2E Check

The E2E script starts an unlabeled test Pod and verifies that it cannot reach PostgreSQL.

**Observed result:** the database-isolation check passed; the unauthorized test Pod received no PostgreSQL response.

### End-to-End API Tests — Automated

The E2E script covers:

1. The Auth Service is not publicly exposed through the gateway.
2. Inventory rejects requests without a token.
3. Inventory rejects an invalid token.
4. Inventory rejects invalid request data.
5. Inventory accepts a valid authenticated create request.
6. The newly created record is visible in the inventory list.
7. The statistics endpoint returns aggregate values.
8. An unlabeled Pod cannot reach PostgreSQL.

**Observed result:** the final run after the manual restart and scaling demonstrations reported **8 passed, 0 failed**.

## Troubleshooting

| Symptom | Possible cause | Suggested action |
|---|---|---|
| `ErrImageNeverPull` | A local image is missing from the kind node | Re-run `./scripts/cluster-up.sh` to build and load the images |
| `CreateContainerConfigError` | The required `flotilla-secrets` Secret or one of its keys is missing | Check the Secret in the `flotilla` namespace and re-run the setup script if appropriate |
| HPA shows `<unknown>` | metrics-server has not started reporting metrics yet | Wait for metrics-server to become ready, then check `kubectl top pods` |
| PVC remains `Pending` | The cluster has no usable default StorageClass | Check `kubectl get storageclass` and verify the kind storage provisioner |
| PostgreSQL password authentication fails after changing the Secret | PostgreSQL initialized its data directory with the previous password | Do not delete the PVC unless the stored data can be discarded; for a disposable local environment, recreate the PVC and database deliberately |
| `Permission denied` when running a script | The script is not executable in the local checkout | Run it explicitly with Bash, for example `bash ./scripts/e2e-test.sh` |
| Script reports the wrong or missing context | The expected `kind-flotilla` context is not available | Check `kubectl config get-contexts` and run `./scripts/cluster-up.sh` |
| Shell script reports unexpected syntax or carriage-return errors | Windows-style CRLF line endings may have been introduced | Convert the script to LF line endings using your editor or a tool such as `dos2unix` |

For CI failures, inspect the diagnostics attached to the failed E2E job: Pod status, Kubernetes events, Pod descriptions, and application logs.

## Limitations and Future Improvements

Flotilla is intentionally a small local Kubernetes project. The current implementation has several limitations:

- The kind configuration uses a single control-plane node and does not demonstrate node-failure tolerance.
- PostgreSQL runs as a single instance without automated backups or high availability.
- The local gateway is exposed through a kind NodePort mapping; TLS and public ingress are not configured.
- NetworkPolicies restrict ingress, but egress traffic is not restricted.
- Prometheus, Grafana, centralized logging, and alerting are not included.
- GitOps tooling such as Argo CD is not included.
- External secret-management integration and automated secret rotation are not included.
- The HPA scales Pods; the local kind environment does not demonstrate a cloud node autoscaler.

Potential future improvements include TLS and Gateway API support, egress NetworkPolicies, monitoring and alerting, GitOps deployment, external secret management, and PostgreSQL backup and recovery automation.

## Repository Structure

```text
k8s-microservices-helm-ci/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Service, chart, and kind E2E validation
│       └── release.yml             # Version-tagged image and chart release
├── services/
│   ├── auth-service/               # Bearer token validation
│   ├── inventory-service/          # Inventory API and PostgreSQL access
│   └── stats-service/              # Inventory aggregation API
├── charts/
│   └── flotilla/                   # Helm chart and Kubernetes templates
├── kind/
│   └── cluster.yaml                # Local kind cluster configuration
├── scripts/
│   ├── cluster-up.sh               # Build images and deploy Flotilla
│   └── e2e-test.sh                 # End-to-end and database isolation checks
```

## Developer

Ákos Bukovinszki

https://github.com/bukovinszkiakos

---

<p align="right">(<a href="#top">Back to top</a>)</p>
