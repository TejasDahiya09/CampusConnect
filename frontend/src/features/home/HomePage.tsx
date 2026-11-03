import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { Card, EmptyState, Skeleton } from '../../components/ui';
import {
  firstName,
  greetingForHour,
  homeApi,
  homeLayoutState,
  homeQuickActions,
  shouldPromptForProfile,
  type HomeData,
  type HomeItem,
  type HomeItemKind,
} from './home-service';
import './home.css';

const icons: Readonly<Record<HomeItemKind, IconName>> = {
  LOST_FOUND: 'search',
  MARKETPLACE: 'store',
  MESSAGING: 'message',
  SERVICE: 'briefcase',
  TEAMUP: 'team',
};
const kindClass = (kind: HomeItemKind) => `cc-home-kind--${kind.toLocaleLowerCase()}`;

function SectionHeading({
  action,
  description,
  eyebrow,
  id,
  title,
}: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly eyebrow?: string;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <header className="cc-home-section-heading">
      <div>
        {eyebrow ? <p className="cc-home-section-eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your Home" className="cc-page cc-home-page">
      <Skeleton className="cc-home-skeleton-welcome" />
      <div className="cc-home-skeleton-primary">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="cc-home-skeleton-actions">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton className="h-24" key={item} />
        ))}
      </div>
    </div>
  );
}

function Welcome({ displayName }: { readonly displayName: string }) {
  return (
    <header className="cc-home-welcome">
      <div className="cc-home-welcome-copy">
        <p className="cc-home-kicker">
          <span aria-hidden="true" /> Your campus workspace
        </p>
        <h1>
          {greetingForHour(new Date().getHours())}, <span>{firstName(displayName)}</span>
        </h1>
        <p>Review what needs you, continue active work, or start something useful on campus.</p>
      </div>
      <Link className="cc-home-profile-link" to="/profile">
        <Icon className="size-4" name="profile" />
        <span>View profile</span>
        <Icon className="size-4" name="arrow" />
      </Link>
    </header>
  );
}

function Attention({ items }: { readonly items: readonly HomeItem[] }) {
  return (
    <section aria-labelledby="home-attention-title" className="cc-home-attention">
      <SectionHeading
        description="Updates and actions connected to your activity."
        eyebrow="Needs attention"
        id="home-attention-title"
        title="For you"
      />
      <div className="cc-home-attention-list">
        {items.slice(0, 4).map((item, index) => (
          <Link
            className={`cc-home-attention-item ${kindClass(item.kind)}${index === 0 ? ' is-featured' : ''}`}
            key={item.id}
            to={item.path}
          >
            <span className="cc-home-item-icon">
              <Icon className="size-5" name={icons[item.kind]} />
            </span>
            <span className="cc-home-item-copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <span className="cc-home-item-action">
              {item.actionLabel}
              <Icon className="size-4" name="arrow" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Continue({
  items,
  primary = false,
}: {
  readonly items: readonly HomeItem[];
  readonly primary?: boolean;
}) {
  return (
    <section
      aria-labelledby="home-continue-title"
      className={`cc-home-continue${primary ? ' is-primary' : ''}`}
    >
      <SectionHeading
        description="Return to the active records you own and manage."
        eyebrow={primary ? 'Your workspace' : undefined}
        id="home-continue-title"
        title="Your active work"
      />
      <div className="cc-home-continue-list">
        {items.slice(0, 3).map((item) => (
          <Link
            className={`cc-home-continue-item ${kindClass(item.kind)}`}
            key={item.id}
            to={item.path}
          >
            <span className="cc-home-item-icon">
              <Icon className="size-5" name={icons[item.kind]} />
            </span>
            <span className="cc-home-item-copy">
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
            </span>
            <span className="cc-home-open-label">Open</span>
            <Icon className="cc-home-row-arrow size-4" name="arrow" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  return (
    <section aria-labelledby="home-actions-title" className="cc-home-actions">
      <SectionHeading
        description="Create, report, collaborate, or share a skill."
        id="home-actions-title"
        title="Start something"
      />
      <div className="cc-home-action-grid">
        {homeQuickActions.map((item) => (
          <Link
            className={`cc-home-action-tile ${kindClass(item.kind)}`}
            key={item.path}
            to={item.path}
          >
            <span className="cc-home-action-icon">
              <Icon className="size-5" name={item.icon} />
            </span>
            <span className="cc-home-action-copy">
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <Icon className="cc-home-action-arrow size-4" name="arrow" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function MobileAssistantLink() {
  return (
    <Link className="cc-home-mobile-assistant" to="/assistant">
      <span className="cc-home-mobile-assistant-icon">
        <Icon className="size-5" name="ai" />
      </span>
      <span>
        <strong>Campus Assistant</strong>
        <small>Ask a question using available CampusConnect sources.</small>
      </span>
      <span className="cc-home-mobile-assistant-action">
        Ask <Icon className="size-4" name="arrow" />
      </span>
    </Link>
  );
}

function ActionArea() {
  return (
    <div className="cc-home-action-area">
      <QuickActions />
      <MobileAssistantLink />
    </div>
  );
}

function Discover({ items }: { readonly items: readonly HomeItem[] }) {
  return (
    <section aria-labelledby="home-discover-title" className="cc-home-discover">
      <SectionHeading
        action={
          <Link className="cc-home-section-link" to="/search">
            Search all <Icon className="size-4" name="arrow" />
          </Link>
        }
        description="Recent eligible listings, reports, projects, and services from other students."
        eyebrow="Recent on CampusConnect"
        id="home-discover-title"
        title="Discover across campus"
      />
      {items.length ? (
        <div className="cc-home-discover-grid">
          {items.slice(0, 4).map((item) => (
            <Link
              className={`cc-home-discover-card ${kindClass(item.kind)}`}
              key={item.id}
              to={item.path}
            >
              <span className="cc-home-discover-topline">
                <span className="cc-home-item-icon">
                  <Icon className="size-[1.125rem]" name={icons[item.kind]} />
                </span>
                <span>{item.meta}</span>
              </span>
              <strong>{item.title}</strong>
              <span className="cc-home-discover-action">
                View details <Icon className="size-4" name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="cc-home-inline-empty" role="status">
          <Icon className="size-5" name="sparkles" />
          <span>
            <strong>No recent records to show.</strong>
            <small>Eligible campus activity will appear here when available.</small>
          </span>
        </div>
      )}
    </section>
  );
}

function ProfilePrompt({ completion }: { readonly completion: number }) {
  const value = Math.min(100, Math.max(0, completion));
  return (
    <aside aria-labelledby="home-profile-title" className="cc-home-profile-prompt">
      <div
        aria-label={`Profile ${value}% complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={value}
        className="cc-home-profile-progress"
        role="progressbar"
        style={{ '--cc-profile-progress': `${value}%` } as CSSProperties}
      >
        <span>{value}%</span>
      </div>
      <div className="cc-home-profile-copy">
        <p className="cc-home-section-eyebrow">Profile strength</p>
        <h2 id="home-profile-title">Build a clearer campus presence</h2>
        <p>Add more detail so other students can understand what you do.</p>
      </div>
      <Link className="cc-home-section-link" to="/profile">
        Complete profile <Icon className="size-4" name="arrow" />
      </Link>
    </aside>
  );
}

function AllCaughtUp() {
  return (
    <div className="cc-home-caught-up" role="status">
      <span>
        <Icon className="size-4" name="check" />
      </span>
      <p>
        <strong>You’re all caught up.</strong> Nothing in your current Home feed needs attention.
      </p>
    </div>
  );
}
export function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await homeApi.get());
    } catch {
      setError('Your Home could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void homeApi
      .get()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError('Your Home could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading) return <Loading />;
  if (error || !data)
    return (
      <div className="cc-page cc-home-page">
        <Card className="mx-auto max-w-xl">
          <EmptyState
            action={
              <button
                className="cc-button cc-button--primary"
                onClick={() => void load()}
                type="button"
              >
                Try again
              </button>
            }
            description={error ?? 'Home is temporarily unavailable.'}
            icon="warning"
            title="We couldn’t load Home"
          />
        </Card>
      </div>
    );

  const layout = homeLayoutState(data);
  return (
    <div className={`cc-page cc-home-page cc-home-page--${layout.toLocaleLowerCase()}`}>
      <Welcome displayName={data.greetingIdentity.displayName} />
      {layout === 'ATTENTION' ? (
        <>
          <div className="cc-home-primary-grid">
            <Attention items={data.attentionItems} />
            {data.continueItems.length ? <Continue items={data.continueItems} /> : <ActionArea />}
          </div>
          <div className="cc-home-secondary-grid">
            {data.continueItems.length ? <ActionArea /> : null}
            <Discover items={data.discoverItems} />
          </div>
        </>
      ) : layout === 'CONTINUE' ? (
        <>
          <div className="cc-home-primary-grid cc-home-primary-grid--continue">
            <Continue items={data.continueItems} primary />
            <div className="cc-home-companion-stack">
              <AllCaughtUp />
              <ActionArea />
            </div>
          </div>
          <Discover items={data.discoverItems} />
        </>
      ) : (
        <>
          <ActionArea />
          <Discover items={data.discoverItems} />
        </>
      )}
      {shouldPromptForProfile(data.profileCompletion) ? (
        <ProfilePrompt completion={data.profileCompletion} />
      ) : null}
    </div>
  );
}
