import type { DesktopTheme } from "./types"
import oc2ThemeJson from "./themes/oc-2.json"
import amoledThemeJson from "./themes/amoled.json"
import auraThemeJson from "./themes/aura.json"
import ayuThemeJson from "./themes/ayu.json"
import carbonfoxThemeJson from "./themes/carbonfox.json"
import catppuccinThemeJson from "./themes/catppuccin.json"
import catppuccinFrappeThemeJson from "./themes/catppuccin-frappe.json"
import catppuccinMacchiatoThemeJson from "./themes/catppuccin-macchiato.json"
import cobalt2ThemeJson from "./themes/cobalt2.json"
import cursorThemeJson from "./themes/cursor.json"
import draculaThemeJson from "./themes/dracula.json"
import everforestThemeJson from "./themes/everforest.json"
import flexokiThemeJson from "./themes/flexoki.json"
import claudeThemeJson from "./themes/claude.json"
import githubThemeJson from "./themes/github.json"
import gruvboxThemeJson from "./themes/gruvbox.json"
import kanagawaThemeJson from "./themes/kanagawa.json"
import lucentOrngThemeJson from "./themes/lucent-orng.json"
import materialThemeJson from "./themes/material.json"
import matrixThemeJson from "./themes/matrix.json"
import mercuryThemeJson from "./themes/mercury.json"
import monokaiThemeJson from "./themes/monokai.json"
import nightowlThemeJson from "./themes/nightowl.json"
import nordThemeJson from "./themes/nord.json"
import oneDarkThemeJson from "./themes/one-dark.json"
import oneDarkProThemeJson from "./themes/onedarkpro.json"
import orngThemeJson from "./themes/orng.json"
import osakaJadeThemeJson from "./themes/osaka-jade.json"
import palenightThemeJson from "./themes/palenight.json"
import rosepineThemeJson from "./themes/rosepine.json"
import shadesOfPurpleThemeJson from "./themes/shadesofpurple.json"
import solarizedThemeJson from "./themes/solarized.json"
import synthwave84ThemeJson from "./themes/synthwave84.json"
import tokyonightThemeJson from "./themes/tokyonight.json"
import vercelThemeJson from "./themes/vercel.json"
import vesperThemeJson from "./themes/vesper.json"
import zenburnThemeJson from "./themes/zenburn.json"

// SAFETY: every bundled ./themes/*.json file is authored against desktop-theme.schema.json (its "$schema"), the JSON
// form of DesktopTheme. JSON imports widen its "#rrggbb" and "var(--…)" literals to string, which these assertions
// narrow back; TypeScript still rejects a file whose structure does not overlap DesktopTheme.
export const oc2Theme = oc2ThemeJson as DesktopTheme,
  amoledTheme = amoledThemeJson as DesktopTheme,
  auraTheme = auraThemeJson as DesktopTheme,
  ayuTheme = ayuThemeJson as DesktopTheme,
  carbonfoxTheme = carbonfoxThemeJson as DesktopTheme,
  catppuccinTheme = catppuccinThemeJson as DesktopTheme,
  catppuccinFrappeTheme = catppuccinFrappeThemeJson as DesktopTheme,
  catppuccinMacchiatoTheme = catppuccinMacchiatoThemeJson as DesktopTheme,
  cobalt2Theme = cobalt2ThemeJson as DesktopTheme,
  cursorTheme = cursorThemeJson as DesktopTheme,
  draculaTheme = draculaThemeJson as DesktopTheme,
  everforestTheme = everforestThemeJson as DesktopTheme,
  flexokiTheme = flexokiThemeJson as DesktopTheme,
  claudeTheme = claudeThemeJson as DesktopTheme,
  githubTheme = githubThemeJson as DesktopTheme,
  gruvboxTheme = gruvboxThemeJson as DesktopTheme,
  kanagawaTheme = kanagawaThemeJson as DesktopTheme,
  lucentOrngTheme = lucentOrngThemeJson as DesktopTheme,
  materialTheme = materialThemeJson as DesktopTheme,
  matrixTheme = matrixThemeJson as DesktopTheme,
  mercuryTheme = mercuryThemeJson as DesktopTheme,
  monokaiTheme = monokaiThemeJson as DesktopTheme,
  nightowlTheme = nightowlThemeJson as DesktopTheme,
  nordTheme = nordThemeJson as DesktopTheme,
  oneDarkTheme = oneDarkThemeJson as DesktopTheme,
  oneDarkProTheme = oneDarkProThemeJson as DesktopTheme,
  orngTheme = orngThemeJson as DesktopTheme,
  osakaJadeTheme = osakaJadeThemeJson as DesktopTheme,
  palenightTheme = palenightThemeJson as DesktopTheme,
  rosepineTheme = rosepineThemeJson as DesktopTheme,
  shadesOfPurpleTheme = shadesOfPurpleThemeJson as DesktopTheme,
  solarizedTheme = solarizedThemeJson as DesktopTheme,
  synthwave84Theme = synthwave84ThemeJson as DesktopTheme,
  tokyonightTheme = tokyonightThemeJson as DesktopTheme,
  vercelTheme = vercelThemeJson as DesktopTheme,
  vesperTheme = vesperThemeJson as DesktopTheme,
  zenburnTheme = zenburnThemeJson as DesktopTheme

export const DEFAULT_THEMES = {
  "oc-2": oc2Theme,
  amoled: amoledTheme,
  aura: auraTheme,
  ayu: ayuTheme,
  carbonfox: carbonfoxTheme,
  claude: claudeTheme,
  catppuccin: catppuccinTheme,
  "catppuccin-frappe": catppuccinFrappeTheme,
  "catppuccin-macchiato": catppuccinMacchiatoTheme,
  cobalt2: cobalt2Theme,
  cursor: cursorTheme,
  dracula: draculaTheme,
  everforest: everforestTheme,
  flexoki: flexokiTheme,
  github: githubTheme,
  gruvbox: gruvboxTheme,
  kanagawa: kanagawaTheme,
  "lucent-orng": lucentOrngTheme,
  material: materialTheme,
  matrix: matrixTheme,
  mercury: mercuryTheme,
  monokai: monokaiTheme,
  nightowl: nightowlTheme,
  nord: nordTheme,
  "one-dark": oneDarkTheme,
  onedarkpro: oneDarkProTheme,
  orng: orngTheme,
  "osaka-jade": osakaJadeTheme,
  palenight: palenightTheme,
  rosepine: rosepineTheme,
  shadesofpurple: shadesOfPurpleTheme,
  solarized: solarizedTheme,
  synthwave84: synthwave84Theme,
  tokyonight: tokyonightTheme,
  vercel: vercelTheme,
  vesper: vesperTheme,
  zenburn: zenburnTheme,
} satisfies Record<string, DesktopTheme>
