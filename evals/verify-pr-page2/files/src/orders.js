export const orders = [
  { id: 1, total: 1250, items: ['mug', 'tea'] },
  { id: 2, total: 990, items: ['notebook'] },
];

export const findOrder = id => orders.find(o => o.id === id);
