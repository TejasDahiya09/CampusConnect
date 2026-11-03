import type { TeamUpProject } from './teamup.types';
import { canApplyToProject } from './teamup.types';
import type { createTeamUpApi } from './teamup-service';

export function projectParticipation(
  project: TeamUpProject,
  today = new Date().toISOString().slice(0, 10),
) {
  if (project.viewerIsOwner)
    return {
      state: 'owner',
      title: 'Your project',
      description: 'Manage recruitment and keep your team moving.',
    };
  if (project.viewerIsMember)
    return {
      state: 'member',
      title: 'You’re on the team',
      description: 'Connect with your teammates below.',
    };
  if (project.viewerApplicationStatus)
    return {
      state: project.viewerApplicationStatus.toLowerCase(),
      title: `Application ${project.viewerApplicationStatus.toLowerCase()}`,
      description:
        project.viewerApplicationStatus === 'PENDING'
          ? 'Your application is with the project owner. No further submission is needed.'
          : project.viewerApplicationStatus === 'ACCEPTED'
            ? 'Your application was accepted. Refresh the project to check the current roster.'
            : 'The owner has reviewed your application. This project does not support repeat applications.',
    };
  if (project.status === 'COMPLETED' || project.status === 'ARCHIVED')
    return {
      state: 'closed',
      title: 'Recruitment closed',
      description: 'This project is no longer accepting applications.',
    };
  if (project.status === 'FULL' || project.currentMemberCount >= project.maxMembers)
    return {
      state: 'full',
      title: 'The team is full',
      description: 'All available places are currently filled.',
    };
  if (project.deadline && project.deadline < today)
    return {
      state: 'expired',
      title: 'Application deadline passed',
      description:
        'The listed application date has passed. Applications are unavailable on this page.',
    };
  return canApplyToProject(project)
    ? {
        state: 'eligible',
        title: 'Bring your skills to the team',
        description: 'Tell the owner how you’d like to contribute.',
      }
    : {
        state: 'closed',
        title: 'Applications unavailable',
        description: 'This project is not accepting applications.',
      };
}

// Mutation DTOs are summaries. Only authoritative reads may replace enriched records.
export async function refreshProjectReview(
  api: Pick<ReturnType<typeof createTeamUpApi>, 'getProject' | 'getApplications'>,
  id: string,
) {
  const [project, applications] = await Promise.all([api.getProject(id), api.getApplications(id)]);
  return { project, applications };
}
