let overrides = {};

export const configure = values => { overrides = { ...overrides, ...values }; };

export const apiUrl = () => overrides.apiUrl ?? process.env.API_URL ?? 'https://api.example.com';
