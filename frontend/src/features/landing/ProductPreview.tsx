import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ContentVisual } from './ContentVisual';
import { HighlightCard } from './HighlightCard';
import { highlightsOfKind, type LandingHighlight } from './landing-highlights';
import { highlightPresentation, spotlightSelection } from './landing-presentation';
import { createSpotlightController } from './landing-spotlight';

export function ProductPreview({
  highlights,
  loading,
}: {
  readonly highlights: readonly LandingHighlight[];
  readonly loading: boolean;
}) {
  const spotlightItems = useMemo(() => spotlightSelection(highlights), [highlights]);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const controller = useRef<ReturnType<typeof createSpotlightController> | null>(null);
  const pauses = useRef(new Set<'hover' | 'focus' | 'manual'>());
  const primary = spotlightItems[spotlightIndex % Math.max(spotlightItems.length, 1)];
  const display = primary ? highlightPresentation(primary) : null;
  const project = highlightsOfKind(highlights, 'TEAMUP')[0];
  const report = highlightsOfKind(highlights, 'LOST_FOUND')[0];

  useEffect(() => {
    const clock = createSpotlightController(
      spotlightItems.length,
      () => setSpotlightIndex((index) => index + 1),
      {
        schedule: (callback, delay) => {
          const timer = window.setTimeout(callback, delay);
          return () => window.clearTimeout(timer);
        },
        visibility: document,
        motion: window.matchMedia('(prefers-reduced-motion: reduce)'),
      },
    );
    controller.current = clock;
    pauses.current.forEach((reason) => clock.pause(reason, true));
    return () => {
      clock.dispose();
      controller.current = null;
    };
  }, [spotlightItems.length]);

  const pause = (reason: 'hover' | 'focus' | 'manual', paused: boolean) => {
    if (paused) pauses.current.add(reason);
    else pauses.current.delete(reason);
    controller.current?.pause(reason, paused);
  };

  return (
    <div
      className="cc-product-canvas"
      aria-label="CampusConnect product workspace preview"
      role="region"
      onMouseEnter={() => pause('hover', true)}
      onMouseLeave={() => pause('hover', false)}
      onFocusCapture={() => pause('focus', true)}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          pause('focus', false);
      }}
    >
      <header className="cc-canvas-chrome">
        <span className="cc-canvas-logo">C</span>
        <span className="cc-canvas-workspace">Your campus workspace</span>
        <span className="cc-canvas-search">
          <Icon name="search" /> Search campus
        </span>
      </header>
      <div className="cc-canvas-body">
        <div className="cc-canvas-intro">
          <div>
            <small className="cc-record-label">CONNECTED CAMPUS</small>
            <h3>Find what matters today.</h3>
          </div>
          <Icon name="dashboard" />
        </div>
        <article className="cc-canvas-feature">
          <ContentVisual kind={display?.visual ?? 'calculator'} />
          <div className="cc-feature-copy">
            {loading ? (
              <span
                className="cc-live-skeleton"
                role="status"
                aria-label="Loading featured campus post"
              />
            ) : primary && display ? (
              <>
                <small className="cc-record-label">FEATURED BY ITS OWNER · {display.label}</small>
                <h4 title={primary.title}>{primary.title}</h4>
                <p>{primary.summary}</p>
                <div className="cc-record-tags">
                  {display.tags.slice(0, 2).map((tag, index) => (
                    <span key={`${tag}:${index}`}>{tag}</span>
                  ))}
                </div>
                <strong>
                  {display.price ?? (primary.kind === 'TEAMUP' ? 'Open project' : 'Open report')}
                </strong>
                <Link to={primary.route}>
                  View featured post <Icon name="arrow" />
                </Link>
              </>
            ) : (
              <>
                <small className="cc-record-label">ILLUSTRATIVE PREVIEW · MARKETPLACE</small>
                <h4>Scientific calculator</h4>
                <p>A study essential, ready for its next semester.</p>
                <div className="cc-record-tags">
                  <span>Calculators</span>
                  <span>Good condition</span>
                </div>
                <strong>₹700</strong>
                <span className="cc-preview-action">
                  Explore Marketplace <Icon name="arrow" />
                </span>
              </>
            )}
          </div>
        </article>
        {spotlightItems.length > 1 ? (
          <div className="cc-spotlight-controls">
            <span>
              Owner-featured spotlight · {(spotlightIndex % spotlightItems.length) + 1} /{' '}
              {spotlightItems.length}
            </span>
            <button
              type="button"
              aria-pressed={manuallyPaused}
              onClick={() => {
                pause('manual', !manuallyPaused);
                setManuallyPaused(!manuallyPaused);
              }}
            >
              {manuallyPaused ? 'Resume spotlight' : 'Pause spotlight'}
            </button>
          </div>
        ) : null}
        <div className="cc-canvas-side">
          {report ? (
            <HighlightCard item={report} compact />
          ) : (
            <article className="cc-canvas-match">
              <ContentVisual kind="bag" compact />
              <div>
                <small className="cc-record-label">ILLUSTRATIVE · LOST &amp; FOUND</small>
                <strong>Grey college backpack</strong>
                <p>Review possible matches with context.</p>
              </div>
              <Icon name="search" />
            </article>
          )}
          {project ? (
            <HighlightCard item={project} compact />
          ) : (
            <article className="cc-canvas-team">
              <ContentVisual kind="project" compact />
              <div>
                <small className="cc-record-label">ILLUSTRATIVE · TEAMUP</small>
                <strong>Campus navigation tool</strong>
                <p>React · Research · PostgreSQL</p>
              </div>
              <Icon name="team" />
            </article>
          )}
        </div>
      </div>
      <footer className="cc-canvas-footer">
        <span>
          <Icon name="shield" /> Public highlights are owner-consented
        </span>
        <span>Illustrative workspace</span>
      </footer>
    </div>
  );
}
