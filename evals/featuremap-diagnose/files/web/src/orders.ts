import { formatMoney } from '../../shared/src/money';
import { listOrders } from '../../db/src/query';

export const renderOrders = () => listOrders().map(o => `${o.id}: ${formatMoney(o.total)}`).join('\n');
