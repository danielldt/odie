export class PolymarketApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "PolymarketApiError";
  }
}

export class ClobApiError extends PolymarketApiError {
  constructor(
    message: string,
    statusCode: number,
    response?: unknown
  ) {
    super(message, statusCode, response);
    this.name = "ClobApiError";
  }
}

export class DataApiError extends PolymarketApiError {
  constructor(
    message: string,
    statusCode: number,
    response?: unknown
  ) {
    super(message, statusCode, response);
    this.name = "DataApiError";
  }
}

export class GammaApiError extends PolymarketApiError {
  constructor(
    message: string,
    statusCode: number,
    response?: unknown
  ) {
    super(message, statusCode, response);
    this.name = "GammaApiError";
  }
}

export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message);
    this.name = "WebSocketError";
  }
}

export function isClobApiError(error: unknown): error is ClobApiError {
  return error instanceof ClobApiError;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof PolymarketApiError) {
    // Retry on 5xx errors and rate limits
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  return false;
}
