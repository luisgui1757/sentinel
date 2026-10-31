import { config } from '../config.js';
import { auth } from './auth.js';
import { validate } from './validate.js';
import { pricing } from './pricing.js';
import { audit } from './audit.js';

const registry = { auth, validate, pricing, audit };

export const chain = config.middleware.map(name => registry[name]);
