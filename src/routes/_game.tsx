import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomTabBar, SideNav } from "@/components/game/AppNav";
import { TopBar } from "@/components/game/TopBar";

export const Route = createFileRoute("/_game")({ component: GameLayout });

function GameLayout() {
  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <div className="min-w-0 flex-1 pb-tabbar lg:pb-0">
        <TopBar />
        <main><Outlet /></main>
      </div>
      <BottomTabBar />
    </div>
  );
}
