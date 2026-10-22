# Fork spec: OpenCode with a Claude-desktop experience

Goal: an open-source agent harness that feels as close to the Claude desktop app (Code tab) as possible.

Base: fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) (MIT). Upstream is tracked as the `upstream` remote; keep fork changes isolated (new packages/files where possible) so upstream merges stay easy.

## Must-haves

1. **Auto-compact**: automatic summarization near the context limit, plus a manual `/compact [focus hint]`.
2. **Remote access**: phone browser over Tailscale (private only), including starting new sessions remotely. PWA installable, with web push for "session finished" and "needs your answer".
3. **Artifacts (Claude Design equivalent)**: live HTML/React preview pane beside the chat; slide and document types the agent fills in; a design canvas for mockups/prototypes. Local only, no public share links.
4. **AskUserQuestion**: multiple-choice question cards (1–4 questions, 2–4 options, multi-select, always an "Other" free-text option, optional recommended option first).
5. **Sub-sessions and subagents**: background subagents that report back into the same chat, and visible child sessions in the sidebar that can be opened and steered.

## Preferences

| Area | Decision |
|---|---|
| Models | OpenAI-compatible APIs only: DeepSeek, OpenRouter, Moonshot (Kimi), Qwen, GLM. Ship as provider presets, with a per-session model picker. No local models. |
| Host | Native Windows desktop app on this PC. |
| UI | Close visual match to Claude desktop: session sidebar with groups/pinning, chat pane, side panes (diff, browser, artifacts, terminal, tasks), pinned task list under the latest message, next-step box at turn end. Own branding. |
| Permissions | Same mode switcher as Claude desktop: default (ask), accept edits, plan, auto (guardrails), bypass. Selectable per session. |
| Remote network | Tailscale only. |
| Notifications | PWA web push. |
| Git | Diff pane with commit; open PRs; watch CI and report failures; git worktree per session for parallel work. |
| Browser | Built-in browser pane the agent drives while the user watches. |
| Extras | Skills and slash commands, persistent memory, scheduled tasks. |
| Coding quality | [Ponytail](https://github.com/DietrichGebert/ponytail) skill installed (OpenCode is supported upstream). |

## What OpenCode already has vs. what to build

| Feature | Status in base | Work |
|---|---|---|
| Auto-compact | Built in | Add focus hint to `/compact` |
| Subagents / child sessions | Built in (task tool) | Sidebar tree, steering child sessions |
| Question tool | Built in | Card UI matching the spec above |
| Server / web mode | Built in | Phone-friendly layout, PWA, push, Tailscale setup |
| MCP, skills, plugins | Built in | Install Ponytail |
| Providers | OpenAI-compatible supported | Presets for the providers above |
| Permissions | allow/ask/deny rules, plan/build | Claude-style mode switcher |
| Diff | Partial | Commit UI, PR creation, CI watching |
| Worktrees | Check | Worktree per session |
| Artifacts / slides / docs / canvas | Missing | New build (largest item) |
| Browser pane | `plugin-browser` package exists, check | Pane UI |
| Memory, scheduler | Missing | New build |

## Status (2026-10-22)

| Feature | Status | Where |
|---|---|---|
| Runs on native Windows | Done | `bun run dev:desktop`; Windows fixes in `FORK_DECISIONS.md` |
| Provider presets | Done | DeepSeek, OpenRouter, Moonshot, Alibaba (Qwen), Z.AI lead every provider list |
| Ponytail | Done | Installed globally in `~/.config/opencode/opencode.json` |
| Permission modes | Done | Composer picker and Shift+Tab; enforced server-side |
| Question cards | Done | Header chips, 1–4 questions, AskUserQuestion guidance |
| Sessions sidebar | Done | Pins, groups, search, subagents nested under parents |
| Claude theme, hidden tab bar | Done | Default for new installs; selectable in Settings |
| Pinned task list | Done | Above the composer while tasks are open |
| Remote access, PWA, web push | Done | `REMOTE_ACCESS.md`; per-device push switch in server settings |
| Child sessions | Done | Nested in the sidebar; steerable while running |
| Worktree per session | Done | Default for new sessions in Git projects |
| Artifacts | Done | `artifact` tool opens files in the side panel; `.slides.md` decks |
| Git commit, push, PR, CI checks | Done | Git button in the session header |
| Memory | Done | `~/.config/opencode/memory/`, injected into every session |
| Scheduled tasks | Done | Settings → server → Scheduled tasks, or the `schedule` tool |
| `/compact` focus hint | Done | `/compact <what to keep>`; not yet tested against a live model |
| Claude Design (canvas on real code) | Done | `design.json` frames of real pages and the running app; point-and-comment; live reload; system tokens |
| Browser pane on web/phone | Not planned | Electron-only by design |
| CI auto-fix / background PR watcher | Not started | Checks refresh on demand |

## Build order

1. Get the fork building and running on native Windows.
2. Provider presets and Ponytail.
3. UI shell (Claude-desktop layout), permission modes, question cards.
4. Web/PWA, web push, Tailscale access.
5. Child sessions in the sidebar; worktree per session.
6. Artifacts (preview pane, then slides/docs, then canvas).
7. Browser pane.
8. Git PR + CI flow.
9. Memory and scheduled tasks.
