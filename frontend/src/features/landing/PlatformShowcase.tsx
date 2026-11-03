import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { ContentVisual } from './ContentVisual';
import { HighlightCard } from './HighlightCard';
import { platformModules, type PlatformModule } from './landing-content';
import { highlightsOfKind, type LandingHighlight } from './landing-highlights';

interface SceneProps {
  readonly highlights: readonly LandingHighlight[];
  readonly loading: boolean;
}

function MarketplaceScene({ highlights, loading }: SceneProps) {
  const items = highlightsOfKind(highlights, 'MARKETPLACE').slice(0, 2);
  if (loading) return <SceneLoading />;
  if (items.length > 0)
    return (
      <div className="cc-scene cc-scene-market cc-live-scene">
        <div className="cc-scene-toolbar">
          <span>
            <Icon name="search" /> Owner-featured Marketplace posts
          </span>
        </div>
        <div className="cc-live-card-grid">
          {items.map((item) => (
            <HighlightCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="cc-scene cc-scene-market">
      <span className="cc-illustrative-label">Illustrative product preview</span>
      <div className="cc-scene-toolbar">
        <span>
          <Icon name="search" /> Search listings
        </span>
        <b>Category</b>
        <b>Condition</b>
      </div>
      <div className="cc-market-grid">
        <article className="featured">
          <ContentVisual kind="calculator" />
          <small>CALCULATORS · GOOD</small>
          <strong>Scientific calculator</strong>
          <p>Reliable study essential in good condition.</p>
          <footer>
            <b>₹700</b>
            <span>
              <Icon name="bookmark" /> Save
            </span>
          </footer>
        </article>
        <article>
          <ContentVisual kind="book" />
          <small>BOOKS &amp; STUDY</small>
          <strong>Data Structures textbook</strong>
          <b>₹450</b>
        </article>
        <article className="contact">
          <Icon name="message" />
          <strong>Interested?</strong>
          <span className="cc-preview-action">Message seller</span>
        </article>
      </div>
    </div>
  );
}
function LostScene({ highlights, loading }: SceneProps) {
  const items = highlightsOfKind(highlights, 'LOST_FOUND').slice(0, 2);
  if (loading) return <SceneLoading />;
  if (items.length > 0)
    return (
      <div className="cc-scene cc-scene-lost cc-live-scene">
        <p className="cc-live-disclaimer">
          Owner-featured open reports · Shown independently, not as verified matches
        </p>
        <div className="cc-live-card-grid">
          {items.map((item) => (
            <HighlightCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="cc-scene cc-scene-lost">
      <span className="cc-illustrative-label">Illustrative matching example</span>
      <article>
        <span className="lost">LOST</span>
        <ContentVisual kind="bag" />
        <strong>Grey college backpack</strong>
        <small>Library · Recently reported</small>
      </article>
      <div className="cc-match-link">
        <Icon name="sparkles" />
        <b>Possible match</b>
        <span>Similar description</span>
        <span>Nearby location</span>
      </div>
      <article>
        <span className="found">FOUND</span>
        <ContentVisual kind="bag" />
        <strong>Dark grey laptop bag</strong>
        <small>Review details before claiming</small>
        <span className="cc-preview-action">View report</span>
      </article>
    </div>
  );
}
function TeamScene({ highlights, loading }: SceneProps) {
  const items = highlightsOfKind(highlights, 'TEAMUP').slice(0, 2);
  if (loading) return <SceneLoading />;
  if (items.length > 0)
    return (
      <div className="cc-scene cc-scene-team cc-live-scene">
        <div className="cc-live-card-grid">
          {items.map((item) => (
            <HighlightCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="cc-scene cc-scene-team">
      <span className="cc-illustrative-label">Illustrative project preview</span>
      <div className="cc-project-brief">
        <ContentVisual kind="project" compact />
        <small>OPEN TEAMUP PROJECT</small>
        <h4>Campus navigation tool</h4>
        <p>Design a clearer way for students to find useful places and services around campus.</p>
        <div>
          <span>React</span>
          <span>Research</span>
          <span>PostgreSQL</span>
        </div>
        <span className="cc-preview-action">
          View project <Icon name="arrow" />
        </span>
      </div>
      <aside>
        <Icon name="sparkles" />
        <small>SKILL ALIGNMENT</small>
        <strong>Relevant skills found</strong>
        <p>Project requirements are compared with public profile skills.</p>
      </aside>
    </div>
  );
}
function ServicesScene({ highlights, loading }: SceneProps) {
  const items = highlightsOfKind(highlights, 'SERVICE').slice(0, 2);
  if (loading) return <SceneLoading />;
  if (items.length > 0)
    return (
      <div className="cc-scene cc-scene-services cc-live-scene">
        <div className="cc-live-card-grid">
          {items.map((item) => (
            <HighlightCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="cc-scene cc-scene-services">
      <span className="cc-illustrative-label">Illustrative service preview</span>
      <nav>
        <strong>Categories</strong>
        <span className="active">Design &amp; creative</span>
        <span>Academic support</span>
        <span>Technology</span>
      </nav>
      <article>
        <ContentVisual kind="design" compact />
        <small>DESIGN &amp; CREATIVE</small>
        <h4>Presentation design support</h4>
        <p>Get help organizing a clear, polished academic presentation.</p>
        <dl>
          <div>
            <dt>Pricing</dt>
            <dd>Fixed price</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>Student service</dd>
          </div>
        </dl>
        <span className="cc-preview-action">Request service</span>
      </article>
      <aside>
        <Icon name="check" />
        <strong>Request sent</strong>
        <p>Track the request through the existing service workflow.</p>
      </aside>
    </div>
  );
}
function AssistantScene() {
  return (
    <div className="cc-scene cc-scene-assistant">
      <span className="cc-illustrative-label">Illustrative assistant preview</span>
      <div className="cc-question">Is there a scientific calculator available?</div>
      <div className="cc-answer">
        <span>
          <Icon name="ai" />
        </span>
        <div>
          <small>CAMPUS ASSISTANT</small>
          <p>I found a scientific calculator listed in Marketplace for ₹700.</p>
          <span className="cc-preview-action">
            <Icon name="bookmark" /> Marketplace source
          </span>
          <em>
            <Icon name="check" /> Source included
          </em>
        </div>
      </div>
      <div className="cc-unavailable">
        <Icon name="warning" />
        <span>
          <strong>Not enough information?</strong>
          <small>The assistant clearly says when evidence is unavailable.</small>
        </span>
      </div>
    </div>
  );
}
function SceneLoading() {
  return (
    <div className="cc-scene cc-live-scene" aria-label="Loading featured campus posts">
      <span className="cc-live-skeleton" />
      <span className="cc-live-skeleton" />
    </div>
  );
}

const scenes: Record<PlatformModule['id'], (props: SceneProps) => React.JSX.Element> = {
  marketplace: MarketplaceScene,
  'lost-found': LostScene,
  teamup: TeamScene,
  services: ServicesScene,
  assistant: AssistantScene,
};

export function LandingModuleScene({
  moduleId,
  ...props
}: SceneProps & { readonly moduleId: PlatformModule['id'] }) {
  const Scene = scenes[moduleId];
  return <Scene {...props} />;
}

export function PlatformShowcase({
  highlights,
  loading,
}: {
  readonly highlights: readonly LandingHighlight[];
  readonly loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<PlatformModule['id']>('marketplace');
  const selected = platformModules.find(({ id }) => id === selectedId) ?? platformModules[0];
  return (
    <section className="cc-chapter cc-platform-showcase" data-landing-reveal id="product">
      <header className="cc-chapter-heading">
        <p className="cc-landing-eyebrow">ONE STUDENT ECOSYSTEM</p>
        <h2>Five focused tools. One connected experience.</h2>
        <p>Move from discovering what you need to taking action without losing context.</p>
      </header>
      <div className="cc-showcase-layout">
        <div
          className="cc-showcase-selector"
          role="group"
          aria-label="Explore CampusConnect modules"
        >
          {platformModules.map((module) => (
            <button
              type="button"
              aria-pressed={selected.id === module.id}
              className="cc-showcase-option"
              key={module.id}
              onClick={() => setSelectedId(module.id)}
              aria-controls="landing-module-scene"
            >
              <span>
                <Icon name={module.icon} />
              </span>
              <span>
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
              <Icon className="cc-showcase-arrow" name="arrow" />
            </button>
          ))}
        </div>
        <div
          className="cc-showcase-stage"
          id="landing-module-scene"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className={`cc-module-frame cc-module-frame--${selected.accent}`} key={selected.id}>
            <header>
              <span>
                <Icon name={selected.icon} /> CampusConnect {selected.title}
              </span>
              <i />
              <i />
              <i />
            </header>
            <LandingModuleScene moduleId={selected.id} highlights={highlights} loading={loading} />
          </div>
        </div>
      </div>
    </section>
  );
}
