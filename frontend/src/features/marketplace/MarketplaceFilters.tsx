import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { conditions, discoveryStatuses, readableEnum } from './marketplace-format';
import {
  marketplacePriceRangeError,
  type MarketplaceDiscoveryState,
} from './marketplace-discovery';
import type { MarketplaceCategory } from './marketplace.types';

export function MarketplaceFilters({
  categories,
  state,
  onApply,
  onClear,
}: {
  readonly categories: readonly MarketplaceCategory[];
  readonly state: MarketplaceDiscoveryState;
  readonly onApply: (patch: Partial<MarketplaceDiscoveryState>) => void;
  readonly onClear: () => void;
}) {
  const [draft, setDraft] = useState(state);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="cc-market-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = marketplacePriceRangeError(draft.minPrice, draft.maxPrice);
        setError(problem);
        if (!problem)
          onApply({
            categoryId: draft.categoryId,
            condition: draft.condition,
            status: draft.status,
            minPrice: draft.minPrice,
            maxPrice: draft.maxPrice,
          });
      }}
    >
      <div className="cc-market-filter-heading">
        <Icon name="filter" />
        <h2>Refine your finds</h2>
      </div>
      <label className="cc-label">
        Category
        <select
          className="cc-field"
          value={draft.categoryId}
          data-active={Boolean(draft.categoryId)}
          onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Price range</legend>
        <div className="cc-market-price-fields">
          <label className="cc-label">
            Minimum
            <input
              className="cc-field"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draft.minPrice}
              onChange={(event) => setDraft({ ...draft, minPrice: event.target.value })}
            />
          </label>
          <label className="cc-label">
            Maximum
            <input
              className="cc-field"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Any"
              value={draft.maxPrice}
              onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
            />
          </label>
        </div>
        <p className="cc-market-hint">Amounts use each listing’s currency.</p>
      </fieldset>
      <label className="cc-label">
        Condition
        <select
          className="cc-field"
          value={draft.condition}
          data-active={Boolean(draft.condition)}
          onChange={(event) =>
            setDraft({
              ...draft,
              condition: event.target.value as MarketplaceDiscoveryState['condition'],
            })
          }
        >
          <option value="">Any condition</option>
          {conditions.map((value) => (
            <option key={value} value={value}>
              {readableEnum(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="cc-label">
        Availability
        <select
          className="cc-field"
          value={draft.status}
          data-active={Boolean(draft.status)}
          onChange={(event) =>
            setDraft({
              ...draft,
              status: event.target.value as MarketplaceDiscoveryState['status'],
            })
          }
        >
          <option value="">Active and sold</option>
          {discoveryStatuses.map((value) => (
            <option key={value} value={value}>
              {readableEnum(value)}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="cc-market-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cc-market-filter-actions">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear all
        </Button>
      </div>
    </form>
  );
}
