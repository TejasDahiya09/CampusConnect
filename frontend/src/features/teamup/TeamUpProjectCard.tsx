import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import type { TeamUpProject } from './teamup.types';
import { teamUpCapacity, teamUpDeadline, teamUpLabel } from './teamup-discovery';

export function TeamUpProjectCard({ project }: { readonly project: TeamUpProject }) {
  return (
    <article className="cc-tu-card">
      <Link
        to={`/teamup/${project.id}`}
        className="cc-tu-project-link"
        aria-label={`View project: ${project.title}`}
      >
        <div className="cc-tu-card-heading">
          <span className="cc-tu-project-icon" aria-hidden="true">
            <Icon name="team" />
          </span>
          <p className="cc-tu-card-category" title={project.category ?? undefined}>
            {project.category || 'Student project'}
          </p>
          <span className="cc-tu-status" data-status={project.status}>
            {teamUpLabel(project.status)}
          </span>
        </div>
        <h3 title={project.title}>{project.title}</h3>
        <p className="cc-tu-card-description">{project.description}</p>
        <div className="cc-tu-skills" aria-label="Required skills">
          {project.requiredSkills.length ? (
            <>
              {project.requiredSkills.slice(0, 4).map((skill) => (
                <span key={skill} title={skill}>
                  {skill}
                </span>
              ))}
              {project.requiredSkills.length > 4 ? (
                <span title={project.requiredSkills.slice(4).join(', ')}>
                  +{project.requiredSkills.length - 4} more
                </span>
              ) : null}
            </>
          ) : (
            <p>No specific skills listed</p>
          )}
        </div>
        <div className="cc-tu-card-team">
          <span>
            <Icon name="team" />
            {project.currentMemberCount}/{project.maxMembers} members
          </span>
          <span>{teamUpCapacity(project)}</span>
        </div>
        <div className="cc-tu-card-footer">
          <span>
            <Icon name="calendar" />
            {teamUpDeadline(project.deadline)}
          </span>
          <span className="cc-tu-card-open">
            View project <Icon name="arrow" />
          </span>
        </div>
      </Link>
    </article>
  );
}
