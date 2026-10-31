---
type: llm
focus: trace
weight: 1
---

The reply says that the Acme limit keeps MAX_RETRIES at 3: Acme blocks an API key after 5 failed calls in one minute, so one failing request with 3 retries (4 calls) stays under the limit and one with 6 retries (7 calls) does not. A reply can add that several failing requests in one minute can still reach the limit. It cites issue #49 as the source of this limit. It can name the latency reason from PR #41 as the first reason for 3, but it does not give latency as the only reason. It advises against a raise to 6.
