import { serve } from "bun";
import "./db/migrate";
import startSchedules from "./schedules/startSchedules";
import dashboardRoutes from "./routes/dashboard/index";
import { corsPreflight } from "./middleware/cors";
import notificationsRoutes from "./routes/notifications/index";
import customersRoutes from "./routes/customers/index";
import aiRoutes from "./routes/ai/index";

startSchedules();

// Combine all routes for Bun 1.2.2 compatibility
const allRoutes = {
  "/api/*": {
    OPTIONS: corsPreflight,
  },
  "/api/status": {
    GET: () => new Response("Hydra server is up", { status: 200 }),
  },
  ...dashboardRoutes,
  ...customersRoutes,
  ...notificationsRoutes,
  ...aiRoutes,
};

// Route matcher for Bun 1.2.2 (older fetch API)
function matchRoute(pathname: string, method: string) {
  // Try exact match first
  const exactMatch = allRoutes[pathname as keyof typeof allRoutes];
  if (exactMatch && typeof exactMatch === "object") {
    const handler = exactMatch[method as keyof typeof exactMatch];
    if (handler && typeof handler === "function") {
      return { handler, params: {} };
    }
  }

  // Try pattern matching
  for (const [pattern, methods] of Object.entries(allRoutes)) {
    if (typeof methods !== "object") continue;

    // Handle wildcard routes like "/api/*"
    if (pattern.includes("*")) {
      const regexPattern = pattern.replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(pathname)) {
        const handler = methods[method as keyof typeof methods];
        if (handler && typeof handler === "function") {
          return { handler, params: {} };
        }
      }
    }

    // Handle parameter routes like "/api/tasks/:id"
    if (pattern.includes(":")) {
      const regexPattern = pattern.replace(/:[^/]+/g, "([^/]+)");
      const regex = new RegExp(`^${regexPattern}$`);
      const match = pathname.match(regex);
      if (match) {
        const handler = methods[method as keyof typeof methods];
        if (handler && typeof handler === "function") {
          // Extract parameter names and values
          const paramNames = pattern.match(/:[^/]+/g)?.map((p) => p.slice(1)) || [];
          const params: Record<string, string> = {};
          paramNames.forEach((name, i) => {
            params[name] = match[i + 1];
          });
          return { handler, params };
        }
      }
    }
  }

  return null;
}

const server = serve({
  port: 3000,
  development: true,
  fetch(req) {
    const url = new URL(req.url);
    const match = matchRoute(url.pathname, req.method);

    if (match) {
      // Attach params to request for handlers that need them
      (req as any).params = match.params;
      return match.handler(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at ${server.url}`);