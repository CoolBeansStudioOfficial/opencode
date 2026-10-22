import { describe, expect, test } from "bun:test"
import { SchedulerPlugin } from "@opencode/core/plugin/scheduler"

const { nextRun } = SchedulerPlugin

// Local time, so the test holds in any time zone. 2026-10-22 is a Thursday (day 4).
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 9, day, hours, minutes).getTime()

describe("nextRun", () => {
  test.each([
    ["interval adds minutes", { kind: "interval", minutes: 30 } as const, at(22, 10), at(22, 10, 30)],
    ["interval has a one-minute floor", { kind: "interval", minutes: 0 } as const, at(22, 10), at(22, 10, 1)],
    ["daily later today", { kind: "daily", time: "17:00", days: [] } as const, at(22, 10), at(22, 17)],
    ["daily past time rolls to tomorrow", { kind: "daily", time: "09:00", days: [] } as const, at(22, 10), at(23, 9)],
    ["daily exactly now is not now", { kind: "daily", time: "10:00", days: [] } as const, at(22, 10), at(23, 10)],
    ["weekdays from Friday evening skip to Monday", { kind: "daily", time: "08:30", days: [1, 2, 3, 4, 5] } as const, at(23, 20), at(26, 8, 30)],
  ])("%s", (_, every, after, expected) => {
    expect(nextRun(every, after)).toBe(expected)
  })
})
