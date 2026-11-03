import { apiRequest, apiRequestWithMeta } from '../../services/api-client';
import type {
  TeamUpApplication,
  TeamUpDraft,
  TeamUpFilters,
  TeamUpPageResult,
  TeamUpProject,
  TeamUpStatus,
  TeamUpWorkspace,
} from './teamup.types';

const projectPath = (id: string) => `/api/teamup/projects/${encodeURIComponent(id)}`;
export const createTeamUpApi = (request = apiRequest, requestWithMeta = apiRequestWithMeta) => ({
  apply: async (id: string, message: string): Promise<TeamUpApplication> =>
    (
      await request<{ readonly application: TeamUpApplication }>(
        `${projectPath(id)}/applications`,
        { body: JSON.stringify({ message: message.trim() || null }), method: 'POST' },
      )
    ).application,
  createProject: async (draft: TeamUpDraft): Promise<TeamUpProject> =>
    (
      await request<{ readonly project: TeamUpProject }>('/api/teamup/projects', {
        body: JSON.stringify(draft),
        method: 'POST',
      })
    ).project,
  getApplications: async (id: string): Promise<readonly TeamUpApplication[]> =>
    (
      await request<{ readonly applications: readonly TeamUpApplication[] }>(
        `${projectPath(id)}/applications`,
      )
    ).applications,
  getProject: async (id: string): Promise<TeamUpProject> =>
    (await request<{ readonly project: TeamUpProject }>(projectPath(id))).project,
  getProjects: async (filters: TeamUpFilters, signal?: AbortSignal): Promise<TeamUpPageResult> => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== '') query.set(key, String(value));
    const response = await requestWithMeta<{ readonly projects: readonly TeamUpProject[] }>(
      `/api/teamup/projects?${query}`,
      { signal },
    );
    return {
      pagination: {
        limit: Number(response.meta?.limit ?? filters.limit),
        page: Number(response.meta?.page ?? filters.page),
        total: Number(response.meta?.total ?? 0),
        totalPages: Number(response.meta?.totalPages ?? 0),
      },
      projects: response.data.projects,
    };
  },
  getWorkspace: async (): Promise<TeamUpWorkspace> =>
    request<TeamUpWorkspace>('/api/teamup/workspace'),
  reviewApplication: async (
    projectId: string,
    applicationId: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) =>
    request<{ readonly application: TeamUpApplication; readonly project: TeamUpProject }>(
      `${projectPath(projectId)}/applications/${encodeURIComponent(applicationId)}`,
      { body: JSON.stringify({ status }), method: 'PATCH' },
    ),
  transition: async (id: string, status: TeamUpStatus): Promise<TeamUpProject> =>
    (
      await request<{ readonly project: TeamUpProject }>(`${projectPath(id)}/status`, {
        body: JSON.stringify({ status }),
        method: 'PATCH',
      })
    ).project,
  updateProject: async (id: string, draft: Partial<TeamUpDraft>): Promise<TeamUpProject> =>
    (
      await request<{ readonly project: TeamUpProject }>(projectPath(id), {
        body: JSON.stringify(draft),
        method: 'PATCH',
      })
    ).project,
});
export const teamUpApi = createTeamUpApi();
