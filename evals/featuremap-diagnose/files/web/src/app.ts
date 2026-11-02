import { renderOrders } from './orders';
import { formatMoney } from '../../shared/src/money';

export const app = () => `${renderOrders()} ${formatMoney(0)}`;
