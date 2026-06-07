---
name: Product categories union
description: Why the Products page category list must union the curated setting with in-use product categories.
---

# Product categories must union settings + in-use

The Products page (and its filter bar, Manage Categories dialog, and product-form
dropdown) builds its category list from a UNION of two sources:
1. the curated `product_categories` app_setting (order preserved, shown first), and
2. distinct non-null categories actually used by the tenant's products, via
   `GET /products/categories` (includes archived products).

De-duplicate case-insensitively; curated entries win ordering.

**Why:** CSV / MBPOS imports set `product.category` directly but NEVER add the new
value to the `product_categories` setting. So a tenant's products can span many
more categories than the setting lists (real case: settings had 10, products used
18), and a settings-only UI silently hides the rest. POS pages already derived
categories from products, which is why they showed all while the Products page
showed only 10.

**How to apply:**
- Any UI that lets the user pick/filter by product category must use this union,
  not the raw setting, or imported categories disappear.
- A category still used by a product will reappear in the union even after being
  removed from the curated setting — expected; true removal requires
  recategorizing the products first.
- The `/products/categories` route MUST stay registered before `/products/:id` in
  `products.ts` or "categories" is parsed as an `:id`.
