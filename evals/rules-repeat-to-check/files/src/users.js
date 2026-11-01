import { apiUrl } from './config.js';

export const profileUrl = id => `${apiUrl()}/users/${id}`;
