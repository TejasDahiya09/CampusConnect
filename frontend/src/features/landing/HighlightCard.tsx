import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ContentVisual } from './ContentVisual';
import type { LandingHighlight } from './landing-highlights';
import { highlightPresentation } from './landing-presentation';

export function HighlightCard({
  item,
  compact = false,
}: {
  readonly item: LandingHighlight;
  readonly compact?: boolean;
}) {
  const display = highlightPresentation(item);
  return (
    <article className={`cc-highlight-card${compact ? ' cc-highlight-card--compact' : ''}`}>
      <ContentVisual kind={display.visual} compact={compact} />
      <div className="cc-highlight-copy">
        <small className="cc-record-label">
          <Icon name="sparkles" /> Owner-featured · {display.label}
        </small>
        <h4>{item.title}</h4>
        <p>{item.summary}</p>
        <div className="cc-record-tags">
          {display.tags.slice(0, 4).map((tag, index) => (
            <span key={`${tag}:${index}`}>{tag}</span>
          ))}
        </div>
        <div className="cc-highlight-action">
          {display.price ? <strong>{display.price}</strong> : null}
          <Link to={item.route}>
            View post <Icon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  );
}
