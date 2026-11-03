import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Skeleton } from '../../components/ui';
import {
  dashboardAttention,
  dashboardModules,
  dashboardQuickActions,
  hasDashboardActivity,
  type DashboardAnalytics,
} from './dashboard-service';

const number = new Intl.NumberFormat('en-IN');

export function DashboardContent({ data }: { readonly data: DashboardAnalytics }) {
  const attention = dashboardAttention(data);
  return (
    <>
      {!hasDashboardActivity(data) && (
        <section className="cc-db-welcome" aria-labelledby="db-start">
          <span className="cc-db-icon">
            <Icon name="analytics" />
          </span>
          <div>
            <h2 id="db-start">Your activity starts here</h2>
            <p>
              List something useful, report an item, start a project or offer your skills. Your
              activity will appear here.
            </p>
          </div>
        </section>
      )}
      <section aria-labelledby="db-overview">
        <div className="cc-db-section-heading">
          <div>
            <h2 id="db-overview">Activity overview</h2>
            <p>A snapshot of your own CampusConnect activity.</p>
          </div>
        </div>
        <div className="cc-db-metrics">
          {dashboardModules.map((module) => {
            const metric = data.metrics.find((metric) => metric.id === module.id);
            if (!metric) return null;
            const secondary =
              module.id === 'marketplace'
                ? `${number.format(data.insights.marketplace.sold)} sold`
                : module.id === 'lost-found'
                  ? `${number.format(data.insights.lostFound.resolved)} resolved`
                  : module.id === 'teamup'
                    ? `${number.format(data.insights.teamUp.completed)} completed`
                    : `${number.format(data.insights.services.completedRequests)} requests completed`;
            return (
              <Link
                className="cc-metric-card cc-db-metric"
                key={module.id}
                to={module.path}
                aria-label={`${module.title}: ${number.format(metric.value)} ${metric.label.toLowerCase()}, ${secondary}. Open your workspace.`}
              >
                <div className="cc-db-metric-header">
                  <span className="cc-db-icon">
                    <Icon name={module.icon} />
                  </span>
                  <h3>{module.title}</h3>
                </div>
                <strong className="cc-db-value">{number.format(metric.value)}</strong>
                <span className="cc-db-metric-label">{metric.label}</span>
                <div className="cc-db-metric-footer">
                  <span>{secondary}</span>
                  <Icon name="arrow" />
                </div>
              </Link>
            );
          })}
        </div>
        <details className="cc-db-definitions">
          <summary>What do these counts include?</summary>
          <dl>
            <div>
              <dt>Marketplace</dt>
              <dd>
                Your active and sold listings are counted separately, including your own moderated
                listings.
              </dd>
            </div>
            <div>
              <dt>Lost &amp; Found</dt>
              <dd>
                Open reports include open, matched and claim-pending reports you submitted. Resolved
                reports are separate.
              </dd>
            </div>
            <div>
              <dt>TeamUp</dt>
              <dd>
                Projects owned excludes archived projects. Completed projects are included in that
                owned total; memberships and applications are not this count.
              </dd>
            </div>
            <div>
              <dt>Campus Services</dt>
              <dd>
                Active services are your active offers. Request counts belong to services you
                provide, including requests on paused or archived offers; they are not requests you
                sent.
              </dd>
            </div>
            <div>
              <dt>Communication</dt>
              <dd>
                Unread messages are messages received by you that are unread and not deleted.
                Notifications have a separate count.
              </dd>
            </div>
          </dl>
        </details>
      </section>
      <div className="cc-db-work-grid">
        <section className="cc-db-panel cc-db-attention" aria-labelledby="db-attention">
          <div className="cc-db-section-heading">
            <div>
              <h2 id="db-attention">Needs your attention</h2>
            </div>
            <Icon name="bell" />
          </div>
          {attention.length ? (
            <ul className="cc-db-attention-list">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link to={item.path} className="cc-db-attention-link">
                    <span className="cc-db-icon">
                      <Icon name={item.icon} />
                    </span>
                    <div>
                      <span className="cc-db-attention-title">
                        <strong>{number.format(item.count)}</strong> {item.label}
                      </span>
                      <p>{item.description}</p>
                    </div>
                    <Icon name="arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cc-db-caught-up">
              <span className="cc-db-icon">
                <Icon name="check" />
              </span>
              <div>
                <h3>Nothing waiting here</h3>
                <p>No pending service requests received or unread messages in this snapshot.</p>
              </div>
            </div>
          )}
        </section>
        <section className="cc-db-panel cc-db-quick-actions" aria-labelledby="db-actions">
          <div className="cc-db-section-heading">
            <div>
              <h2 id="db-actions">Quick actions</h2>
            </div>
          </div>
          <div className="cc-db-actions">
            {dashboardQuickActions.map((action) => (
              <Link
                key={action.path}
                to={action.path}
                className="cc-db-action"
                aria-label={`${action.label}: ${action.detail}`}
              >
                <Icon name={action.icon} />
                <div>
                  <strong>{action.label}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading activity dashboard"
      aria-busy="true"
      className="cc-db-loading"
    >
      <span className="sr-only">
        Loading your activity. Totals will appear when the dashboard is ready.
      </span>
      <div className="cc-db-section-heading">
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="cc-db-metrics">
        {[1, 2, 3, 4].map((id) => (
          <Skeleton key={id} className="cc-db-metric-skeleton" />
        ))}
      </div>
      <div className="cc-db-work-grid">
        <Skeleton className="cc-db-panel-skeleton" />
        <Skeleton className="cc-db-panel-skeleton" />
      </div>
    </div>
  );
}
