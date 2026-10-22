import { Icon, type IconProps } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { createMediaQuery } from "@solid-primitives/media"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { sessionInfo } from "@/session/info/state"

// Fork: Claude desktop's pane icons, shown in the titlebar on session routes. Each one triggers the command that
// already owns its pane.
export function SessionPaneButtons() {
  const language = useLanguage()
  const command = useCommand()
  const wide = createMediaQuery("(min-width: 1500px)")

  const button = (label: string, icon: IconProps["name"], onClick: () => void, pressed?: boolean) => (
    <Tooltip placement="bottom" value={label}>
      <IconButton
        type="button"
        variant="ghost-muted"
        size="large"
        state={pressed ? "pressed" : undefined}
        aria-label={label}
        icon={<Icon name={icon} />}
        onClick={onClick}
      />
    </Tooltip>
  )

  return (
    <div data-slot="session-pane-buttons" class="flex items-center [app-region:no-drag]">
      <Show when={wide()}>
        {button(language.t("session.pane.info"), "info", sessionInfo.toggle, sessionInfo.open())}
      </Show>
      {button(language.t("session.pane.preview"), "review", () => command.trigger("review.toggle"))}
      {button(language.t("session.pane.terminal"), "code-slash", () => command.trigger("terminal.toggle"))}
      {button(language.t("session.pane.files"), "filetree", () => command.trigger("file.open"))}
      {button(language.t("session.pane.browser"), "outline-globe", () => command.trigger("browser.open"))}
      {button(language.t("common.moreOptions"), "outline-dots", () => command.trigger("command.palette"))}
    </div>
  )
}
