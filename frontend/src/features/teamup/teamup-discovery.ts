import type { TeamUpFilters, TeamUpProject } from './teamup.types';

export const teamUpStatuses = ['OPEN', 'FULL', 'COMPLETED', 'ARCHIVED'] as const;
export const teamUpSorts = ['newest', 'oldest', 'deadline'] as const;
export const defaultTeamUpDiscovery: TeamUpFilters = {
  keyword: '',
  skill: '',
  status: 'OPEN',
  sort: 'newest',
  page: 1,
  limit: 12,
};
export const teamUpLabel = (value: string) =>
  value.toLowerCase().replace(/^./, (character) => character.toUpperCase());
export function readTeamUpDiscovery(params: URLSearchParams): TeamUpFilters {
  const status = params.get('status'),
    sort = params.get('sort'),
    rawPage = params.get('page') ?? '1';
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    ...defaultTeamUpDiscovery,
    keyword: (params.get('keyword') ?? '').trim().slice(0, 100),
    skill: (params.get('skill') ?? '').trim().slice(0, 50),
    status:
      status === 'all'
        ? ''
        : teamUpStatuses.includes(status as (typeof teamUpStatuses)[number])
          ? (status as TeamUpFilters['status'])
          : 'OPEN',
    sort: teamUpSorts.includes(sort as TeamUpFilters['sort'])
      ? (sort as TeamUpFilters['sort'])
      : 'newest',
    page: Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
  };
}
export function writeTeamUpDiscovery(state: TeamUpFilters): URLSearchParams {
  const result = new URLSearchParams();
  if (state.keyword) result.set('keyword', state.keyword.trim().slice(0, 100));
  if (state.skill) result.set('skill', state.skill.trim().slice(0, 50));
  // 'all' is a URL-only sentinel; the existing API omits an empty status.
  if (state.status !== 'OPEN') result.set('status', state.status || 'all');
  if (state.sort !== 'newest') result.set('sort', state.sort);
  if (state.page > 1) result.set('page', String(state.page));
  return result;
}
export const hasTeamUpCriteria = (state: TeamUpFilters) =>
  !!state.keyword || !!state.skill || state.status !== 'OPEN';
export function teamUpCapacity(project: TeamUpProject): string {
  const places = Math.max(0, project.maxMembers - project.currentMemberCount);
  if (project.status === 'COMPLETED' || project.status === 'ARCHIVED') return 'Recruitment closed';
  if (project.status === 'FULL' || places === 0) return 'Full team';
  return `${places} ${places === 1 ? 'place' : 'places'} available`;
}
export function teamUpDeadline(value: string | null): string {
  if (!value) return 'No deadline';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? 'Deadline not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
