export const fetchOrders = async () => (await fetch('/api/orders')).json();
