# Monthly renewal

1. The renewal job sends one charge request to the payment provider. The request carries an idempotency key.
2. The provider charges the card once for each key. A request with a key that the provider already charged charges nothing.
3. A request can get lost before it reaches the provider. An answer can get lost after the provider charged the card.
4. When the job gets no answer to its first request in 30 seconds, and the month is still unpaid, it retries once. The retry uses a new idempotency key.
5. For each charge, the provider sends a "charged" webhook. The webhook marks the month as paid. A webhook is never lost, but it can arrive late.
6. While the month is unpaid, the customer can press "Pay now" in the app one time. "Pay now" sends a charge request with the key of the job's first request.
7. While the month is unpaid, support can press "Retry payment" in the admin tool one time. "Retry payment" sends a charge request with the key of the job's last request: the first key before the job retries, and the new key after.
