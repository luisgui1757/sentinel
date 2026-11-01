const pad = n => String(n).padStart(2, '0');

export const formatDate = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth())}-${pad(date.getUTCDate())}`;
