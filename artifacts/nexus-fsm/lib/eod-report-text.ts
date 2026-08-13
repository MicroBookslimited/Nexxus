/**
 * Plain-text end-of-day report for 58mm (32 col) and 80mm (42 col) ESC/POS
 * thermal printers.
 *
 * A technician's day is money collected on jobs, not POS orders, so job
 * payments lead the report and the cash-custody block closes it — including a
 * signature line to sign on paper when the receiver isn't there to sign in the
 * app.
 */
import type { SessionReport } from './fsm-api';

const fmt = (n: number) => (Math.round((n ?? 0) * 100) / 100).toFixed(2);

const center = (s: string, w: number) => {
  const t = s.length > w ? s.slice(0, w) : s;
  return ' '.repeat(Math.max(0, Math.floor((w - t.length) / 2))) + t;
};

const divider = (w: number, ch = '-') => ch.repeat(w);

const lr = (left: string, right: string, w: number): string => {
  const r = right.length >= w ? right.slice(-w) : right;
  const maxLeft = w - r.length - 1;
  const l = left.length > maxLeft ? left.slice(0, Math.max(0, maxLeft - 1)) + '…' : left;
  return l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;
};

function dt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Denominations are saved as a JSON `{ "1000": 3 }` map by the close screen. */
export function parseDenominations(raw: string | null | undefined): { value: number; count: number }[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return Object.entries(parsed)
      .map(([k, v]) => ({ value: Number(k), count: Number(v) }))
      .filter((d) => Number.isFinite(d.value) && d.count > 0)
      .sort((a, b) => b.value - a.value);
  } catch {
    return [];
  }
}

export function buildEodReportText(
  report: SessionReport,
  opts: { businessName?: string; width: 32 | 42 },
): string {
  const w = opts.width;
  const { session, payouts, salesSummary: s } = report;
  const L: string[] = [];

  L.push(center((opts.businessName ?? 'NEXXUS').replace(/\s*\r?\n\s*/g, ' '), w));
  L.push(center('END OF DAY REPORT', w));
  L.push(divider(w, '='));
  L.push(lr('Staff', session.staffName, w));
  L.push(lr('Shift', `#${session.id}`, w));
  L.push(lr('Opened', dt(session.openedAt), w));
  L.push(lr('Closed', session.closedAt ? dt(session.closedAt) : 'OPEN', w));
  L.push(divider(w));

  // Money collected on jobs — the technician's whole day in three lines.
  const jobTotal = report.woCashIn + report.woCardIn + report.woTransferIn;
  if (jobTotal !== 0 || report.woPayments.length > 0) {
    L.push(center('JOB PAYMENTS', w));
    L.push(lr('Cash', fmt(report.woCashIn), w));
    L.push(lr('Card', fmt(report.woCardIn), w));
    if (report.woTransferIn !== 0) L.push(lr('Transfer', fmt(report.woTransferIn), w));
    L.push(lr('Total collected', fmt(jobTotal), w));
    L.push(divider(w));
  }

  if ((s.totalSales ?? 0) !== 0 || report.orders.length > 0) {
    L.push(center('POS SALES', w));
    L.push(lr('Cash', fmt(s.cashSales), w));
    L.push(lr('Card', fmt(s.cardSales), w));
    if ((s.splitSales ?? 0) !== 0) L.push(lr('Split', fmt(s.splitSales), w));
    if ((s.creditSales ?? 0) !== 0) L.push(lr('On account', fmt(s.creditSales), w));
    if ((s.totalRefunds ?? 0) !== 0) L.push(lr('Refunds', `-${fmt(s.totalRefunds)}`, w));
    if ((s.voidedCount ?? 0) !== 0) L.push(lr(`Voided (${s.voidedCount})`, fmt(s.voidedTotal), w));
    L.push(lr('Total sales', fmt(s.totalSales), w));
    L.push(divider(w));
  }

  L.push(center('CASH RECONCILIATION', w));
  L.push(lr('Opening float', fmt(session.openingCash), w));
  if (report.voucherCashIn !== 0) L.push(lr('Vouchers (cash)', fmt(report.voucherCashIn), w));
  if (report.layawayCashIn !== 0) L.push(lr('Layaway (cash)', fmt(report.layawayCashIn), w));
  L.push(lr('Payouts', `-${fmt(report.totalPayouts)}`, w));
  L.push(lr('Expected cash', fmt(report.expectedCash), w));
  if (session.actualCash != null) {
    L.push(lr('Counted cash', fmt(session.actualCash), w));
    const diff = session.actualCash - report.expectedCash;
    L.push(lr(Math.abs(diff) < 0.005 ? 'Balanced' : diff > 0 ? 'OVER' : 'SHORT', fmt(Math.abs(diff)), w));
  }
  if (session.actualCard != null && session.actualCard > 0) L.push(lr('Card settled', fmt(session.actualCard), w));
  if (session.actualOther != null && session.actualOther > 0) L.push(lr('Transfers', fmt(session.actualOther), w));
  L.push(divider(w));

  const denoms = parseDenominations(session.denominationBreakdown);
  if (denoms.length > 0) {
    L.push(center('CASH COUNT', w));
    for (const d of denoms) L.push(lr(`${fmt(d.value)} x ${d.count}`, fmt(d.value * d.count), w));
    L.push(lr('Counted total', fmt(denoms.reduce((t, d) => t + d.value * d.count, 0)), w));
    L.push(divider(w));
  }

  if (payouts.length > 0) {
    L.push(center('PAYOUTS', w));
    for (const p of payouts) L.push(lr(`${p.reason || 'Payout'} ${tm(p.createdAt)}`, `-${fmt(p.amount)}`, w));
    L.push(lr('Total payouts', `-${fmt(report.totalPayouts)}`, w));
    L.push(divider(w));
  }

  if (report.woPayments.length > 0) {
    L.push(center('TRANSACTIONS', w));
    for (const p of report.woPayments) {
      const who = p.workOrderNumber ?? 'Job';
      L.push(lr(`${who} ${p.method.toUpperCase()} ${tm(p.createdAt)}`, fmt(p.amount), w));
      if (p.customerName) L.push(`  ${p.customerName.slice(0, w - 2)}`);
    }
    L.push(divider(w));
  }

  const posRows = report.orders.filter((o) => o.status !== 'voided');
  if (posRows.length > 0) {
    L.push(center('POS TRANSACTIONS', w));
    for (const o of posRows) {
      L.push(lr(`${o.orderNumber} ${(o.paymentMethod ?? '').toUpperCase()}`, fmt(o.total), w));
    }
    L.push(divider(w));
  }

  if (session.closingNotes) {
    L.push('Notes: ' + session.closingNotes);
    L.push(divider(w));
  }

  // Custody: who holds the money, and the paper fallback for signing.
  L.push(center('CASH HANDOVER', w));
  const h = report.handover;
  if (!h) {
    L.push('No cash held from this shift.');
  } else if (h.status === 'signed') {
    L.push(lr('Handed over by', h.staffName, w));
    L.push(lr('Received by', h.receivedByName ?? '—', w));
    L.push(lr('Amount', fmt(h.receivedAmount ?? h.amount), w));
    L.push(lr('Signed', dt(h.signedAt), w));
    if (h.notes) L.push('Notes: ' + h.notes);
  } else {
    L.push(lr('Held by', h.staffName, w));
    L.push(lr('Amount', fmt(h.amount), w));
    L.push('AWAITING SIGNATURE');
    L.push('');
    L.push('Received by: ' + '_'.repeat(Math.max(4, w - 13)));
    L.push('');
    L.push('Signature:   ' + '_'.repeat(Math.max(4, w - 13)));
    L.push('');
    L.push('Date:        ' + '_'.repeat(Math.max(4, w - 13)));
  }
  L.push(divider(w));

  L.push(center('Printed ' + dt(new Date().toISOString()), w));
  L.push('');
  return L.join('\n');
}
