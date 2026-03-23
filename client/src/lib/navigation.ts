import agentsIcon from "@/assets/agents.png"
import charactersIcon from "@/assets/characters.png"
import homeIcon from "@/assets/home.png"
import settingsIcon from "@/assets/settings.png"
import voicesIcon from "@/assets/voices.png"

export type AppRoute = "/home" | "/agents" | "/characters" | "/voices" | "/settings"

interface SidebarItem {
  icon: string
  label: string
  route: AppRoute
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    icon: homeIcon,
    label: "Home",
    route: "/home",
  },
  {
    icon: agentsIcon,
    label: "Agents",
    route: "/agents",
  },
  {
    icon: charactersIcon,
    label: "Characters",
    route: "/characters",
  },
  {
    icon: voicesIcon,
    label: "Voices",
    route: "/voices",
  },
  {
    icon: settingsIcon,
    label: "Settings",
    route: "/settings",
  },
]