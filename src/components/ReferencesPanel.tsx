import { REFERENCES, REFERENCE_GROUPS } from '../lib/references'

type ReferencesPanelProps = {
  id: string
}

export function ReferencesPanel({ id }: ReferencesPanelProps) {
  return (
    <section
      id={id}
      aria-label="References"
      className="mt-3 rounded-lg border border-surface-rule bg-surface-panel p-6"
    >
      <div className="space-y-6">
        {REFERENCE_GROUPS.map((group) => (
          <div key={group}>
            <h2 className="mb-3 border-b border-surface-rule pb-2 text-xs font-semibold uppercase tracking-widest text-ink-muted">
              {group}
            </h2>
            <ul className="space-y-3">
              {REFERENCES.filter((r) => r.group === group).map((ref) => (
                <li key={ref.id} className="text-sm">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink-primary underline hover:no-underline focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {ref.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <p className="mt-0.5 text-ink-secondary">{ref.supplies}</p>
                  <p className="text-xs text-ink-muted">{ref.asOf}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
