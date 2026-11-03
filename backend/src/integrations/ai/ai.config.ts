import { env } from '../../config/env.js';
import type { AiServiceConfig } from './ai.types.js';

export const aiServiceConfig: AiServiceConfig = Object.freeze({
  apiKey: env.aiServiceApiKey,
  enabled: env.aiServiceEnabled,
  timeoutMs: env.aiServiceTimeoutMs,
  generationTimeoutMs: env.aiServiceGenerationTimeoutMs,
  url: env.aiServiceUrl,
});
