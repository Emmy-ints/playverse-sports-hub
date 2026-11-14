import { createFileRoute, notFound } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ComingSoon } from "@/components/game/ComingSoon";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { getSport } from "@/lib/sports";
import { PrivateRoomCard } from "@/components/game/PrivateRoom";

export const Route = createFileRoute("/_game/sports/$sport")({
  loader: ({ params }) => { const s = getSport(params.sport); if (!s) throw notFound(); return s; },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.venue ?? "Sport"} — PLAYVERSE` }, { name: "description", content: loaderData?.description ?? "" },
    { property: "og:title", content: `${loaderData?.venue ?? "Sport"} — PLAYVERSE` }, { property: "og:description", content: loaderData?.description ?? "" },
  ] }),
  component: SportPage,
});

function SportPage() {
  const s = Route.useLoaderData();
  return (
    <PageShell eyebrow={s.name} title={s.venue} description={s.tagline}>
      <img src={s.image} alt="" width={1024} height={768} className="mb-6 h-56 w-full rounded-3xl object-cover sm:h-80" />
      {s.id === "bowling" || s.id === "golf" || s.id === "tennis" || s.id === "racing" || s.id === "athletics" || s.id === "parkour" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass rounded-2xl p-6">
            <h2 className="text-2xl font-bold uppercase">Practice</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.id === "bowling" ? "A full ten-frame game with real 3D physics. Not ranked." : s.id === "golf" ? "3, 9 or 18 holes on three courses with real ball flight, wind and terrain. Not ranked." : s.id === "tennis" ? "A match against an AI opponent on hard, clay, grass, indoor or night courts. Not ranked." : s.id === "athletics" ? "A championship or single events against up to seven rival athletes. Not ranked." : s.id === "parkour" ? "Race up to three computer free-runners across the rooftops. Not ranked." : "Race up to five AI drivers on three circuits. Not ranked."}
            </p>
            <GameButton asChild variant="hot" className="mt-4">{s.id === "bowling" ? <Link to="/play/bowling">Play practice</Link> : s.id === "golf" ? <Link to="/play/golf">Play practice</Link> : s.id === "tennis" ? <Link to="/play/tennis">Play practice</Link> : s.id === "athletics" ? <Link to="/play/athletics">Play practice</Link> : s.id === "parkour" ? <Link to="/play/parkour">Play practice</Link> : <Link to="/play/racing">Play practice</Link>}</GameButton>
          </div>
          <div className="glass rounded-2xl p-6">
            <h2 className="text-2xl font-bold uppercase">1v1 Online</h2>
            <p className="mt-1 text-sm text-muted-foreground">Challenge a friend. {s.id === "tennis" || s.id === "racing" || s.id === "athletics" || s.id === "parkour" ? "Live 1v1 on the PLAYVERSE real-time game server." : `Every ${s.id === "bowling" ? "throw" : "shot"} is simulated and scored on the server.`}</p>
            <GameButton asChild variant="primary" className="mt-4"><Link to="/friends">Challenge a friend</Link></GameButton>
          </div>
          <div className="sm:col-span-2"><PrivateRoomCard sport={s.id} /></div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {s.modes.map((m) => <ComingSoon key={m} feature={m} detail="3D gameplay arrives in a later update." />)}
        </div>
      )}
    </PageShell>
  );
}
