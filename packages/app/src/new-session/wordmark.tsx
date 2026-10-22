import { useLanguage } from "@/runtime/i18n/language"

// Fork: Claude desktop greets with a large serif line instead of a logo wordmark.
export function NewSessionWordmark() {
  const language = useLanguage()
  const hour = new Date().getHours()
  const greeting = () =>
    hour < 5
      ? language.t("home.greeting.night")
      : hour < 12
        ? language.t("home.greeting.morning")
        : hour < 18
          ? language.t("home.greeting.afternoon")
          : language.t("home.greeting.evening")

  return (
    <h1
      data-component="new-session-greeting"
      class="mx-auto w-full max-w-[720px] text-center text-[36px] leading-[44px] tracking-[-0.01em] text-v2-text-text-base [font-weight:400]"
    >
      {greeting()}
    </h1>
  )
}
