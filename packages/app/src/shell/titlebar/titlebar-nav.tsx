import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"

// Fork: Claude desktop's window chrome: menu, sidebar toggle, back and forward at the top left.
export function TitlebarNav(props: { menu: boolean; back: () => void; forward: () => void }) {
  const language = useLanguage()
  const command = useCommand()

  return (
    <div data-slot="titlebar-nav" class="flex shrink-0 items-center [app-region:no-drag]">
      <Show when={props.menu}>
        <Tooltip placement="bottom" value={language.t("titlebar.menu")}>
          <IconButton
            type="button"
            variant="ghost-muted"
            aria-label={language.t("titlebar.menu")}
            icon={<Icon name="menu" />}
            onClick={() => command.trigger("command.palette")}
          />
        </Tooltip>
      </Show>
      <Tooltip placement="bottom" value={language.t("command.sidebar.toggle")}>
        <IconButton
          type="button"
          variant="ghost-muted"
          aria-label={language.t("command.sidebar.toggle")}
          icon={<Icon name="sidebar-right" style={{ transform: "scaleX(-1)" }} />}
          onClick={() => command.trigger("sidebar.toggle")}
        />
      </Tooltip>
      <Tooltip placement="bottom" value={language.t("common.goBack")}>
        <IconButton
          type="button"
          variant="ghost-muted"
          aria-label={language.t("common.goBack")}
          icon={<Icon name="outline-arrow-left" />}
          onClick={props.back}
        />
      </Tooltip>
      <Tooltip placement="bottom" value={language.t("common.goForward")}>
        <IconButton
          type="button"
          variant="ghost-muted"
          aria-label={language.t("common.goForward")}
          icon={<Icon name="outline-arrow-right" />}
          onClick={props.forward}
        />
      </Tooltip>
    </div>
  )
}
