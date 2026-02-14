---
trigger: always_on
---

   * Always use context7 when I need code generation, setup or configuration steps, or
     library/API documentation. This means you should automatically use the Context7 MCP
     tools to resolve library ID and get library docs without me having to explicitly ask.
   * If you make UI changes, use MCP tools to test them in a real environment unless
     project-specific rules say not to
      * Use the Tauri MCP when working within a Tauri app
      * Use Playwright for other projects
