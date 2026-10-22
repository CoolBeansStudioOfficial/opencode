import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"

// Fork: "/artifacts" in the composer, and the command palette, open the Artifacts page.
export function useArtifactsCommand() {
  const command = useCommand()
  const language = useLanguage()
  const navigate = useNavigate()

  command.register("artifacts", () => [
    {
      id: "artifacts.open",
      title: language.t("command.artifacts.open"),
      category: language.t("command.category.session"),
      slash: "artifacts",
      onSelect: () => navigate("/artifacts"),
    },
  ])
}
