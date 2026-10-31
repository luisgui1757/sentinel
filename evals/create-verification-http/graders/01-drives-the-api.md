---
type: llm
focus: trace
weight: 1
---

The commands that the agent ran show that it started the API with a data file outside the repo and sent real HTTP requests to /health, GET /notes and POST /notes, directly or through a script that it wrote and ran. The output shows the responses, or shows that the checks of these responses passed. The way that the agent added for later agents does the same steps and stops only the server process that it started. Reading code, or writing commands that nobody ran, fails.
