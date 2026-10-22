import type { Artifacts } from "@opencode/schema/artifacts"

export const KINDS: Artifacts.Kind[] = ["html", "markdown", "slides", "svg", "csv", "design"]

export const kindLabelKey = (kind: Artifacts.Kind) => `artifacts.kind.${kind}` as const

/** The folder segment of a path: the project name shown on a card. */
export const projectName = (directory: string) => directory.replaceAll("\\", "/").replace(/\/+$/, "").split("/").pop() ?? directory
