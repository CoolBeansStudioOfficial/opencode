export * as GitActionsPlugin from "./git-actions.js"

import { define } from "@opencode/plugin/effect/plugin"
import { GitActions } from "@opencode/schema/git-actions"
import { Effect, Schema } from "effect"
import { isAbsolute } from "node:path"

// Fork: user-initiated git and GitHub actions for the session header. Commands run in this location's directory;
// failures come back as `{ ok: false, output }` so the UI can show git's own message.
type Run = { code: number; stdout: string; stderr: string }

const run = (cwd: string, command: string[]) =>
  Effect.promise(async (): Promise<Run> => {
    try {
      const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
      const [stdout, stderr, code] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ])
      return { code, stdout: stdout.trim(), stderr: stderr.trim() }
    } catch (error) {
      return { code: -1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
    }
  })

const result = (value: Run, url?: string): GitActions.Result => ({
  ok: value.code === 0,
  output: [value.stdout, value.stderr].filter(Boolean).join("\n"),
  ...(url ? { url } : {}),
})

const decodePR = Schema.decodeUnknownOption(Schema.fromJsonString(GitActions.PullRequest))
const decodeChecks = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(GitActions.Check)))

// "https://github.com/owner/name.git" or "git@github.com:owner/name.git" → "owner/name"
export const repositoryName = (remote: string) =>
  remote.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/)?.[1]

export const Plugin = define({
  id: "opencode.git-actions",
  effect: Effect.fn(function* (ctx) {
    const hasGh = () => !!Bun.which("gh")

    // A relative directory falls back to the server location rather than the process working directory.
    const tools = (directory: string) => {
      const cwd = isAbsolute(directory) ? directory : ctx.location.directory
      const git = (...args: string[]) => run(cwd, ["git", ...args])
      const gh = (...args: string[]) => run(cwd, ["gh", ...args])
      const originRepository = Effect.gen(function* () {
        const remote = yield* git("remote", "get-url", "origin")
        return remote.code === 0 ? repositoryName(remote.stdout) : undefined
      })
      return { git, gh, originRepository }
    }

    yield* ctx.rpc
      .register(GitActions.Definition, {
        status: ({ directory }) =>
          Effect.gen(function* () {
            const { git, gh, originRepository } = tools(directory)
            const empty = { repository: false, ahead: 0, behind: 0, changes: 0, gh: hasGh(), checks: [] }
            const inside = yield* git("rev-parse", "--is-inside-work-tree")
            if (inside.code !== 0) return empty
            const branch = yield* git("rev-parse", "--abbrev-ref", "HEAD")
            const upstream = yield* git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
            const counts =
              upstream.code === 0 ? yield* git("rev-list", "--left-right", "--count", "@{upstream}...HEAD") : undefined
            const [behind = 0, ahead = 0] = counts?.code === 0 ? counts.stdout.split(/\s+/).map(Number) : []
            const changes = yield* git("status", "--porcelain")
            // RPC output must be JSON, so absent fields are omitted rather than undefined.
            const status = {
              repository: true,
              ...(branch.code === 0 ? { branch: branch.stdout } : {}),
              ...(upstream.code === 0 ? { upstream: upstream.stdout } : {}),
              ahead,
              behind,
              changes: changes.code === 0 ? changes.stdout.split("\n").filter(Boolean).length : 0,
              gh: hasGh(),
              checks: [],
            }
            if (!status.gh || !status.upstream) return status
            const repo = yield* originRepository
            const target = repo ? ["--repo", repo] : []
            const view = yield* gh("pr", "view", status.branch ?? "", ...target, "--json", "number,url,state,title")
            const pr = view.code === 0 ? decodePR(view.stdout) : undefined
            if (pr?._tag !== "Some") return status
            const checks = yield* gh("pr", "checks", String(pr.value.number), ...target, "--json", "name,bucket,link")
            const decoded = checks.stdout ? decodeChecks(checks.stdout) : undefined
            return { ...status, pr: pr.value, checks: decoded?._tag === "Some" ? decoded.value : [] }
          }),
        commit: ({ directory, message }) =>
          Effect.gen(function* () {
            const { git } = tools(directory)
            if (!message.trim()) return { ok: false, output: "Write a commit message first." }
            const staged = yield* git("add", "-A")
            if (staged.code !== 0) return result(staged)
            return result(yield* git("commit", "-m", message))
          }),
        push: ({ directory }) =>
          Effect.gen(function* () {
            const { git } = tools(directory)
            const upstream = yield* git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
            return result(yield* (upstream.code === 0 ? git("push") : git("push", "-u", "origin", "HEAD")))
          }),
        createPR: ({ directory, title, body, draft }) =>
          Effect.gen(function* () {
            const { gh, originRepository } = tools(directory)
            if (!hasGh()) return { ok: false, output: "Install the GitHub CLI (gh) and run `gh auth login` first." }
            const repo = yield* originRepository
            if (!repo) return { ok: false, output: "The origin remote is not a GitHub repository." }
            const created = yield* gh(
              "pr",
              "create",
              "--repo",
              repo,
              "--title",
              title,
              "--body",
              body,
              ...(draft ? ["--draft"] : []),
            )
            return result(created, created.code === 0 ? created.stdout.split("\n").pop() : undefined)
          }),
      })
      .pipe(Effect.orDie)
  }),
})
