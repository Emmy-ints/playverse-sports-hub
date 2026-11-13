import { createFileRoute, notFound } from "@tanstack/react-router";
import { ComingSoon } from "@/components/game/ComingSoon";
import { PageShell } from "@/components/game/PageShell";
import { getSport } from "@/lib/sports";

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
      <div className="grid gap-4 sm:grid-cols-3">
        {s.modes.map((m) => <ComingSoon key={m} feature={m} detail="3D gameplay arrives in a later update." />)}
      </div>
    </PageShell>
  );
}
