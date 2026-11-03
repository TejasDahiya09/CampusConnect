import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { internalSearchTarget } from './search-service';
import type { SearchResult } from './search.types';
const labels = {
  STUDENT: 'Student',
  MARKETPLACE: 'Marketplace',
  LOST_FOUND: 'Lost & Found',
  TEAMUP: 'TeamUp',
  SERVICE: 'Service',
} as const;
const initials = (title: string) =>
  title
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
export function SearchResultItem({
  compact = false,
  result,
  onNavigate,
}: {
  readonly compact?: boolean;
  readonly onNavigate?: () => void;
  readonly result: SearchResult;
}) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3 outline-none transition hover:bg-white/[.04] focus-visible:bg-white/[.06]"
      onClick={onNavigate}
      to={internalSearchTarget(result.navigationTarget)}
    >
      {result.image ? (
        <img alt="" className="size-11 shrink-0 rounded-lg object-cover" src={result.image} />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-indigo-400/10 text-xs font-bold text-indigo-200"
        >
          {initials(result.title)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{result.title}</span>
        {result.subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-slate-500">{result.subtitle}</span>
        ) : null}
        {!compact && result.description ? (
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-400">
            {result.description}
          </span>
        ) : null}
      </span>
      <Badge>{labels[result.type]}</Badge>
    </Link>
  );
}
