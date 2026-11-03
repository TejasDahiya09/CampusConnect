const linkedInHosts = new Set(['linkedin.com', 'www.linkedin.com']);

export const isLinkedInProfileUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return (
      url.protocol === 'https:' &&
      linkedInHosts.has(url.hostname.toLowerCase()) &&
      segments.length === 2 &&
      segments[0]?.toLowerCase() === 'in' &&
      Boolean(segments[1])
    );
  } catch {
    return false;
  }
};
