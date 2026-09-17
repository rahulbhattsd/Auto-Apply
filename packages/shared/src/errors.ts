export class ApplicationError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = 'Forbidden: Access denied') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message = 'Resource conflict') {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class AgentExecutionError extends ApplicationError {
  constructor(message = 'Agent failed to execute request', details?: unknown) {
    super('AGENT_EXECUTION_ERROR', message, details);
    this.name = 'AgentExecutionError';
  }
}
