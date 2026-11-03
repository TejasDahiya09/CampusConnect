import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import { messagingService } from '../messaging/messaging-service';
import type { ProjectRecommendation, StudentRecommendation } from './students.types';
import { StudentAvatar } from './StudentAvatar';

export function StudentRecommendationCards({
  recommendations,
}: {
  readonly recommendations: readonly StudentRecommendation[];
}) {
  const navigate = useNavigate();
  if (!recommendations.length)
    return (
      <EmptyState
        description="No students currently have enough public matching evidence."
        title="No suitable collaborators yet"
      />
    );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {recommendations.map(({ match, student }) => (
        <Card className="p-4" key={student.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <StudentAvatar avatar={student.avatar} displayName={student.displayName} />
              <div>
                <h3 className="font-semibold">{student.displayName}</h3>
                <p className="text-sm text-slate-500">
                  {student.department ?? 'Department not shared'}
                </p>
              </div>
            </div>
            <Badge tone={match.label.startsWith('Strong') ? 'success' : 'info'}>
              {match.label}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {match.matchedSkills.map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">{match.reasons[0]}</p>
          <div className="mt-4 flex gap-2">
            <Link className="cc-button cc-button--secondary" to={`/profile/${student.id}`}>
              View profile
            </Link>
            <Button
              onClick={() =>
                void messagingService
                  .open({ contextType: 'DIRECT', targetUserId: student.id })
                  .then(({ id }) => navigate(`/messages/${id}`))
              }
              type="button"
            >
              Message student
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ProjectRecommendationCards({
  recommendations,
}: {
  readonly recommendations: readonly ProjectRecommendation[];
}) {
  if (!recommendations.length)
    return (
      <EmptyState
        description="Add profile skills or check again when new open projects are posted."
        title="No evidence-based recommendations yet"
      />
    );
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {recommendations.map(({ match, project }) => (
        <Card className="p-4" key={project.id}>
          <Badge tone={match.label.startsWith('Strong') ? 'success' : 'info'}>{match.label}</Badge>
          <h3 className="mt-3 font-semibold">{project.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-slate-400">{project.description}</p>
          <p className="mt-3 text-xs text-slate-500">{match.reasons[0]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {match.matchedSkills.map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
          </div>
          {match.missingSkills.length ? (
            <p className="mt-3 text-xs text-slate-500">
              Other requested skills: {match.missingSkills.join(', ')}
            </p>
          ) : null}
          {project.viewerApplicationStatus ? (
            <p className="mt-3 text-xs font-medium text-amber-500">
              Application status: {project.viewerApplicationStatus.toLowerCase()}
            </p>
          ) : null}
          <Link className="cc-button cc-button--primary mt-4" to={`/teamup/${project.id}`}>
            {project.viewerApplicationStatus ? 'View project' : 'View project & apply'}
          </Link>
        </Card>
      ))}
    </div>
  );
}
