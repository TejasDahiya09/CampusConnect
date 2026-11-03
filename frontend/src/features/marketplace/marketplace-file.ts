export const fileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`;
