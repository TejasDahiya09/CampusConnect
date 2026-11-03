import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Modal, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { studentsApi } from '../students/students-service';
import type { ProjectRecommendation } from '../students/students.types';
import { teamUpApi } from './teamup-service';
import type { TeamUpFilters as Filters, TeamUpPageResult } from './teamup.types';
import {
  defaultTeamUpDiscovery,
  hasTeamUpCriteria,
  readTeamUpDiscovery,
  teamUpLabel,
  writeTeamUpDiscovery,
} from './teamup-discovery';
import { TeamUpProjectCard } from './TeamUpProjectCard';
import { TeamUpFilters } from './TeamUpFilters';
import { TeamUpHero } from './TeamUpHero';
import { TeamUpRecommendations } from './TeamUpRecommendations';
import './teamup.css';

const subscribeMobileLayout = (onChange: () => void) => {
  const media = window.matchMedia('(max-width: 767px)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const mobileLayoutSnapshot = () => window.matchMedia('(max-width: 767px)').matches;
const desktopServerSnapshot = () => false;

export function TeamUpPage() {
  const mobileLayout = useSyncExternalStore(
    subscribeMobileLayout,
    mobileLayoutSnapshot,
    desktopServerSnapshot,
  );
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readTeamUpDiscovery(params), [params]);
  const canonical = writeTeamUpDiscovery(state).toString();
  const actual = params.toString();
  const [attempt, setAttempt] = useState(0);
  const key = `${canonical}|${attempt}`;
  const [record, setRecord] = useState<{
    key: string;
    data: TeamUpPageResult | null;
    error: string | null;
  } | null>(null);
  const [draft, setDraft] = useState({
    key: canonical,
    keyword: state.keyword,
    skill: state.skill,
  });
  const keyword = draft.key === canonical ? draft.keyword : state.keyword;
  const skill = draft.key === canonical ? draft.skill : state.skill;
  const pendingInput = keyword.trim() !== state.keyword || skill.trim() !== state.skill;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const [recommendations, setRecommendations] = useState<readonly ProjectRecommendation[] | null>(
    null,
  );
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationAttempt, setRecommendationAttempt] = useState(0);
  useEffect(() => {
    if (actual !== canonical) setParams(new URLSearchParams(canonical), { replace: true });
  }, [actual, canonical, setParams]);
  useEffect(() => {
    if (actual !== canonical) return;
    const controller = new AbortController();
    void teamUpApi
      .getProjects(state, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, data.pagination.totalPages);
        if (state.page > lastPage) {
          setParams(writeTeamUpDiscovery({ ...state, page: lastPage }), { replace: true });
          return;
        }
        setRecord({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRecord({
            key,
            data: null,
            error:
              error instanceof ApiClientError
                ? error.message
                : 'Projects could not be loaded. Please try again.',
          });
      });
    return () => controller.abort();
  }, [state, actual, canonical, key, setParams]);
  useEffect(() => {
    if (!pendingInput) return;
    const timer = window.setTimeout(
      () =>
        setParams(
          writeTeamUpDiscovery({ ...state, keyword: keyword.trim(), skill: skill.trim(), page: 1 }),
        ),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [pendingInput, keyword, skill, state, setParams]);
  useEffect(() => {
    let active = true;
    void studentsApi
      .recommendedProjects()
      .then((items) => {
        if (active) {
          setRecommendations(items);
          setRecommendationError(false);
        }
      })
      .catch(() => {
        if (active) setRecommendationError(true);
      });
    return () => {
      active = false;
    };
  }, [recommendationAttempt]);
  useEffect(() => {
    if (!filtersOpen) return;
    const media = window.matchMedia('(min-width: 1100px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setFiltersOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [filtersOpen]);
  const update = (patch: Partial<Filters>) =>
    setParams(
      writeTeamUpDiscovery({
        ...state,
        keyword: keyword.trim(),
        skill: skill.trim(),
        ...patch,
        page: patch.page ?? 1,
      }),
    );
  const reset = () => {
    setDraft({ key: '', keyword: '', skill: '' });
    setParams(writeTeamUpDiscovery(defaultTeamUpDiscovery));
  };
  const setText = (field: 'keyword' | 'skill', value: string) =>
    setDraft({ key: canonical, keyword, skill, [field]: value });
  const current = record?.key === key && !pendingInput ? record : null;
  const loading = current === null;
  const data = current?.data;
  const error = current?.error;
  const chips = [
    ...(state.keyword ? [{ key: 'keyword' as const, label: `Search: ${state.keyword}` }] : []),
    ...(state.skill ? [{ key: 'skill' as const, label: `Skill: ${state.skill}` }] : []),
    ...(state.status !== 'OPEN'
      ? [
          {
            key: 'status' as const,
            label: state.status ? teamUpLabel(state.status) : 'All statuses',
          },
        ]
      : []),
  ];
  const filters = (
    <TeamUpFilters
      skill={skill}
      status={state.status}
      onSkill={(value) => setText('skill', value)}
      onStatus={(status) => update({ status })}
      onClear={reset}
    />
  );
  const discoveryControls = (
    <>
      <div className="cc-tu-toolbar">
        <form
          className="cc-tu-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update({});
          }}
        >
          <Icon name="search" />
          <label className="sr-only" htmlFor="tu-keyword">
            Search projects
          </label>
          <input
            id="tu-keyword"
            type="search"
            maxLength={100}
            placeholder="Find a project, idea, or skill"
            value={keyword}
            onChange={(event) => setText('keyword', event.target.value)}
          />
          <button type="submit" aria-label="Search projects">
            <Icon name="arrow" />
          </button>
        </form>
        <div className="cc-tu-toolbar-controls">
          <Button
            className="cc-tu-filter-trigger"
            variant="secondary"
            icon="filter"
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            Filters
            {chips.length ? <span className="cc-tu-filter-count">{chips.length}</span> : null}
          </Button>
          <label className="cc-tu-sort">
            <span className="sr-only">Sort projects</span>
            <select
              className="cc-field"
              value={state.sort}
              onChange={(event) => update({ sort: event.target.value as Filters['sort'] })}
            >
              <option value="newest">Newest projects</option>
              <option value="oldest">Oldest projects</option>
              <option value="deadline">Deadline first</option>
            </select>
          </label>
        </div>
      </div>
      {chips.length ? (
        <div className="cc-tu-active-filters" aria-label="Active project filters">
          {chips.map((chip) => (
            <button
              className="cc-filter-chip"
              key={chip.key}
              aria-label={`Remove ${chip.label} filter`}
              onClick={() => {
                setDraft({
                  key: canonical,
                  keyword: chip.key === 'keyword' ? '' : keyword,
                  skill: chip.key === 'skill' ? '' : skill,
                });
                update({ [chip.key]: chip.key === 'status' ? 'OPEN' : '' });
              }}
            >
              <span>{chip.label}</span>
              <Icon name="close" />
            </button>
          ))}
          <Button variant="ghost" onClick={reset}>
            Clear all
          </Button>
        </div>
      ) : null}
    </>
  );
  return (
    <div className="cc-page cc-tu-browse">
      <header className="cc-tu-header">
        <div>
          <h1>TeamUp</h1>
          <p>Find your people. Build something that matters.</p>
        </div>
        <div className="cc-tu-header-actions">
          <Link className="cc-button cc-button--secondary" to="/teamup/my-projects">
            <Icon name="team" />
            My Projects
          </Link>
          <Link className="cc-button cc-button--primary" to="/teamup/new">
            <Icon name="plus" />
            Create Project
          </Link>
        </div>
      </header>
      {mobileLayout ? discoveryControls : null}
      <TeamUpHero />
      <TeamUpRecommendations
        items={recommendations}
        error={recommendationError}
        onRetry={() => {
          setRecommendations(null);
          setRecommendationError(false);
          setRecommendationAttempt((value) => value + 1);
        }}
      />
      <div className="cc-tu-workspace">
        <aside className="cc-tu-filter-rail" aria-label="Project filters">
          {filters}
        </aside>
        <div className="cc-tu-results-workspace">
          {!mobileLayout ? discoveryControls : null}
          <section className="cc-tu-results" aria-labelledby="tu-results-title" aria-busy={loading}>
            <header>
              <div>
                <h2 id="tu-results-title">
                  {state.status ? `${teamUpLabel(state.status)} projects` : 'All projects'}
                </h2>
                <p role="status">
                  {loading
                    ? record
                      ? 'Updating projects…'
                      : 'Finding projects…'
                    : error
                      ? 'Projects unavailable'
                      : `${data?.pagination.total ?? 0} ${hasTeamUpCriteria(state) ? 'matching ' : ''}project${data?.pagination.total === 1 ? '' : 's'}`}
                </p>
              </div>
              <span className="cc-tu-results-note">Discover. Connect. Build.</span>
            </header>
            {loading ? (
              <div className="cc-tu-project-grid" aria-label="Loading projects">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="cc-tu-card-skeleton" key={index} aria-hidden="true">
                    <Skeleton className="cc-tu-skeleton-icon" />
                    <Skeleton className="cc-tu-skeleton-title" />
                    <Skeleton className="cc-tu-skeleton-text" />
                    <Skeleton className="cc-tu-skeleton-text" />
                    <Skeleton className="cc-tu-skeleton-footer" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="cc-tu-feedback" role="alert">
                <Icon name="warning" />
                <h3>We couldn’t load projects</h3>
                <p>{error}</p>
                <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                  Retry projects
                </Button>
              </div>
            ) : data?.projects.length ? (
              <>
                <div className="cc-tu-project-grid">
                  {data.projects.map((project) => (
                    <TeamUpProjectCard key={project.id} project={project} />
                  ))}
                </div>
                <nav className="cc-tu-pagination" aria-label="Project pagination">
                  <Button
                    variant="secondary"
                    disabled={state.page <= 1}
                    onClick={() => update({ page: state.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {state.page} of {Math.max(1, data.pagination.totalPages)}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={state.page >= data.pagination.totalPages}
                    onClick={() => update({ page: state.page + 1 })}
                  >
                    Next
                  </Button>
                </nav>
              </>
            ) : (
              <div className="cc-tu-feedback">
                <Icon name="team" />
                <h3>
                  {hasTeamUpCriteria(state)
                    ? 'No projects match these filters'
                    : 'No open projects yet'}
                </h3>
                <p>
                  {hasTeamUpCriteria(state)
                    ? 'Try another skill or broaden your search.'
                    : 'Check back for new projects, or bring your own idea to campus.'}
                </p>
                {hasTeamUpCriteria(state) ? (
                  <Button variant="secondary" onClick={reset}>
                    Reset filters
                  </Button>
                ) : (
                  <Link className="cc-button cc-button--primary" to="/teamup/new">
                    Create a project
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      <Modal
        open={filtersOpen}
        onClose={closeFilters}
        title="Project filters"
        description="Filters apply as you choose them. Search uses the same discovery state."
      >
        <div className="cc-tu-mobile-filters">
          {filters}
          <Button onClick={closeFilters}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
