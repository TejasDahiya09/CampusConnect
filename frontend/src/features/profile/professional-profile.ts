import { apiRequest, ApiClientError } from '../../services/api-client';
export interface ProfessionalDetails {
  readonly headline: string | null;
  readonly education: readonly { institution: string; qualification: string }[];
  readonly experience: readonly { role: string; organization: string; description: string }[];
}
export interface ProfessionalState {
  readonly available: boolean;
  readonly version?: string | null;
  readonly details: ProfessionalDetails | null;
}
export const emptyProfessional: ProfessionalDetails = {
  headline: null,
  education: [],
  experience: [],
};
/** Fail closed on malformed success envelopes; disabled storage never supplies saved data. */
export function parseProfessionalState(value: unknown): ProfessionalState {
  const fail = (): never => {
    throw new ApiClientError(
      'PROFESSIONAL_RESPONSE_INVALID',
      'Professional response is invalid.',
      502,
    );
  };
  if (!value || typeof value !== 'object') return fail();
  const v = value as Record<string, unknown>;
  if (typeof v.available !== 'boolean') return fail();
  if (!v.available) return { available: false, details: null, version: null };
  if (typeof v.version !== 'string' || !/^[a-f0-9]{64}$/.test(v.version)) return fail();
  if (v.details === null) return { available: true, details: null, version: v.version };
  if (!v.details || typeof v.details !== 'object') return fail();
  const d = v.details as Record<string, unknown>;
  if (
    !(d.headline === null || (typeof d.headline === 'string' && d.headline.length <= 180)) ||
    !Array.isArray(d.education) ||
    d.education.length > 5 ||
    !Array.isArray(d.experience) ||
    d.experience.length > 5
  )
    return fail();
  const entry = (row: unknown, fields: readonly string[], required: string) => {
    if (!row || typeof row !== 'object') return fail();
    const record = row as Record<string, unknown>;
    for (const key of fields)
      if (
        typeof record[key] !== 'string' ||
        record[key].length > (key === 'description' ? 1000 : 180)
      )
        return fail();
    if (!(record[required] as string).trim()) return fail();
    return record;
  };
  const education = d.education.map((row) => {
    const e = entry(row, ['institution', 'qualification'], 'institution');
    return { institution: e.institution as string, qualification: e.qualification as string };
  });
  const experience = d.experience.map((row) => {
    const e = entry(row, ['role', 'organization', 'description'], 'role');
    return {
      role: e.role as string,
      organization: e.organization as string,
      description: e.description as string,
    };
  });
  return {
    available: true,
    version: v.version,
    details: { headline: d.headline, education, experience },
  };
}
export const getProfessional = async (): Promise<ProfessionalState> =>
  parseProfessionalState(
    (await apiRequest<{ professional: unknown }>('/api/profile/me/professional')).professional,
  );
export const saveProfessional = async (
  details: ProfessionalDetails,
  version: string,
): Promise<ProfessionalState> => {
  const saved = parseProfessionalState(
    (
      await apiRequest<{ professional: unknown }>('/api/profile/me/professional', {
        method: 'PUT',
        headers: { 'If-Match': `"${version}"` },
        body: JSON.stringify(details),
      })
    ).professional,
  );
  if (!saved.available || !saved.details)
    throw new ApiClientError(
      'PROFESSIONAL_SAVE_UNCONFIRMED',
      'Professional save was not confirmed.',
      502,
    );
  return saved;
};
