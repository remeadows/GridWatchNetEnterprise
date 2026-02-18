/**
 * GridWatch NetEnterprise - Gateway Auth Routes (Proxy to Auth Service)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { logger } from "../logger";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // Optional - can come from cookie
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authServiceUrl = config.AUTH_SERVICE_URL;

  // Login
  fastify.post(
    "/login",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Authenticate user and get tokens",
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  tokens: {
                    type: "object",
                    properties: {
                      accessToken: { type: "string" },
                      refreshToken: { type: "string" },
                      expiresIn: { type: "number" },
                    },
                  },
                  user: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      username: { type: "string" },
                      email: { type: "string" },
                      role: { type: "string" },
                      isActive: { type: "boolean" },
                      lastLogin: { type: "string" },
                      createdAt: { type: "string" },
                      updatedAt: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const response = await fetch(`${authServiceUrl}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": request.ip,
          "X-Request-Id": request.id,
        },
        body: JSON.stringify(body),
      });

      // Forward Set-Cookie headers from auth service (for HttpOnly refresh token)
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        reply.header("Set-Cookie", setCookie);
      }

      const data = await response.json();
      reply.status(response.status as 200).send(data);
    },
  );

  // Refresh token
  fastify.post(
    "/refresh",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Refresh access token (via cookie or body)",
        body: {
          type: "object",
          properties: {
            refreshToken: { type: "string" }, // Optional - can come from HttpOnly cookie
          },
        },
      },
    },
    async (request, reply) => {
      const body = refreshSchema.safeParse(request.body);
      const bodyData = body.success ? body.data : {};

      // Forward cookies from the client to auth service
      const cookieHeader = request.headers.cookie;

      const response = await fetch(`${authServiceUrl}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": request.id,
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
        body: JSON.stringify(bodyData),
      });

      // Forward Set-Cookie headers from auth service
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        reply.header("Set-Cookie", setCookie);
      }

      const data = await response.json();
      reply.status(response.status as 200).send(data);
    },
  );

  // Logout
  fastify.post(
    "/logout",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Logout and invalidate tokens",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      const cookieHeader = request.headers.cookie;

      const response = await fetch(`${authServiceUrl}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader && { Authorization: authHeader }),
          ...(cookieHeader && { Cookie: cookieHeader }),
          "X-Request-Id": request.id,
        },
        body: JSON.stringify(request.body || {}),
      });

      // Forward Set-Cookie headers (for clearing the refresh token cookie)
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        reply.header("Set-Cookie", setCookie);
      }

      // Handle case where auth service returns empty response
      const text = await response.text();
      if (!text) {
        return reply
          .status(response.status)
          .send({ success: true, message: "Logged out" });
      }

      try {
        const data = JSON.parse(text);
        reply.status(response.status as 200).send(data);
      } catch {
        reply
          .status(response.status)
          .send({ success: true, message: "Logged out" });
      }
    },
  );

  // Get current user
  fastify.get(
    "/me",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Get current authenticated user",
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireAuth],
    },
    async (request, reply) => {
      return {
        success: true,
        data: {
          user: request.user,
        },
      };
    },
  );

  // Verify token (internal use)
  fastify.get(
    "/verify",
    {
      schema: {
        tags: ["Authentication"],
        summary: "Verify access token",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization;

      const response = await fetch(`${authServiceUrl}/verify`, {
        method: "GET",
        headers: {
          ...(authHeader && { Authorization: authHeader }),
          "X-Request-Id": request.id,
        },
      });

      const data = await response.json();
      reply.status(response.status as 200).send(data);
    },
  );
};

export default authRoutes;
