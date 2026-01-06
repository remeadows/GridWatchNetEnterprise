# NetNynja Enterprise - Issues Tracker

> Active issues and technical debt tracking

## Issue Categories

- 🔴 **Critical** - Blocking issues that prevent core functionality
- 🟠 **High** - Important issues that should be resolved soon
- 🟡 **Medium** - Issues that should be addressed in normal development
- 🟢 **Low** - Nice-to-have improvements

---

## Open Issues

### Phase 0: Repository Setup

| ID | Priority | Title | Assignee | Status |
|----|----------|-------|----------|--------|
| #001 | 🟡 | Validate npm workspaces on all platforms | - | Open |
| #002 | 🟡 | Test Poetry install on Windows | - | Open |
| #003 | 🟢 | Add pre-commit hooks | - | Open |

### Infrastructure

| ID | Priority | Title | Assignee | Status |
|----|----------|-------|----------|--------|
| #010 | 🟠 | Configure production Vault unsealing | - | Open |
| #011 | 🟡 | Add PostgreSQL backup scripts | - | Open |
| #012 | 🟡 | Configure log rotation for Loki | - | Open |

### Security

| ID | Priority | Title | Assignee | Status |
|----|----------|-------|----------|--------|
| #020 | 🔴 | Generate production JWT RSA keys | - | Open |
| #021 | 🟠 | Implement rate limiting in gateway | - | Open |
| #022 | 🟠 | Add CORS configuration | - | Open |
| #023 | 🟡 | Set up container vulnerability scanning | - | Open |

### Technical Debt

| ID | Priority | Title | Assignee | Status |
|----|----------|-------|----------|--------|
| #030 | 🟡 | Add comprehensive test coverage | - | Open |
| #031 | 🟢 | Document API with OpenAPI spec | - | Open |
| #032 | 🟢 | Add performance benchmarks | - | Open |

---

## Resolved Issues

| ID | Priority | Title | Resolved Date | Resolution |
|----|----------|-------|---------------|------------|
| - | - | - | - | - |

---

## Issue Template

```markdown
### Issue #XXX: [Title]

**Priority**: 🔴/🟠/🟡/🟢
**Category**: Infrastructure / Security / Application / Documentation
**Reported**: YYYY-MM-DD
**Assignee**: 

#### Description
[Detailed description of the issue]

#### Steps to Reproduce (if applicable)
1. 
2. 
3. 

#### Expected Behavior
[What should happen]

#### Actual Behavior
[What actually happens]

#### Proposed Solution
[How to fix it]

#### Related Issues
- #XXX
```

---

## Notes

- Issues are tracked here for visibility, but should also be created in GitHub Issues for proper tracking
- Update status during development
- Close issues with resolution notes
