import multer from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

const allowedMediaTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.resumeMaxBytes, files: 1, fields: 0 },
});
const windows = new Map<string, { count: number; startedAt: number }>();

export const resumeRateLimitMiddleware: RequestHandler = (request, _response, next) => {
  const userId = request.auth?.user.id;
  if (userId === undefined)
    return next(
      new AppError({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
        statusCode: 401,
      }),
    );
  const now = Date.now();
  const current = windows.get(userId);
  const window =
    current === undefined || now - current.startedAt >= 60_000
      ? { count: 1, startedAt: now }
      : { count: current.count + 1, startedAt: current.startedAt };
  windows.set(userId, window);
  if (window.count > 5)
    return next(
      new AppError({
        code: 'RESUME_RATE_LIMITED',
        message: 'Too many resume analyses. Please wait before retrying.',
        statusCode: 429,
      }),
    );
  return next();
};

export const validateResumeFile = (file: Express.Multer.File | undefined): Express.Multer.File => {
  if (file === undefined)
    throw new AppError({
      code: 'RESUME_REQUIRED',
      message: 'Select one PDF or DOCX resume.',
      statusCode: 400,
    });
  const extension = file.originalname.toLowerCase().match(/\.[^.]+$/u)?.[0];
  const pdf =
    file.mimetype === 'application/pdf' &&
    extension === '.pdf' &&
    file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const docx =
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
    extension === '.docx' &&
    file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!allowedMediaTypes.has(file.mimetype) || (!pdf && !docx)) {
    throw new AppError({
      code: 'RESUME_UNSUPPORTED',
      message: 'Only valid PDF and DOCX resume files are supported.',
      statusCode: 415,
    });
  }
  return file;
};

export const resumeUploadMiddleware: RequestHandler = (request, response, next) => {
  upload.single('resume')(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      return next(
        new AppError({
          code: error.code === 'LIMIT_FILE_SIZE' ? 'RESUME_TOO_LARGE' : 'RESUME_UPLOAD_INVALID',
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'The resume exceeds the configured size limit.'
              : 'The resume upload is invalid.',
          statusCode: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        }),
      );
    }
    return error === undefined ? next() : next(error);
  });
};
