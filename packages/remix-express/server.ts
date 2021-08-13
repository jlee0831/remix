import { PassThrough } from "stream";
import { URL } from "url";
import type * as express from "express";
import type {
  AppLoadContext,
  RequestInit,
  Response,
  ServerBuild
} from "@remix-run/node";
import {
  Headers,
  Request,
  createRequestHandler as createRemixRequestHandler
} from "@remix-run/node";

/**
 * A function that returns the value to use as `context` in route `loader` and
 * `action` functions.
 *
 * You can think of this as an escape hatch that allows you to pass
 * environment/platform-specific values through to your loader/action, such as
 * values that are generated by Express middleware like `req.session`.
 */
export interface GetLoadContextFunction {
  (req: express.Request, res: express.Response): AppLoadContext;
}

export type RequestHandler = ReturnType<typeof createRequestHandler>;

/**
 * Returns a request handler for Express that serves the response using Remix.
 */
export function createRequestHandler({
  build,
  getLoadContext,
  mode = process.env.NODE_ENV
}: {
  build: ServerBuild;
  getLoadContext?: GetLoadContextFunction;
  mode?: string;
}) {
  let handleRequest = createRemixRequestHandler(build, mode);

  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      let request = createRemixRequest(req);
      let loadContext =
        typeof getLoadContext === "function"
          ? getLoadContext(req, res)
          : undefined;

      let response = await handleRequest(request, loadContext);

      sendRemixResponse(res, response);
    } catch (error) {
      // Express doesn't support async functions, so we have to pass along the
      // error manually using next().
      next(error);
    }
  };
}

export function createRemixHeaders(
  requestHeaders: express.Request["headers"]
): Headers {
  let headers = new Headers();

  for (let [key, values] of Object.entries(requestHeaders)) {
    if (values) {
      if (Array.isArray(values)) {
        for (const value of values) {
          headers.append(key, value);
        }
      } else {
        headers.set(key, values);
      }
    }
  }

  return headers;
}

export function createRemixRequest(req: express.Request): Request {
  let origin = `${req.protocol}://${req.get("host")}`;
  let url = new URL(req.url, origin);

  let init: RequestInit = {
    method: req.method,
    headers: createRemixHeaders(req.headers)
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.pipe(new PassThrough({ highWaterMark: 16384 }));
  }

  return new Request(url.toString(), init);
}

function sendRemixResponse(res: express.Response, response: Response): void {
  res.status(response.status);

  for (let [key, values] of Object.entries(response.headers.raw())) {
    for (const value of values) {
      res.append(key, value);
    }
  }

  if (Buffer.isBuffer(response.body)) {
    res.end(response.body);
  } else {
    response.body.pipe(res);
  }
}
