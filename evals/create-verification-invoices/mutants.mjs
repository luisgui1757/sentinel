const swap = (from, to) => source => {
  if (!source.includes(from)) throw new Error(`mutant does not apply: ${from}`);
  return source.split(from).join(to);
};

export const breaks = {
  'the list drops the last invoice': swap('return send(res, 200, load());', 'return send(res, 200, load().slice(0, -1));'),
  'a new invoice is not saved': swap('    invoices.push(invoice);\n    save(invoices);\n', '    invoices.push(invoice);\n'),
  'paying keeps the invoice open': swap("    invoice.status = 'paid';\n", ''),
  'totals count paid invoices as open': swap('totals[invoice.status] += invoice.amount;', 'totals.open += invoice.amount;'),
  'the export drops one invoice': swap('...invoices.map(invoice =>', '...invoices.slice(0, -1).map(invoice =>'),
};

export const refactors = {
  'the send helper is renamed': swap('send', 'reply'),
  'the data file has no indentation': swap('JSON.stringify(invoices, null, 2)', 'JSON.stringify(invoices)'),
  'the export takes 2 seconds': swap('setTimeout(() => runExport(job), 300);', 'setTimeout(() => runExport(job), 2000);'),
};
