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
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
      </svg>
      {greeting()}
    </h1>
  )
}
