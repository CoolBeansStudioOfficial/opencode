# Fork decisions log

Judgment calls made while building the fork without the owner present. Each entry says what was chosen, why, and how to undo it.

## 2026-10-22

- **Permission modes live in session metadata** (`permissionMode`), enforced by `packages/core/src/plugin/permission-mode.ts`. "Ask permissions" defers to your config, which currently allows `edit` and `bash` globally, so it won't prompt for those until you remove them from `~/.config/opencode/opencode.json`.
- **Plan mode reuses OpenCode's Plan agent.** It takes effect from the next message, not mid-turn, so a running turn is not reconfigured.
- **Sidebar pins and groups are stored per device** (browser storage), not on the server. Phone and desktop keep separate pins. Moving them server-side would need a new store; deferred.
- **The sidebar follows the server selected on Home.** With several servers configured, switch servers from Home.
- **Claude theme is the default only when no theme was chosen before.** Existing installs keep their stored theme; pick "Claude" in Settings → Appearance.
- **The tab bar is hidden by default** via a new "Hidden" tab layout. Tabs still exist internally (the sidebar opens sessions as tabs); choose Horizontal or Vertical in Settings → General to bring them back. Mobile keeps its tab drawer.
- **No custom fonts in the Claude theme.** Claude's typefaces are proprietary; the theme changes colors only and keeps Inter.
- **The task list sits above the composer**, not under the latest message, so it stays visible while the transcript scrolls. It shows only while a task is pending or in progress.
- **The `todowrite` tool is on by default** (upstream hides it behind `experimental.todo`); set `"experimental": { "todo": false }` to turn it off.
- **No end-to-end model tests yet.** Your homelab llama.cpp (port 8099) was down, and TabbyAPI (port 5000) needs `TABBY_API_KEY`, which isn't set on this PC. Features were tested with unit tests, the server API and the browser instead.
- **57 core tests fail on this Windows PC before and after the fork changes** (shell, ripgrep/search, symlink and location tests: 5,589 pass). They fail identically with the fork's permission plugin disabled, so they are environment issues (Windows shell, symlinks), not regressions. Run them under WSL or CI to compare.
- **Symlinked repo files are real copies on this PC** (Windows without Developer Mode). They are marked `skip-worktree`, so Git ignores local changes to them.
