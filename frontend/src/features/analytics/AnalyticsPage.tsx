import { Badge, Card, DemoNotice, PageHeader, StatCard } from '../../components/ui';
import { demoRepository } from '../demo/demo-repository';

const bars = [42, 58, 46, 74, 68, 88, 78, 92, 72, 84, 95, 89];

export function AnalyticsPage() {
  const metrics = demoRepository.getMetrics();
  return (
    <div className="cc-page">
      <PageHeader
        description="A clear view of platform engagement, campus recovery, and future AI quality."
        eyebrow="Insights preview"
        title="Campus analytics"
      />
      <div className="mt-6">
        <DemoNotice>
          All metrics and charts are representative demo data. Event collection and analytics APIs
          are not implemented.
        </DemoNotice>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <StatCard
            detail={metric.change}
            icon={
              index === 0 ? 'team' : index === 1 ? 'store' : index === 2 ? 'search' : 'analytics'
            }
            key={metric.label}
            label={metric.label}
            tone={index === 0 ? 'indigo' : index === 1 ? 'cyan' : index === 2 ? 'emerald' : 'rose'}
            value={metric.value}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_.6fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Platform activity</h2>
              <p className="mt-1 text-sm text-slate-500">Interactions over the last 12 weeks</p>
            </div>
            <Badge tone="info">Demo series</Badge>
          </div>
          <div className="mt-8 flex h-64 items-end gap-2 sm:gap-3">
            {bars.map((height, index) => (
              <div
                className="group relative flex h-full flex-1 items-end"
                key={`${height}-${index}`}
              >
                <div
                  className="w-full rounded-t-md bg-indigo-400/55 transition group-hover:bg-indigo-300"
                  style={{ height: `${height}%` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 text-[.6rem] text-slate-400 group-hover:block">
                  {height * 12}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[.65rem] text-slate-600">
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Module engagement</h2>
          <div className="mt-6 grid gap-5">
            {[
              ['Marketplace', 82],
              ['Lost & Found', 64],
              ['TeamUp', 51],
              ['Services', 43],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-medium text-slate-300">{value}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-400"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Marketplace</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Bookmark rate</dt>
              <dd>18.4%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Median price</dt>
              <dd>₹720</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sold listings</dt>
              <dd>76</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Lost & Found</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Recovery rate</dt>
              <dd>68%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Avg. confidence</dt>
              <dd>84%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Open reports</dt>
              <dd>31</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">AI readiness</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Evaluation dataset</dt>
              <dd>Planned</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Precision@5</dt>
              <dd>—</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Model calls</dt>
              <dd>0</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
