const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'APPLICATION_ERROR';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  }

  if (err.code === '23505') {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'A record with this value already exists';
  }

  if (err.code === '23503') {
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced record does not exist';
  }

  if (err.code === '23502') {
    statusCode = 400;
    code = 'NOT_NULL_VIOLATION';
    message = 'Required field is missing';
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  const errorResponse = {
    success: false,
    error: {
      code,
      message: isDevelopment ? message : (err.isOperational ? message : 'Something went wrong'),
    },
  };

  // 1.14 — DB error details only in development
  if (isDevelopment && (err.code === '23505' || err.code === '23503' || err.code === '23502')) {
    errorResponse.error.detail = err.detail;
    errorResponse.error.table = err.table;
    errorResponse.error.constraint = err.constraint;
  }

  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details;
  }

  if (statusCode >= 500) {
    const { password, password_hash, refreshToken, token, ...safeBody } = req.body || {};
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      body: safeBody,
      ip: req.ip,
    });
  } else {
    logger.warn('Client error', {
      error: err.message,
      statusCode,
      code,
      method: req.method,
      url: req.originalUrl,
    });
  }

  res.status(statusCode).json(errorResponse);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
