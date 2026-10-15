import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { CycleUpdateGroup, StageUpdateView } from "@/lib/stage-updates/present";

/** Every item states WHO published it, WHEN (only if the official page says so)
 *  and links to the official source — nothing is shown without that provenance. */
function UpdateRow({ u, muted }: { u: StageUpdateView; muted?: boolean }) {
  return (
    <li className={muted ? "py-2 opacity-80" : "py-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={muted ? "neutral" : "brand"}>{u.typeLabel}</Badge>
        {u.isLatest ? <Badge tone="positive">Latest verified</Badge> : <Badge tone="neutral">Replaced by a newer version</Badge>}
        {u.version > 1 && <span className="text-xs text-ink-faint">Version {u.version}</span>}
      </div>
      <p className="mt-1.5 break-words text-[15px] font-medium text-ink">{u.title}</p>
      {u.eventDate && <p className="mt-0.5 text-sm text-ink-muted">Date stated in the notice: {formatDate(u.eventDate)}</p>}
      <p className="mt-1 text-xs text-ink-muted">
        {u.organization}
        {" · "}
        {u.publicationDate ? `Published ${formatDate(u.publicationDate)}` : "Publication date not stated"}
        {" · "}
        <a href={u.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline">
          Official source
        </a>
      </p>
    </li>
  );
}

export function OfficialUpdatesList({ groups }: { groups: CycleUpdateGroup[] }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <Card key={g.cycleId} className="p-4">
          <p className="text-[15px] font-semibold text-ink">
            {g.examName} <span className="font-normal text-ink-muted">· {g.cycleLabel}</span>
          </p>
          {g.latest.length > 0 && (
            <ul className="mt-1 divide-y divide-hairline">
              {g.latest.map((u) => <UpdateRow key={u.id} u={u} />)}
            </ul>
          )}
          {g.history.length > 0 && (
            <details className="mt-2 border-t border-hairline pt-2">
              <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                Earlier versions ({g.history.length})
              </summary>
              <ul className="mt-1 divide-y divide-hairline">
                {g.history.map((u) => <UpdateRow key={u.id} u={u} muted />)}
              </ul>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
