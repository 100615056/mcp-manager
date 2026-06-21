# Changelog

All notable changes to `@waycraft/mcp-manager` are documented here.

## [0.2.0] — 2026-06-21

### Added
- **Restart backoff** — exponential backoff (5s → 15s → 45s) on crash restarts instead of fixed 5-second loops.
- **Unrecoverable error detection** — `Cannot find module`, `ENOENT`, `EACCES`, `command not found` skip restart entirely and go straight to `failed` state.
- **Human-readable errors** — `mcp_status` shows plain-English error messages instead of raw stderr.
- **Still-down alerts** — servers that remain failed across checks are flagged.
- **Troubleshooting FAQ** — `mcp_help` tool with common fixes.
- **Scope filtering** — `mcp_status` accepts an optional scope parameter to filter by project/user/global.
- **Cross-platform config discovery** — finds Claude Code settings on macOS, Linux, and Windows.
- **Dashboard redesign** — responsive layout, works in any terminal browser.
- Setup docs for Cursor, VS Code, and Windsurf.

### Fixed
- Config reload on `mcp_restart --force` — no longer uses stale cached paths.

## [0.1.0] — 2026-06-10

- Initial release — daemon-based MCP server manager with live status, restart, and config tools.
