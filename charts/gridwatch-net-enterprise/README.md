# GridWatch NetEnterprise Helm Chart

A Helm chart for deploying GridWatch NetEnterprise - Unified Network Management Platform

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- PV provisioner support in the underlying infrastructure

## Installing the Chart

Add the repository (once published):

```bash
helm repo add gridwatch https://charts.gridwatch.io
helm repo update
```

Install the chart:

```bash
helm install gridwatch gridwatch/gridwatch-net-enterprise \
  --namespace gridwatch \
  --create-namespace \
  --set postgresql.auth.password=your-db-password \
  --set redis.auth.password=your-redis-password
```

## Uninstalling the Chart

```bash
helm uninstall gridwatch --namespace gridwatch
```

## Configuration

See [values.yaml](values.yaml) for the full list of configurable values.

### Quick Reference

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Container image registry | `ghcr.io/remeadows` |
| `gateway.replicaCount` | Number of gateway replicas | `2` |
| `gateway.resources.limits.memory` | Gateway memory limit | `512Mi` |
| `webUI.replicaCount` | Number of web UI replicas | `2` |
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `redis.enabled` | Deploy Redis | `true` |
| `nats.enabled` | Deploy NATS | `true` |
| `ingress.enabled` | Enable ingress | `false` |

### Using External Databases

To use external PostgreSQL:

```yaml
postgresql:
  enabled: false

externalPostgres:
  enabled: true
  host: your-postgres-host
  port: 5432
  database: gridwatch
  username: gridwatch
  existingSecret: postgres-credentials
```

### Enabling Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: gridwatch.example.com
      paths:
        - path: /
          pathType: Prefix
          service: web-ui
        - path: /api
          pathType: Prefix
          service: gateway
  tls:
    - secretName: gridwatch-tls
      hosts:
        - gridwatch.example.com
```

### Production Recommendations

1. **Enable Pod Disruption Budgets**:
   ```yaml
   podDisruptionBudget:
     enabled: true
     minAvailable: 1
   ```

2. **Configure Resource Limits** appropriately for your workload

3. **Enable Network Policies**:
   ```yaml
   security:
     networkPolicy:
       enabled: true
   ```

4. **Use External Secrets** for sensitive data (e.g., External Secrets Operator)

5. **Enable Horizontal Pod Autoscaler** for gateway:
   ```yaml
   autoscaling:
     enabled: true
     minReplicas: 2
     maxReplicas: 10
   ```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 3001 | API Gateway |
| Web UI | 80 | Frontend application |
| Auth Service | 3006 | Authentication service |
| IPAM | 3003 | IP Address Management |
| NPM | 3004 | Network Performance Monitoring |
| STIG | 3005 | Security compliance |
| Syslog | 514 | Syslog collector |

## Upgrading

### From 0.1.x to 0.2.x

No breaking changes.

## License

Proprietary - GridWatch NetEnterprise
