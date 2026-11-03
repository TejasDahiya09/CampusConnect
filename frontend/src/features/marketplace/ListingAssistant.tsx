import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Badge, Button, Card } from '../../components/ui';
import type { ListingDraft, MarketplaceCategory } from './marketplace.types';

export function ListingAssistant({
  categories,
  onApprove,
}: {
  readonly categories: readonly MarketplaceCategory[];
  readonly onApprove: (suggestion: Partial<ListingDraft>) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState(false);
  const electronics = categories.find(({ slug }) => slug === 'electronics');
  const suggestion: Partial<ListingDraft> = {
    ...(electronics ? { categoryId: electronics.id } : {}),
    condition: 'LIKE_NEW',
    description:
      'Well-maintained scientific calculator in excellent working condition. Used for one academic year and includes the protective cover. Ideal for engineering and science coursework.',
    title: 'Scientific calculator in excellent condition',
  };
  return (
    <Card className="border-indigo-300/15 p-5">
      <div className="flex items-start gap-4">
        <span className="cc-icon-box shrink-0">
          <Icon className="size-5" name="sparkles" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">AI listing assistant</h2>
            <Badge tone="info">Interface preview</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--cc-muted)]">
            Describe your item naturally. Future AI integration will suggest a title, description,
            category, tags, and safety guidance.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="cc-field"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. almost-new scientific calculator bought last year"
              value={prompt}
            />
            <Button
              disabled={!prompt.trim()}
              onClick={() => setGenerated(true)}
              type="button"
              variant="secondary"
            >
              Generate preview
            </Button>
          </div>
          {generated ? (
            <div className="mt-4 rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--cc-muted)]">
                Suggested draft
              </p>
              <h3 className="mt-2 text-sm font-semibold">{suggestion.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--cc-muted)]">
                {suggestion.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>Like new</Badge>
                <Badge>Electronics</Badge>
                <Badge tone="success">No safety issues detected</Badge>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => onApprove(suggestion)} type="button">
                  Approve and use
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
