---
name: Optional module toggles must gate the page, not just nav
description: Tenant-setting-gated modules (layaway, work orders) need route/page-level enforcement.
---

Rule: a tenant setting that "disables a module" must be enforced where the page renders (early return / redirect), not only by hiding the nav item in layout.tsx. Routes in App.tsx stay mounted, so direct URLs bypass nav-only gating.

**Why:** architect review flagged nav-only gating on layaway/work-orders as a functional authz gap.

**How to apply:** in the page component, after all hooks, `if (settings && settings.<flag> !== "true") return <disabled notice/>`. Nav hiding via NavItem.settingKey is cosmetic only.
