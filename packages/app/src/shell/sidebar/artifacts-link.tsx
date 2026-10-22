import { Icon } from "@opencode/ui/icon"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/runtime/i18n/language"
import { useCurrentRoute } from "@/shell/state/layout"

// Fork: the single "Artifacts" entry under "New session" in the sidebar. Styled like the sidebar's own nav rows.
const NAV_ITEM =
  "flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[8px] px-2 text-[14px] leading-5 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base data-[active=true]:bg-v2-background-bg-layer-02 data-[active=true]:text-v2-text-text-base"

export function ArtifactsLink() {
  const navigate = useNavigate()
  const language = useLanguage()
  const route = useCurrentRoute()

  return (
    <button
      type="button"
      data-action="sidebar-artifacts"
      data-active={route().type === "artifacts"}
      class={NAV_ITEM}
      onClick={() => navigate("/artifacts")}
    >
      <Icon name="grid-plus" class="shrink-0" />
      <span class="truncate">{language.t("sidebar.artifacts")}</span>
    </button>
  )
}
