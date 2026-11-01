export async function charge(gateway, order, mail) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await gateway.charge(order.total);
    if (result.ok) return { status: 'paid', attempt };
    if (result.code === 'card_declined') break;
    await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000));
  }
  if (order.total >= 10000) await mail.send(order.email, 'payment-failed');
  return { status: 'failed' };
}
