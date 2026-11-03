import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';

export function MarketplaceSearch({
  initialValue,
  onSearch,
}: {
  readonly initialValue: string;
  readonly onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <form
      className="cc-market-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        onSearch(value.trim());
      }}
    >
      <label className="sr-only" htmlFor="marketplace-search">
        Search listings
      </label>
      <Icon name="search" />
      <input
        id="marketplace-search"
        type="search"
        autoComplete="off"
        maxLength={100}
        placeholder="Search listings"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onSearch(next.trim()), 350);
        }}
      />
      <button type="submit" aria-label="Search Marketplace">
        <Icon name="arrow" />
      </button>
    </form>
  );
}
