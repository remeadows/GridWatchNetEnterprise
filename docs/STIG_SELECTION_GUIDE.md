# STIG Selection Guide

> How to select the right STIGs for your network devices

**Version**: 1.0.0
**Last Updated**: 2026-01-18
**Author**: GridWatch NetEnterprise

---

## Overview

Many network devices require **multiple STIGs** based on the functional roles they perform. A single physical device may act as a firewall, VPN concentrator, intrusion detection system, and router simultaneously. Each role has its own STIG with specific security requirements.

GridWatch STIG Manager supports **multi-STIG assignments** per asset, allowing you to:

- Assign multiple applicable STIGs to a single target
- Mark one STIG as "primary" for quick audits
- Enable/disable STIGs without removing assignments
- Run batch audits across all assigned STIGs
- Generate combined compliance reports

---

## STIG Selection Logic

### General Principles

1. **Role-Based Selection**: Choose STIGs based on the **functions enabled** on the device, not just the device type
2. **Layered Compliance**: Most devices require a **base STIG** (typically NDM) plus **role-specific STIGs**
3. **Conditional STIGs**: Some STIGs only apply when specific features are configured
4. **Version Matching**: Use the STIG version that matches your device's software version

### Selection Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│                    Is it a network device?                   │
└─────────────────────────────────┬───────────────────────────┘
                                  │ YES
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│           Apply Network Device Management (NDM) STIG         │
│                    (ALWAYS REQUIRED)                         │
└─────────────────────────────────┬───────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Firewall/ALG  │       │   VPN Services  │       │  IDPS Services  │
│   enabled?    │       │    enabled?     │       │    enabled?     │
└───────┬───────┘       └────────┬────────┘       └────────┬────────┘
        │ YES                    │ YES                     │ YES
        ▼                        ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Apply ALG    │       │   Apply VPN     │       │   Apply IDPS    │
│    STIG       │       │     STIG        │       │     STIG        │
└───────────────┘       └─────────────────┘       └─────────────────┘
```

---

## Vendor-Specific Guidance

### Juniper SRX Services Gateway

**Source**: DISA Juniper SRX SG STIG Overview (January 2025)

The Juniper SRX SG STIG package contains 4 distinct STIGs:

| STIG     | Benchmark ID               | Purpose                                                | When to Apply                      |
| -------- | -------------------------- | ------------------------------------------------------ | ---------------------------------- |
| **NDM**  | `Juniper_SRX_SG_NDM_STIG`  | Network Device Management - secures the Routing Engine | **ALWAYS**                         |
| **ALG**  | `Juniper_SRX_SG_ALG_STIG`  | Application Layer Gateway - firewall services          | **ALWAYS** (when used as firewall) |
| **VPN**  | `Juniper_SRX_SG_VPN_STIG`  | IPsec VPN services                                     | Only if VPN configured             |
| **IDPS** | `Juniper_SRX_SG_IDPS_STIG` | Intrusion Detection/Prevention                         | Only if IDP enabled                |

**Minimum Required**: NDM + ALG STIGs are **always required** for any Juniper SRX deployment used as a firewall.

**Example Scenarios**:

| Scenario                        | Required STIGs         |
| ------------------------------- | ---------------------- |
| Basic perimeter firewall        | NDM + ALG              |
| Firewall with site-to-site VPN  | NDM + ALG + VPN        |
| Firewall with remote access VPN | NDM + ALG + VPN        |
| Firewall with IDP enabled       | NDM + ALG + IDPS       |
| Full-featured deployment        | NDM + ALG + VPN + IDPS |

### Cisco IOS/IOS-XE Devices

| STIG         | Purpose                   | When to Apply        |
| ------------ | ------------------------- | -------------------- |
| **NDM**      | Network Device Management | **ALWAYS**           |
| **RTR**      | Router functions          | If routing enabled   |
| **L2S**      | Layer 2 Switch            | If switching enabled |
| **Firewall** | Zone-based firewall       | If ZBFW configured   |

### Palo Alto Networks

| STIG         | Purpose                     | When to Apply     |
| ------------ | --------------------------- | ----------------- |
| **NDM**      | Network Device Management   | **ALWAYS**        |
| **Firewall** | Next-gen firewall functions | **ALWAYS**        |
| **VPN**      | GlobalProtect/IPsec VPN     | If VPN configured |

### Fortinet FortiGate

| STIG         | Purpose                   | When to Apply |
| ------------ | ------------------------- | ------------- |
| **NDM**      | Network Device Management | **ALWAYS**    |
| **Firewall** | Firewall/UTM functions    | **ALWAYS**    |

---

## Using Multi-STIG in GridWatch STIG Manager

### Assigning STIGs to Assets

1. Navigate to **STIG Manager > Assets**
2. Click on an asset to edit
3. Select the **STIGs** tab
4. Click **Add STIG** to search and assign applicable STIGs
5. Use the **star icon** to mark one STIG as primary
6. Use the **checkbox** to enable/disable STIGs for batch audits

### Primary STIG

Each asset can have **one primary STIG** designated. The primary STIG is used for:

- Quick single-STIG audits from the asset list
- Default selection when generating individual reports
- Dashboard compliance scoring

### Batch Auditing ("Audit All")

The **Audit All** feature runs compliance checks against all enabled STIGs:

1. From the asset list, click the **All** button
2. Review the list of enabled STIGs
3. Click **Start Audit All**
4. Monitor progress in the Audit Groups view

Results are grouped together and can be:

- Viewed as combined compliance reports
- Exported as separate CKL files per STIG
- Generated as a combined PDF summary

### Best Practices

1. **Start with NDM**: Always assign the NDM STIG first as your baseline
2. **Add role STIGs**: Add STIGs for each function the device performs
3. **Mark primary wisely**: Set your most critical/frequently audited STIG as primary
4. **Use notes**: Add notes to explain why specific STIGs were assigned or excluded
5. **Review quarterly**: Re-evaluate STIG assignments when device roles change

---

## Database Schema

Multi-STIG support uses the `stig.target_definitions` table:

```sql
CREATE TABLE stig.target_definitions (
    id UUID PRIMARY KEY,
    target_id UUID NOT NULL REFERENCES stig.targets(id),
    definition_id UUID NOT NULL REFERENCES stig.definitions(id),
    is_primary BOOLEAN DEFAULT false,    -- Primary STIG for quick audits
    enabled BOOLEAN DEFAULT true,        -- Include in "Audit All"
    notes TEXT,                          -- Admin notes
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE(target_id, definition_id)
);
```

Batch audits use the `stig.audit_groups` table:

```sql
CREATE TABLE stig.audit_groups (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    target_id UUID NOT NULL REFERENCES stig.targets(id),
    status VARCHAR(50),  -- pending, running, completed, failed
    total_jobs INTEGER,
    completed_jobs INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
```

---

## API Endpoints

### Target STIG Assignments

| Method | Endpoint                                               | Description         |
| ------ | ------------------------------------------------------ | ------------------- |
| GET    | `/api/v1/stig/targets/{id}/definitions`                | List assigned STIGs |
| POST   | `/api/v1/stig/targets/{id}/definitions`                | Assign a STIG       |
| POST   | `/api/v1/stig/targets/{id}/definitions/bulk`           | Bulk assign STIGs   |
| PATCH  | `/api/v1/stig/targets/{id}/definitions/{assignmentId}` | Update assignment   |
| DELETE | `/api/v1/stig/targets/{id}/definitions/{assignmentId}` | Remove assignment   |

### Batch Audit Operations

| Method | Endpoint                                 | Description                       |
| ------ | ---------------------------------------- | --------------------------------- |
| POST   | `/api/v1/stig/targets/{id}/audit-all`    | Start audit for all enabled STIGs |
| GET    | `/api/v1/stig/audit-groups`              | List audit groups                 |
| GET    | `/api/v1/stig/audit-groups/{id}`         | Get audit group details           |
| GET    | `/api/v1/stig/audit-groups/{id}/summary` | Get compliance summary            |

---

## Compliance Reporting

### Individual STIG Reports

Each audit generates findings per STIG. Reports include:

- Pass/Fail/Open/Not Applicable counts
- Severity breakdown (CAT I/II/III)
- Individual rule findings with evidence

### Combined Reports

When multiple STIGs are audited via "Audit All":

- **Combined PDF**: Summary of all STIGs on one document
- **Separate CKLs**: One .ckl file per STIG (required for eMASS upload)
- **Compliance Dashboard**: Aggregate scoring across all STIGs

---

## References

- [DISA STIG Library](https://public.cyber.mil/stigs/)
- [Juniper SRX SG STIG Overview](https://public.cyber.mil/stigs/downloads/) - January 2025
- [NIST SP 800-53](https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final)
- [DOD RMF](https://rmf.org/)
