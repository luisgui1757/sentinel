export const log = message => process.stderr.write(`${new Date().toISOString()} ${message}\n`);
