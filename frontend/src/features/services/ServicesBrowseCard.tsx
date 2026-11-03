import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { pricingLabel, type StudentService } from './services.types';

export function ServicesBrowseCard({ service }: { readonly service: StudentService }) {
  const name = service.provider.displayName || 'CampusConnect student';
  const price =
    service.pricingType === 'FIXED' &&
    (service.price === null || !Number.isFinite(Number(service.price)))
      ? 'Price unavailable'
      : pricingLabel(service);
  return (
    <Link
      to={`/services/${service.id}`}
      className="cc-sv-card"
      aria-label={`${service.title} — ${price}`}
    >
      <div className="cc-sv-card-top">
        <span className="cc-sv-category">{service.category || 'Student service'}</span>
        <strong className="cc-sv-price">{price}</strong>
      </div>
      <h3>{service.title}</h3>
      <p className="cc-sv-summary">{service.description || 'Open this service to learn more.'}</p>
      <div className="cc-sv-provider">
        <span className="cc-sv-avatar" aria-hidden="true">
          {name === 'CampusConnect student' ? (
            <Icon name="profile" />
          ) : (
            name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
          )}
        </span>
        <div>
          <span className="cc-sv-provider-label">Offered by</span>
          <span>{name}</span>
        </div>
      </div>
      {service.skills.length ? (
        <ul className="cc-sv-skills" aria-label="Relevant skills">
          {service.skills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
      ) : null}
      <div className="cc-sv-card-footer">
        <span>{service.location || 'Location not specified'}</span>
        <span className="cc-sv-details-link">
          View details <Icon name="arrow" />
        </span>
      </div>
    </Link>
  );
}
