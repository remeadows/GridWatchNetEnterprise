/**
 * NetNynja Enterprise - Gateway Error Handler Plugin
 */

import type { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { AuthError } from "@netnynja/shared-auth";
import { ZodError } from "zod";
import { logger } from "../logger";

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    };

    let statusCode = 500;

    // Handle authentication errors
    if (error instanceof AuthError) {
      statusCode = error.statusCode;
      response.error.code = error.code;
      response.error.message = error.message;
    }
    // Handle Zod validation errors
    else if (error instanceof ZodError) {
      statusCode = 400;
      response.error.code = "VALIDATION_ERROR";
      response.error.message = "Request validation failed";
      response.error.details = error.flatten();
    }
    // Handle Fastify validation errors
    else if (error.validation) {
      statusCode = 400;
      response.error.code = "VALIDATION_ERROR";
      response.error.message = "Request validation failed";
      response.error.details = error.validation;
    }
    // Handle rate limit errors (can come as statusCode 429 or custom error object)
    else if (
      error.statusCode === 429 ||
      (error as unknown as { error?: { code?: string } })?.error?.code ===
        "RATE_LIMITED"
    ) {
      statusCode = 429;
      response.error.code = "RATE_LIMITED";
      response.error.message = "Too many requests. Please try again later.";
      // Get retryAfter from error if available
      const retryAfter = (
        error as unknown as { error?: { retryAfter?: number } }
      )?.error?.retryAfter;
      if (retryAfter) {
        response.error.details = { retryAfter };
      }
    }
    // Handle not found
    else if (error.statusCode === 404) {
      statusCode = 404;
      response.error.code = "NOT_FOUND";
      response.error.message = error.message || "Resource not found";
    }
    // Handle other known status codes
    else if (error.statusCode && error.statusCode < 500) {
      statusCode = error.statusCode;
      response.error.code = "REQUEST_ERROR";
      response.error.message = error.message;
    }
    // Log unexpected errors
    else {
      logger.error(
        {
          err: error,
          request: {
            method: request.method,
            url: request.url,
            params: request.params,
            query: request.query,
          },
        },
        "Unhandled error",
      );

      // Don't expose internal error details in production
      if (process.env.NODE_ENV === "development") {
        response.error.message = error.message;
        response.error.details = error.stack;
      }
    }

    reply.status(statusCode).send(response);
  });

  // Handle 404 for undefined routes
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
  fastify: "4.x",
});
