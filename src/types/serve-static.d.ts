import { RequestHandler, RequestHandlerParams } from 'express-serve-static-core';

declare namespace serveStatic {
  interface ServeStaticOptions {
    fallthrough?: boolean;
    maxAge?: number | string;
    redirect?: boolean;
    setHeaders?: (
      res: any,
      path: string,
      stat: { isDirectory(): boolean }
    ) => void;
  }

  interface ServeStatic {
    (root: string, options?: ServeStaticOptions): RequestHandler;
    serveStatic: RequestHandler;
  }
}

declare const serveStatic: serveStatic.ServeStatic;

export = serveStatic;