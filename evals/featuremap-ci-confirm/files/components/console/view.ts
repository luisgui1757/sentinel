import type { Plan } from '@part/planner/plan';
import { UNIT } from '@part/kernel/units';

export const view = (plan: Plan) => `${plan.steps * UNIT}`;
