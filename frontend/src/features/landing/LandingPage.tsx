import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ContentVisual } from './ContentVisual';
import { HighlightCard } from './HighlightCard';
import { PublicFooter, PublicHeader } from '../../components/PublicChrome';
import { LandingHero } from './LandingHero';
import { PlatformShowcase } from './PlatformShowcase';
import { journeySteps, trustItems } from './landing-content';
import './landing-refinement.css';
import {
  fetchLandingHighlights,
  highlightsOfKind,
  type LandingHighlight,
} from './landing-highlights';

function StudentJourney() {
  return (
    <section className="cc-chapter cc-student-journey" data-landing-reveal id="how-it-works">
      <header className="cc-landing-section-heading cc-landing-section-heading--center">
        <p className="cc-landing-eyebrow">A clearer path</p>
        <h2>One account. A clearer way through campus life.</h2>
      </header>
      <ol className="cc-journey-steps">
        {journeySteps.map((step) => (
          <li key={step.number}>
            <div className="cc-journey-marker">
              <span>{step.number}</span>
              <Icon name={step.icon} />
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <div
              aria-hidden="true"
              className={`cc-journey-fragment cc-journey-fragment--${step.number}`}
            >
              <Icon name={step.icon} />
              <span>
                {step.number === '01'
                  ? 'Profile ready'
                  : step.number === '02'
                    ? 'Search campus'
                    : 'Next action'}
              </span>
              <Icon name={step.number === '03' ? 'check' : 'arrow'} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProductHighlights({
  highlights,
  loading,
}: {
  readonly highlights: readonly LandingHighlight[];
  readonly loading: boolean;
}) {
  const discovery = highlights.slice(0, 2);
  const contextual =
    highlightsOfKind(highlights, 'TEAMUP')[0] ?? highlightsOfKind(highlights, 'SERVICE')[0];
  return (
    <section className="cc-chapter cc-experience-section">
      <header className="cc-landing-section-heading" data-landing-reveal>
        <p className="cc-landing-eyebrow">Purposeful by default</p>
        <h2>Designed around actions, not endless feeds.</h2>
        <p>
          CampusConnect keeps each task focused—whether you are comparing a listing, reviewing a
          possible match, joining a project, or asking a campus question.
        </p>
      </header>
      <div className="cc-experience-list">
        <article className="cc-experience-row" data-landing-reveal>
          <div className="cc-experience-copy">
            <span>01 / Discover</span>
            <h3>Find the useful signal quickly.</h3>
            <p>
              Focused search, filters, saved records, and clear status details help you move from
              browsing to a confident next step.
            </p>
          </div>
          <div className="cc-experience-ui cc-experience-ui--discover">
            <div className="cc-experience-search" aria-hidden="true">
              <Icon name="search" />
              <span>Explore your campus</span>
              <b>Discover</b>
            </div>
            {loading ? (
              <span
                className="cc-live-skeleton"
                role="status"
                aria-label="Loading featured discovery posts"
              />
            ) : discovery.length ? (
              <div className="cc-editorial-records">
                {discovery.map((item) => (
                  <HighlightCard item={item} key={item.id} compact />
                ))}
              </div>
            ) : (
              <div className="cc-editorial-records">
                <small className="cc-record-label">Illustrative discovery preview</small>
                <div className="cc-experience-result">
                  <ContentVisual kind="calculator" compact />
                  <span>
                    <small>Marketplace</small>
                    <strong>Scientific calculator</strong>
                  </span>
                  <b>₹700</b>
                </div>
                <div className="cc-experience-result">
                  <ContentVisual kind="bag" compact />
                  <span>
                    <small>Lost &amp; Found</small>
                    <strong>Grey college backpack</strong>
                  </span>
                  <em>Open report</em>
                </div>
              </div>
            )}
          </div>
        </article>
        <article className="cc-experience-row cc-experience-row--reverse" data-landing-reveal>
          <div className="cc-experience-copy">
            <span>02 / Connect</span>
            <h3>Reach the right student with context.</h3>
            <p>
              Project applications, service requests, and contextual conversations keep
              collaboration tied to the task that started it.
            </p>
          </div>
          <div className="cc-experience-ui cc-experience-ui--connect">
            {contextual ? (
              <HighlightCard item={contextual} compact />
            ) : (
              <>
                <small className="cc-record-label">Illustrative collaboration preview</small>
                <div className="cc-connect-project">
                  <ContentVisual kind="project" compact />
                  <div>
                    <small>TeamUp</small>
                    <strong>Build a campus project</strong>
                    <div className="cc-record-tags">
                      <span>React</span>
                      <span>Research</span>
                      <span>PostgreSQL</span>
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="cc-connect-message" aria-hidden="true">
              <Icon name="message" />
              <span>Illustrative contextual conversation</span>
              <Icon name="arrow" />
            </div>
            <p className="cc-scene-note">
              Open a post to take the next step through its authenticated workflow.
            </p>
          </div>
        </article>
        <article className="cc-experience-row" data-landing-reveal>
          <div className="cc-experience-copy">
            <span>03 / Act with context</span>
            <h3>Understand why, then decide.</h3>
            <p>
              Explanations, source citations, ownership controls, and honest unavailable states keep
              important actions understandable.
            </p>
          </div>
          <div className="cc-experience-ui cc-experience-ui--context">
            <small className="cc-record-label">Illustrative assistant preview</small>
            <div className="cc-context-prompt">
              <Icon name="ai" />
              <span>
                <small>Campus Assistant</small>
                <strong>Here is what I found in CampusConnect.</strong>
              </span>
            </div>
            <div className="cc-context-answer">
              <p>Relevant campus records are shown with their source.</p>
              <span>
                <Icon name="bookmark" /> Marketplace source
              </span>
              <span>
                <Icon name="check" /> Sources included
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="cc-chapter cc-trust-section" data-landing-reveal id="trust">
      <header className="cc-landing-section-heading">
        <p className="cc-landing-eyebrow">Trust through clarity</p>
        <h2>Built for useful, responsible campus interactions.</h2>
        <p>
          Clear workflows make it easier to understand what is public, what is private, and what
          action comes next.
        </p>
      </header>
      <div className="cc-trust-grid">
        {trustItems.map((item) => (
          <article key={item.title}>
            <span>
              <Icon name={item.icon} />
            </span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <small>
                {item.title === 'Privacy-conscious workflows'
                  ? 'Public information · Protected actions'
                  : item.title === 'Honest AI support'
                    ? 'Sources included · Unavailable states'
                    : item.title === 'Clear roles and ownership'
                      ? 'Owner controls · Role checks'
                      : 'Real student tasks · Focused workflows'}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LandingCta() {
  return (
    <section className="cc-chapter cc-landing-cta" data-landing-reveal>
      <div aria-hidden="true" className="cc-landing-cta-orbit" />
      <p className="cc-landing-eyebrow">Your campus, better connected</p>
      <h2>Make your next campus task easier.</h2>
      <p>
        Join CampusConnect to discover, share, collaborate, and stay connected through one organized
        student workspace.
      </p>
      <div className="cc-landing-cta-actions">
        <Link className="cc-landing-button cc-landing-button--primary" to="/register">
          Create your account <Icon name="arrow" />
        </Link>
        <Link className="cc-landing-signin" to="/login">
          Already have an account? <strong>Sign in</strong>
        </Link>
      </div>
      <div aria-hidden="true" className="cc-cta-sequence">
        <span>
          <Icon name="profile" /> Create your profile
        </span>
        <i />
        <span>
          <Icon name="search" /> Discover campus
        </span>
        <i />
        <span>
          <Icon name="message" /> Connect with context
        </span>
      </div>
    </section>
  );
}

export function LandingPage() {
  const page = useRef<HTMLElement>(null);
  const [highlights, setHighlights] = useState<readonly LandingHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLandingHighlights({ signal: controller.signal })
      .then(setHighlights)
      .finally(() => setHighlightsLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const root = page.current;
    if (!root || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-landing-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('cc-reveal-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <main className="cc-public-page cc-landing-page" ref={page}>
      <a className="cc-skip-link" href="#main-content">
        Skip to main content
      </a>
      <PublicHeader />
      <LandingHero highlights={highlights} loading={highlightsLoading} />
      <PlatformShowcase highlights={highlights} loading={highlightsLoading} />
      <StudentJourney />
      <ProductHighlights highlights={highlights} loading={highlightsLoading} />
      <TrustSection />
      <LandingCta />
      <PublicFooter />
    </main>
  );
}
