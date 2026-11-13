import { Link } from "@tanstack/react-router";
import { MENU_ITEM, PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";
import { Logo } from "./Logo";

const sideLink = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground [&_svg]:size-5";
const sideActive = "bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]";

export function SideNav() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 px-3 py-5 backdrop-blur-xl lg:flex" aria-label="Main navigation">
      <Link to="/hub" className="mb-6 px-3"><Logo /></Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={sideLink} activeProps={{ className: sideActive }}><Icon aria-hidden />{label}</Link>
        ))}
        <div className="my-3 h-px bg-sidebar-border" />
        {SECONDARY_NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={sideLink} activeProps={{ className: sideActive }}><Icon aria-hidden />{label}</Link>
        ))}
      </nav>
      <div className="mt-4 flex gap-3 px-3 text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        <Link to="/terms" className="hover:text-foreground">Terms & rules</Link>
      </div>
    </aside>
  );
}

export function BottomTabBar() {
  const items = [...PRIMARY_NAV, MENU_ITEM];
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-navy-deep/90 pb-safe backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="group flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors active:scale-95" activeProps={{ className: "text-primary" }}>
              <Icon className="size-6 transition-transform group-hover:-translate-y-0.5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
