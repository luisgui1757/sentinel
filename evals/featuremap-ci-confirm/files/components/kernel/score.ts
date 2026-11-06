import type { Plan } from '@part/planner/plan';
import { UNIT } from './units';

export const score = (plan: Plan) => plan.steps * UNIT;
