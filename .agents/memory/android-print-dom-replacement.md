---
name: Android Chrome Print — Body Replacement
description: How to print a receipt-only page on Android Chrome when the app UI keeps bleeding through into the print output.
---

## The rule

For Android Chrome (`window.print()` via ESC/POS print services like Looped Labs), CSS-based hiding is **completely unreliable**. Every approach tried and confirmed broken:

- `@media print { display:none }` — ignored
- `@media print { visibility:hidden }` — ignored  
- `@media print { html { visibility:hidden } }` — ignored
- `el.style.setProperty("display","none","important")` (inline `!important`) — ignored
- Combination of all the above — still ignored

**The only approach that works**: physically remove every body child node from the DOM before calling `window.print()`, inject only the receipt container, let print fire, then restore all children.

```javascript
// 1. Capture and remove ALL body children
const savedBodyChildren = Array.from(document.body.childNodes);
savedBodyChildren.forEach(node => document.body.removeChild(node));

// 2. Inject receipt-only content
const container = document.createElement("div");
container.innerHTML = receiptBodyHtml;
document.body.appendChild(container);

// 3. Double rAF so Chrome composites new DOM before print dialog
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.print();
  });
});

// 4. afterprint: restore everything
window.addEventListener("afterprint", () => {
  document.body.removeChild(container);
  savedBodyChildren.forEach(node => document.body.appendChild(node));
}, { once: true });
```

**Why:** Chrome Android's print pipeline (when used with ESC/POS print services) appears to render the page from the visual/composited state, not from a separate print-renderer pass with @media print applied. The composited state reflects the DOM; if nodes are not in the DOM, they cannot render.

**React safety:** Removed nodes stay alive as JS objects (held in the array). React's reconciler state (hooks, context, refs) is unaffected — it only updates the DOM, it doesn't poll the DOM for its state. Re-appending the nodes after print lets React continue normally.

**Double rAF:** Ensures Chrome's compositor has flushed the new body state before the print job is submitted. A single `setTimeout(150ms)` was insufficient in testing.

**@page rule:** Still inject `@page { size: 80mm auto; margin: 0 }` in `<head>` for correct paper size. This IS respected by Chrome's print compositor even on Android.

**Where it's implemented:** `artifacts/nexus-pos/src/lib/receipt.ts` — `openReceiptWindow()`, the `if (opts?.receiptPageSize)` branch.
