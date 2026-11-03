import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { adminApi } from './admin-service';
import type {
  AdminAuditItem,
  AdminContentItem,
  AdminOverview,
  AdminSection,
  AdminUser,
} from './admin.types';

const sections: readonly { id: AdminSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'content', label: 'Content' },
  { id: 'audit', label: 'Audit logs' },
  { id: 'system', label: 'System' },
];
const contentStatuses: Readonly<Record<string, readonly string[]>> = {
  LOST_FOUND: ['OPEN', 'MATCHED', 'CLAIM_PENDING', 'RESOLVED', 'ARCHIVED', 'REMOVED'],
  MARKETPLACE: ['ACTIVE', 'SOLD', 'ARCHIVED'],
  SERVICE: ['ACTIVE', 'PAUSED', 'ARCHIVED'],
  TEAMUP: ['OPEN', 'FULL', 'COMPLETED', 'ARCHIVED'],
};
const readable = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
const tone = (value: string): 'danger' | 'success' | 'warning' =>
  value === 'ACTIVE' || value === 'AVAILABLE'
    ? 'success'
    : value === 'SUSPENDED' || value === 'UNAVAILABLE'
      ? 'danger'
      : 'warning';

export function AdminPage() {
  const [section, setSection] = useState<AdminSection>('overview');
  return (
    <div className="cc-page">
      <PageHeader
        description="Secure operational oversight for the designated CampusConnect administrator."
        eyebrow="Restricted administration"
        title="Platform management"
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden p-2">
          <nav aria-label="Admin sections" className="cc-section-nav">
            {sections.map((item) => (
              <button
                aria-current={section === item.id ? 'page' : undefined}
                className={`cc-section-nav-item ${section === item.id ? 'cc-section-nav-item--active' : ''}`}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <Link className="cc-section-nav-item mt-2" to="/moderation">
            Open moderation queue
          </Link>
        </Card>
        <section aria-live="polite">
          {section === 'overview' ? (
            <Overview />
          ) : section === 'users' ? (
            <Users />
          ) : section === 'content' ? (
            <Content />
          ) : section === 'audit' ? (
            <Audit />
          ) : (
            <System />
          )}
        </section>
      </div>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void adminApi
      .overview()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <Card>
        <EmptyState
          description="The overview could not be loaded safely."
          title="Administration unavailable"
        />
      </Card>
    );
  if (!data) return <Skeleton className="h-96" />;
  const metrics = data.metrics;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail={`${metrics.activeUsers} active`}
          icon="team"
          label="Registered users"
          value={String(metrics.totalUsers)}
        />
        <StatCard
          detail={`${metrics.suspendedUsers} suspended`}
          icon="warning"
          label="Account reviews"
          tone="rose"
          value={String(metrics.suspendedUsers)}
        />
        <StatCard
          detail="All student modules"
          icon="analytics"
          label="Published records"
          tone="cyan"
          value={String(
            metrics.marketplace + metrics.lostFound + metrics.teamUp + metrics.services,
          )}
        />
        <StatCard
          detail="Open or under review"
          icon="shield"
          label="Moderation reports"
          tone="emerald"
          value={String(metrics.pendingReports)}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Module inventory</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ['Marketplace', metrics.marketplace],
              ['Lost & Found', metrics.lostFound],
              ['TeamUp', metrics.teamUp],
              ['Services', metrics.services],
              ['Conversations', data.messaging.conversations],
              ['Messages', data.messaging.messages],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-white/[.07] p-3" key={label}>
                <p className="text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Recent activity</h2>
          <div className="mt-4 grid gap-3">
            {data.recentActivity.length ? (
              data.recentActivity.slice(0, 8).map((item) => (
                <div className="flex justify-between gap-3 text-sm" key={item.id}>
                  <span>{readable(item.event)}</span>
                  <time className="text-slate-500">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </time>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No activity has been recorded.</p>
            )}
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-semibold">30-day database trends</h2>
        <p className="mt-2 text-sm text-slate-500">
          {data.registrations.reduce((sum, item) => sum + item.count, 0)} registrations and{' '}
          {data.contentTrends.reduce((sum, item) => sum + item.count, 0)} content records created.
          Detailed daily values are derived from persisted timestamps.
        </p>
      </Card>
    </div>
  );
}

function Users() {
  const [filters, setFilters] = useState({ page: 1, role: '', search: '', status: '' });
  const [result, setResult] = useState<{
    items: readonly AdminUser[];
    pagination: { totalPages: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    status: 'ACTIVE' | 'SUSPENDED';
    user: AdminUser;
  } | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    let active = true;
    void adminApi
      .users(filters)
      .then((value) => {
        if (active) {
          setResult(value);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError('Users could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [filters]);
  const updateFilter = (patch: Partial<typeof filters>) => {
    setResult(null);
    setFilters((current) => ({ ...current, ...patch }));
  };
  const apply = async () => {
    if (!decision || !reason.trim()) return;
    try {
      await adminApi.updateUser(decision.user.id, decision.status, reason);
      setDecision(null);
      setReason('');
      updateFilter({});
    } catch {
      setError('The account update was rejected or could not be saved.');
    }
  };
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-white/[.07] p-4 md:grid-cols-3">
        <input
          aria-label="Search users"
          className="cc-field"
          onChange={(event) => updateFilter({ page: 1, search: event.target.value })}
          placeholder="Name, email, department"
          value={filters.search}
        />
        <select
          aria-label="Filter account status"
          className="cc-field"
          onChange={(event) => updateFilter({ page: 1, status: event.target.value })}
          value={filters.status}
        >
          <option value="">All statuses</option>
          {['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filter user role"
          className="cc-field"
          onChange={(event) => updateFilter({ page: 1, role: event.target.value })}
          value={filters.role}
        >
          <option value="">All roles</option>
          {['STUDENT', 'MODERATOR', 'ADMIN'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="p-4 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      {!result ? (
        <Skeleton className="m-4 h-64" />
      ) : result.items.length === 0 ? (
        <EmptyState description="No accounts match these filters." title="No users found" />
      ) : (
        <div
          aria-label="User management table"
          className="cc-table-scroll"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[.07]">
                {['Student', 'Department', 'Role', 'Status', 'Joined', 'Actions'].map((label) => (
                  <th className="p-4" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.map((user) => (
                <tr className="border-b border-white/[.05]" key={user.id}>
                  <td className="p-4">
                    <Link className="font-medium hover:text-indigo-300" to={`/profile/${user.id}`}>
                      {user.displayName}
                    </Link>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="p-4">{user.department ?? 'Not set'}</td>
                  <td className="p-4">{readable(user.role)}</td>
                  <td className="p-4">
                    <Badge tone={tone(user.status)}>{readable(user.status)}</Badge>
                  </td>
                  <td className="p-4">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">
                    {user.role === 'ADMIN' ? (
                      <span className="text-xs text-slate-500">Protected admin</span>
                    ) : user.status === 'ACTIVE' ? (
                      <Button
                        onClick={() => setDecision({ status: 'SUSPENDED', user })}
                        variant="danger"
                      >
                        Suspend
                      </Button>
                    ) : user.status === 'SUSPENDED' ? (
                      <Button
                        onClick={() => setDecision({ status: 'ACTIVE', user })}
                        variant="secondary"
                      >
                        Reactivate
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">No action</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={filters.page}
        pages={result?.pagination.totalPages ?? 1}
        setPage={(page) => updateFilter({ page })}
      />
      {decision ? (
        <Modal
          description="This consequential action is recorded in durable activity history."
          onClose={() => setDecision(null)}
          open
          title={`${decision.status === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${decision.user.displayName}`}
        >
          <label className="cc-label">
            Administrative reason
            <textarea
              className="cc-field min-h-24"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDecision(null)} variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() => void apply()}
              variant={decision.status === 'SUSPENDED' ? 'danger' : 'primary'}
            >
              Confirm action
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function Content() {
  const [filters, setFilters] = useState({
    page: 1,
    search: '',
    status: '',
    type: 'MARKETPLACE',
    visibility: '',
  });
  const [result, setResult] = useState<{
    items: readonly AdminContentItem[];
    pagination: { totalPages: number };
  } | null>(null);
  const [error, setError] = useState(false);
  const [decision, setDecision] = useState<{
    item: AdminContentItem;
    visibility: 'HIDDEN' | 'VISIBLE';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    let active = true;
    void adminApi
      .content(filters)
      .then((value) => {
        if (active) {
          setResult(value);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [filters]);
  const update = (patch: Partial<typeof filters>) => {
    setResult(null);
    setFilters((current) => ({ ...current, ...patch }));
  };
  const enforce = async () => {
    if (!decision || !reason.trim()) return;
    setSubmitting(true);
    setFeedback('');
    try {
      await adminApi.enforceContent(
        decision.item.type,
        decision.item.id,
        decision.visibility,
        reason.trim(),
      );
      setFeedback(
        `${decision.item.title} was ${decision.visibility === 'HIDDEN' ? 'hidden' : 'restored'}.`,
      );
      setDecision(null);
      setReason('');
      update({});
    } catch {
      setFeedback('The moderation action could not be completed. Refresh and try again.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-white/[.07] p-4 md:grid-cols-4">
        <select
          aria-label="Content module"
          className="cc-field"
          onChange={(event) => update({ page: 1, status: '', type: event.target.value })}
          value={filters.type}
        >
          {['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <input
          aria-label="Search content"
          className="cc-field"
          onChange={(event) => update({ page: 1, search: event.target.value })}
          placeholder="Title or category"
          value={filters.search}
        />
        <select
          aria-label="Filter content status"
          className="cc-field"
          onChange={(event) => update({ page: 1, status: event.target.value })}
          value={filters.status}
        >
          <option value="">All statuses</option>
          {(contentStatuses[filters.type] ?? []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filter moderation visibility"
          className="cc-field"
          onChange={(event) => update({ page: 1, visibility: event.target.value })}
          value={filters.visibility}
        >
          <option value="">All visibility</option>
          <option value="VISIBLE">Visible</option>
          <option value="HIDDEN">Hidden</option>
        </select>
      </div>
      {feedback ? (
        <p className="border-b border-white/[.07] p-4 text-sm" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="p-4 text-sm text-rose-300" role="alert">
          Content could not be loaded.
        </p>
      ) : null}
      {!result ? (
        <Skeleton className="m-4 h-64" />
      ) : result.items.length === 0 ? (
        <EmptyState description="No content matches these filters." title="No records found" />
      ) : (
        <div
          aria-label="Content inventory table"
          className="cc-table-scroll"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[.07]">
                {[
                  'Content',
                  'Owner',
                  'Lifecycle',
                  'Visibility',
                  'Metadata',
                  'Reports',
                  'Action',
                ].map((label) => (
                  <th className="p-4" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr className="border-b border-white/[.05]" key={item.id}>
                  <td className="p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.category ?? readable(item.type)}</p>
                  </td>
                  <td className="p-4">
                    <Link className="hover:text-indigo-300" to={`/profile/${item.owner.id}`}>
                      {item.owner.displayName}
                    </Link>
                  </td>
                  <td className="p-4">
                    <Badge tone={tone(item.status)}>{readable(item.status)}</Badge>
                  </td>
                  <td className="p-4">
                    <Badge tone={item.moderationVisibility === 'HIDDEN' ? 'danger' : 'success'}>
                      {readable(item.moderationVisibility)}
                    </Badge>
                    {item.moderationReason ? (
                      <p className="mt-1 max-w-52 text-xs text-slate-500">
                        {item.moderationReason}
                      </p>
                    ) : null}
                    {item.moderatedAt ? (
                      <time className="text-xs text-slate-500">
                        {new Date(item.moderatedAt).toLocaleString()}
                      </time>
                    ) : null}
                  </td>
                  <td className="p-4">{item.metadata}</td>
                  <td className="p-4">
                    {item.reportCount ? (
                      <Link className="text-indigo-300" to="/moderation">
                        {item.reportCount} report(s)
                      </Link>
                    ) : (
                      'None'
                    )}
                  </td>
                  <td className="p-4">
                    <Button
                      onClick={() => {
                        setDecision({
                          item,
                          visibility:
                            item.moderationVisibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
                        });
                        setReason('');
                      }}
                      variant={item.moderationVisibility === 'VISIBLE' ? 'danger' : 'secondary'}
                    >
                      {item.moderationVisibility === 'VISIBLE' ? 'Hide' : 'Restore'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={filters.page}
        pages={result?.pagination.totalPages ?? 1}
        setPage={(page) => update({ page })}
      />
      {decision ? (
        <Modal
          description="This changes public visibility without changing the content lifecycle status. The action is audited."
          onClose={() => setDecision(null)}
          open
          title={`${decision.visibility === 'HIDDEN' ? 'Hide' : 'Restore'} ${decision.item.title}`}
        >
          <label className="cc-label">
            Moderation reason
            <textarea
              className="cc-field min-h-24"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button disabled={submitting} onClick={() => setDecision(null)} variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={submitting || !reason.trim()}
              onClick={() => void enforce()}
              variant={decision.visibility === 'HIDDEN' ? 'danger' : 'primary'}
            >
              {submitting ? 'Saving…' : 'Confirm action'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function Audit() {
  const [filters, setFilters] = useState({ event: '', page: 1, search: '' });
  const [result, setResult] = useState<{
    items: readonly AdminAuditItem[];
    pagination: { totalPages: number };
  } | null>(null);
  useEffect(() => {
    let active = true;
    void adminApi.audit(filters).then((value) => {
      if (active) setResult(value);
    });
    return () => {
      active = false;
    };
  }, [filters]);
  const update = (patch: Partial<typeof filters>) => {
    setResult(null);
    setFilters((current) => ({ ...current, ...patch }));
  };
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-white/[.07] p-4 sm:grid-cols-2">
        <input
          aria-label="Search audit logs"
          className="cc-field"
          onChange={(event) => update({ page: 1, search: event.target.value })}
          placeholder="Action or target type"
          value={filters.search}
        />
        <input
          aria-label="Filter audit event"
          className="cc-field"
          onChange={(event) => update({ event: event.target.value, page: 1 })}
          placeholder="ADMIN_USER or MODERATION"
          value={filters.event}
        />
      </div>
      {!result ? (
        <Skeleton className="m-4 h-64" />
      ) : result.items.length === 0 ? (
        <EmptyState description="No activity matches these filters." title="No audit records" />
      ) : (
        <div className="grid divide-y divide-white/[.06]">
          {result.items.map((item) => (
            <div className="grid gap-1 p-4 sm:grid-cols-[1fr_auto]" key={item.id}>
              <div>
                <p className="text-sm font-medium">{readable(item.event)}</p>
                <p className="text-xs text-slate-500">
                  {item.actor?.displayName ?? 'System'} · {item.entityType ?? 'Platform'}
                </p>
              </div>
              <time className="text-xs text-slate-500">
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}
      <Pager
        page={filters.page}
        pages={result?.pagination.totalPages ?? 1}
        setPage={(page) => update({ page })}
      />
    </Card>
  );
}

function System() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.system>> | null>(null);
  useEffect(() => {
    let active = true;
    void adminApi.system().then((value) => {
      if (active) setData(value);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!data) return <Skeleton className="h-80" />;
  const capabilities = data.ai.version.data?.capabilities ?? [];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-semibold">AI service monitoring</h2>
        <div className="mt-4 grid gap-3">
          {[
            ['Configured', data.ai.configured ? 'YES' : 'NO'],
            ['Health', data.ai.health.status],
            ['Readiness', data.ai.readiness.status],
            ['Version contract', data.ai.version.status],
          ].map(([label, value]) => (
            <div className="flex justify-between gap-3 text-sm" key={label}>
              <span className="text-slate-500">{label}</span>
              <Badge tone={tone(String(value))}>{readable(String(value))}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Checks use existing non-generative health contracts and never invoke paid inference.
        </p>
        <div className="mt-4 grid gap-2 text-xs text-slate-400">
          {[
            ['Resume extraction', 'resume-skill-extraction'],
            ['Lost & Found matching', 'lost-found-semantic-matching'],
            ['TeamUp recommendations', 'teamup-semantic-recommendations'],
            ['Campus Assistant', 'assistant-grounded-generation'],
          ].map(([label, capability]) => (
            <div className="flex justify-between gap-3" key={capability}>
              <span>{label}</span>
              <span>{capabilities.includes(capability) ? 'Advertised' : 'Not verified'}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Approved configuration</h2>
        <div className="mt-4 grid gap-3">
          {Object.entries(data.configuration).map(([label, value]) => (
            <div className="flex justify-between gap-3 text-sm" key={label}>
              <span className="text-slate-500">{readable(label)}</span>
              <span>
                {typeof value === 'boolean'
                  ? value
                    ? 'Configured'
                    : 'Not configured'
                  : readable(value)}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 xl:col-span-2">
        <h2 className="font-semibold">Capability boundaries</h2>
        <ul className="mt-4 grid gap-2 text-sm text-slate-400">
          <li>Private encrypted message inspection: unavailable.</li>
          <li>
            Content moderation visibility: additive migration prepared; live approval pending.
          </li>
          <li>Platform announcements: deferred until bounded background delivery is available.</li>
          <li>Runtime editing of credentials and infrastructure: intentionally unavailable.</li>
        </ul>
      </Card>
    </div>
  );
}

function Pager({
  page,
  pages,
  setPage,
}: {
  readonly page: number;
  readonly pages: number;
  readonly setPage: (page: number) => void;
}) {
  return pages > 1 ? (
    <div className="flex justify-center gap-3 border-t border-white/[.07] p-4">
      <Button disabled={page <= 1} onClick={() => setPage(page - 1)} variant="secondary">
        Previous
      </Button>
      <span className="self-center text-sm">
        Page {page} of {pages}
      </span>
      <Button disabled={page >= pages} onClick={() => setPage(page + 1)} variant="secondary">
        Next
      </Button>
    </div>
  ) : null;
}
