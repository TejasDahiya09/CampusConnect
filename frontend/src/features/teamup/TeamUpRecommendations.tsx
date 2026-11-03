import { Link } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { ProjectRecommendation } from '../students/students.types';

export function TeamUpRecommendations({
  items,
  error,
  onRetry,
}: {
  readonly items: readonly ProjectRecommendation[] | null;
  readonly error: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <section className="cc-tu-recommendations" aria-labelledby="tu-recommendations-title">
      <header>
        <div>
          <h2 id="tu-recommendations-title">Recommended for you</h2>
          <p>Based on your approved profile skills and public interests.</p>
        </div>
        {!error && items?.length ? (
          <span className="cc-tu-rec-count">{items.length} suggested projects</span>
        ) : null}
      </header>
      {error ? (
        <div className="cc-tu-inline-feedback" role="alert">
          <p>Recommendations could not be loaded. You can still browse every eligible project.</p>
          <Button variant="secondary" onClick={onRetry}>
            Retry recommendations
          </Button>
        </div>
      ) : items === null ? (
        <div className="cc-tu-rec-loading" role="status">
          <span>Finding relevant projects…</span>
          <Skeleton className="cc-tu-rec-skeleton" />
        </div>
      ) : !items.length ? (
        <p className="cc-tu-rec-empty">
          No evidence-based recommendations yet. <Link to="/profile">Add your profile skills</Link>{' '}
          or explore the projects below.
        </p>
      ) : (
        <>
          <p className="sr-only" id="tu-recommendation-help">
            Scroll to explore recommendations. When this rail is focused, use Left and Right arrow
            keys, Home or End. Use Tab to reach each project link.
          </p>
          <div
            className="cc-tu-rec-grid"
            id="tu-recommendation-list"
            role="region"
            aria-label="Recommended projects"
            aria-describedby="tu-recommendation-help"
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const rail = event.currentTarget;
              const distance =
                (rail.firstElementChild?.getBoundingClientRect().width ?? rail.clientWidth) + 12;
              const left =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? rail.scrollWidth
                    : rail.scrollLeft + (event.key === 'ArrowLeft' ? -distance : distance);
              rail.scrollTo({
                left,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            {items.map(({ project, match }) => (
              <Link className="cc-tu-rec-card" key={project.id} to={`/teamup/${project.id}`}>
                <span className="cc-tu-match-label">{match.label}</span>
                <h3 title={project.title}>{project.title}</h3>
                {match.reasons[0] ? <p title={match.reasons[0]}>{match.reasons[0]}</p> : null}
                {match.missingSkills.length ? (
                  <p className="cc-tu-rec-missing" title={match.missingSkills.join(', ')}>
                    Other requested skills: {match.missingSkills.join(', ')}
                  </p>
                ) : null}
                {project.viewerApplicationStatus ? (
                  <span className="cc-tu-rec-application">
                    Application: {project.viewerApplicationStatus.toLowerCase()}
                  </span>
                ) : null}
                <span className="cc-tu-rec-open">
                  View project <Icon name="arrow" />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
