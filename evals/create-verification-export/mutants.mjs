export const mutants = {
  'export file is never written': source => source.replace("  fs.writeFileSync(path.join(exportDir, `${job.id}.csv`), lines.join('\\n') + '\\n');\n", ''),
  'export drops one invoice': source => source.replace('...invoices.map(invoice =>', '...invoices.slice(0, -1).map(invoice =>'),
};
