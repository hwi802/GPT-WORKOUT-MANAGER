# FitLog MCP read-only PoC

This server verifies one path:

`ChatGPT -> get_recent_workouts -> structured workout data`

It intentionally returns a fixed, non-sensitive sample. The next milestone will
replace `sampleWorkouts` with a database-backed repository function.

## Run

```bash
npm install
npm start
```

The MCP endpoint is `http://localhost:8787/mcp`.
