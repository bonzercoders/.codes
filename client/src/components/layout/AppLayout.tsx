import { type ReactNode } from "react"

import bonzerFavicon from "@/assets/bonzer_favicon.png"
import sidebarCollapseIcon from "@/assets/sidebar-collapse.png"
import { SIDEBAR_ITEMS, type AppRoute } from "@/lib/navigation"

interface AppLayoutProps {
  children: ReactNode
  currentRoute: AppRoute
  isSidebarCollapsed: boolean
  onNavigate: (route: AppRoute) => void
  onToggleSidebar: () => void
}

export function AppLayout({
  children,
  currentRoute,
  isSidebarCollapsed,
  onNavigate,
  onToggleSidebar,
}: AppLayoutProps) {
  const sidebarClassName = isSidebarCollapsed ? "app-sidebar is-collapsed" : "app-sidebar"
  const settingsItem = SIDEBAR_ITEMS.find((item) => item.route === "/settings")
  const primaryItems = SIDEBAR_ITEMS.filter((item) => item.route !== "/settings")

  const renderNavItem = (route: AppRoute, label: string, icon: string) => {
    const itemClassName = route === currentRoute ? "sidebar-nav__item is-active" : "sidebar-nav__item"

    return (
      <button
        aria-current={route === currentRoute ? "page" : undefined}
        aria-label={label}
        className={itemClassName}
        key={route}
        onClick={() => onNavigate(route)}
        title={isSidebarCollapsed ? label : undefined}
        type="button"
      >
        <img alt="" aria-hidden="true" className="sidebar-nav__icon" src={icon} />
        <span className="sidebar-nav__label">{label}</span>
      </button>
    )
  }

  return (
    <div className="app-root">
      <div className="app-layout">
        <aside className={sidebarClassName}>
          <div className="sidebar__inner">
            <header className="sidebar__header">
              <div className="sidebar__brand">
                <img alt="" aria-hidden="true" className="sidebar__brand-logo" src={bonzerFavicon} />
                <strong className="sidebar__brand-label">aiChat</strong>
              </div>
              <button
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="sidebar__toggle"
                onClick={onToggleSidebar}
                type="button"
              >
                <img alt="" aria-hidden="true" src={sidebarCollapseIcon} />
              </button>
            </header>

            <nav aria-label="Main navigation" className="sidebar__nav sidebar__nav--main">
              {primaryItems.map((item) => renderNavItem(item.route, item.label, item.icon))}
            </nav>

            {settingsItem ? (
              <nav aria-label="Settings navigation" className="sidebar__nav sidebar__nav--settings">
                {renderNavItem(settingsItem.route, settingsItem.label, settingsItem.icon)}
              </nav>
            ) : null}

            <div className="sidebar__bottom">
              <footer className="sidebar__footer">
                <img alt="" aria-hidden="true" className="sidebar-footer__logo" src={bonzerFavicon} />
                <div className="sidebar-footer__meta">
                  <span className="sidebar-footer__name">aiChat</span>
                  <span className="sidebar-footer__subline">Workspace</span>
                </div>
                <span aria-hidden="true" className="sidebar-footer__more">
                  ...
                </span>
              </footer>
            </div>
          </div>
        </aside>

        <main className="app-main-outer">
          <section className="app-main-panel">{children}</section>
        </main>
      </div>
    </div>
  )
}
