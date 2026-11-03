import { apiRequest } from '../../services/api-client';
import type { ProjectRecommendation, StudentRecommendation } from './students.types';

export const studentsApi = {
  recommendedProjects: async () =>
    (
      await apiRequest<{ projects: readonly ProjectRecommendation[] }>(
        '/api/teamup/recommended-projects',
      )
    ).projects,
  recommendedStudents: async (projectId: string) =>
    (
      await apiRequest<{ recommendations: readonly StudentRecommendation[] }>(
        `/api/teamup/projects/${encodeURIComponent(projectId)}/recommended-students`,
      )
    ).recommendations,
};
