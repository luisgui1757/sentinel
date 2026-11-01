---
type: llm
focus: trace
weight: 1
---

The reply says that NoDoubleCharge is not a bug in the code. The model sends a second charge on retry, but retryPay in src/order.js reuses the idempotency key of the first charge, so the code charges once. The reply says that the model is out of date for retries.
