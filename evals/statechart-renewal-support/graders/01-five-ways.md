---
type: llm
focus: trace
weight: 1
---

The reply lists each of these five ways to pay twice, where each way names the two requests that charge the card: (1) the job's first request and the job's retry; (2) the job's retry and "Pay now"; (3) the job's first request and "Retry payment" with the new key; (4) "Retry payment" with the first key and the job's retry; (5) "Pay now" and "Retry payment" with the new key. A way can have more detail, such as which request or answer got lost and which webhook came late. The reply misses none of the five. It does not list a way that RENEWAL.md does not allow, such as the first request and "Pay now" both charging, or "Pay now" and "Retry payment" with the first key both charging, because these use the same key.
