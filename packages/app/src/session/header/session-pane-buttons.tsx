import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { createMediaQuery } from "@solid-primitives/media"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { sessionInfo } from "@/session/info/state"

// Fork: Claude desktop's pane icons in the session bar. Each one triggers the command that already owns its pane.
export function SessionPaneButtons() {
  const language = useLanguage()
  const command = useCommand()
  const wide = createMediaQuery("(min-width: 1500px)")

  return (
    <div data-slot="session-pane-buttons" class="flex items-center">
      <Show when={wide()}>
        <Tooltip placement="bottom" value={language.t("session.pane.info")}>
          <IconButton
            type="button"
            variant="ghost-muted"
            size="large"
            state={sessionInfo.open() ? "pressed" : undefined}
            aria-label={language.t("session.pane.info")}
            aria-pressed={sessionInfo.open()}
            icon={<Icon name="info" />}
            onClick={sessionInfo.toggle}
          />
        </Tooltip>
      </Show>
      <Tooltip placement="bottom" value={language.t("session.pane.terminal")}>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          aria-label={language.t("session.pane.terminal")}
          icon={<Icon name="code-slash" />}
          onClick={() => command.trigger("terminal.toggle")}
        />
      </Tooltip>
      <Tooltip placement="bottom" value={language.t("session.pane.browser")}>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          aria-label={language.t("session.pane.browser")}
          icon={<Icon name="outline-globe" />}
          onClick={() => command.trigger("browser.open")}
        />
      </Tooltip>
    </div>
  )
}
