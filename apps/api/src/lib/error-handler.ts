import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Invalid request data",
      details: error.errors,
    } satisfies ApiError);
  }

  // JWT errors
  if (error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER") {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Missing authorization header",
    } satisfies ApiError);
  }

  if (error.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Token expired",
    } satisfies ApiError);
  }

  if (error.code === "FST_JWT_AUTHORIZATION_TOKEN_INVALID") {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid token",
    } satisfies ApiError);
  }

  // Custom app errors
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || "Error",
      message: error.message,
    } satisfies ApiError);
  }

  // Default 500
  return reply.status(500).send({
    statusCode: 500,
    error: "Internal Server Error",
    message: process.env['NODE_ENV'] === "production" 
      ? "An unexpected error occurred" 
      : error.message,
  } satisfies ApiError);
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request") {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflict") {
    super(message, 409);
    this.name = "ConflictError";
  }
}
