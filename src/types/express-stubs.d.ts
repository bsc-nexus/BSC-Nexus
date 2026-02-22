declare module 'express-serve-static-core' {
  export interface Request {
    body?: any;
    headers: Record<string, any>;
    query: Record<string, any>;
    params: Record<string, any>;
    context?: any;
    path: string;
    ip?: string;
    method: string;
    route?: { path?: string };
  }

  export interface Response {
    statusCode: number;
    status(code: number): this;
    json(body: any): this;
    send(body?: any): this;
    end(body?: any): this;
    on(event: string, listener: (...args: any[]) => void): void;
    set(field: string, value: string): this;
    setHeader(key: string, value: string): any;
    headersSent?: boolean;
  }

  export type NextFunction = (err?: any) => void;
  export type RequestHandler = (...args: any[]) => any;
  export type RequestHandlerParams = RequestHandler | RequestHandler[];
}

declare module 'express' {
  import { Request, Response, NextFunction, RequestHandler } from 'express-serve-static-core';
  export interface Router {
    (req: Request, res: Response, next: NextFunction): any;
    use: ((...handlers: RequestHandler[]) => Router) & ((path: string, ...handlers: RequestHandler[]) => Router);
    get: ((...handlers: RequestHandler[]) => Router) & ((path: string, ...handlers: RequestHandler[]) => Router);
    post: ((...handlers: RequestHandler[]) => Router) & ((path: string, ...handlers: RequestHandler[]) => Router);
    put: ((...handlers: RequestHandler[]) => Router) & ((path: string, ...handlers: RequestHandler[]) => Router);
    delete: ((...handlers: RequestHandler[]) => Router) & ((path: string, ...handlers: RequestHandler[]) => Router);
    router: Router;
  }
  export interface Express {
    (): Express;
    Router(): Router;
    use: ((...handlers: RequestHandler[]) => Express) & ((path: string, ...handlers: RequestHandler[]) => Express);
    get: ((...handlers: RequestHandler[]) => Express) & ((path: string, ...handlers: RequestHandler[]) => Express);
    post: ((...handlers: RequestHandler[]) => Express) & ((path: string, ...handlers: RequestHandler[]) => Express);
    put: ((...handlers: RequestHandler[]) => Express) & ((path: string, ...handlers: RequestHandler[]) => Express);
    delete: ((...handlers: RequestHandler[]) => Express) & ((path: string, ...handlers: RequestHandler[]) => Express);
    listen: (...args: any[]) => any;
    json: (...args: any[]) => RequestHandler;
    urlencoded: (...args: any[]) => RequestHandler;
  }
  export type Application = Express;
  const e: Express & {
    json: (...args: any[]) => RequestHandler;
    urlencoded: (...args: any[]) => RequestHandler;
    Router(): Router;
  };
  export default e;
  export function Router(): Router;
  export { Request, Response, NextFunction, Router, RequestHandler, Application };
}

declare module 'body-parser' {
  import { RequestHandler } from 'express-serve-static-core';
  const json: (opts?: any) => RequestHandler;
  const urlencoded: (opts?: any) => RequestHandler;
  export { json, urlencoded };
  const bp: { json: typeof json; urlencoded: typeof urlencoded };
  export default bp;
}

declare module 'connect' {
  const connect: any;
  export default connect;
}

declare module 'http-errors' {
  const createError: any;
  export default createError;
}

declare module 'mime' {
  const mime: any;
  export default mime;
}

declare module 'qs' {
  const qs: any;
  export default qs;
}

declare module 'range-parser' {
  const rangeParser: any;
  export default rangeParser;
}

declare module 'send' {
  const send: any;
  export default send;
}

declare module 'ws' {
  export default class WebSocket {
    constructor(address: string, protocols?: any);
    on(event: string, listener: (...args: any[]) => void): void;
    send(data: any): void;
    close(): void;
  }
}

declare module 'helmet' {
  import { RequestHandler } from 'express-serve-static-core';
  const helmet: (options?: any) => RequestHandler;
  export default helmet;
}

declare module 'express-rate-limit' {
  import { RequestHandler } from 'express-serve-static-core';
  interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    keyGenerator?: (req: any) => string;
    [key: string]: any;
  }
  const rateLimit: (options?: RateLimitOptions) => RequestHandler;
  export default rateLimit;
}

declare module 'winston' {
  export const format: {
    combine: (...args: any[]) => any;
    timestamp: (...args: any[]) => any;
    printf: (callback: (info: any) => string) => any;
    colorize: (...args: any[]) => any;
    errors: (...args: any[]) => any;
    splat: (...args: any[]) => any;
    json: (...args: any[]) => any;
  };
  export const transports: { Console: any };
  export function createLogger(options: any): any;
  const winston: {
    format: typeof format;
    transports: typeof transports;
    createLogger: typeof createLogger;
  };
  export default winston;
}

declare module 'prom-client' {
  export class Counter {
    constructor(config: any);
    inc(labels?: any, value?: number): void;
  }
  export class Histogram {
    constructor(config: any);
    observe(labels: any, value: number): void;
  }
  export class Gauge {
    constructor(config: any);
    set(labels: any, value: number): void;
    inc(labels?: any, value?: number): void;
    dec(labels?: any, value?: number): void;
  }
  export class Registry {
    constructor();
    registerMetric(metric: any): void;
    metrics(): Promise<string>;
    resetMetrics(): void;
  }
}

declare module 'axios' {
  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
  }
  export interface AxiosError extends Error {
    code?: string;
    response?: { status?: number };
  }
  export interface AxiosInstance {
    post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>;
  }
  const axios: AxiosInstance & { create?: (config?: any) => AxiosInstance };
  export default axios;
}

declare module 'ethers' {
  export namespace ethers {
    class Transaction {
      static from(raw: string): Transaction;
      unsignedSerialized?: string;
    }
    class JsonRpcProvider {
      constructor(url: string);
      sendTransaction?(tx: any): Promise<{ hash: string }>;
    }
    class Contract {
      constructor(address: string, abi: any, provider: any);
      functions?: Record<string, (...args: any[]) => Promise<any>>;
    }
    function parseUnits(value: string, decimals?: number): bigint;
    function formatUnits(value: any, decimals?: number): string;
    function keccak256(data: any): string;
    function encodeBytes32String(value: string): string;
  }
  export import Transaction = ethers.Transaction;
  export import JsonRpcProvider = ethers.JsonRpcProvider;
  export import Contract = ethers.Contract;
  export const parseUnits: typeof ethers.parseUnits;
  export const formatUnits: typeof ethers.formatUnits;
  export const keccak256: typeof ethers.keccak256;
  export const encodeBytes32String: typeof ethers.encodeBytes32String;
  export { ethers };
}

declare module '@prisma/client' {
  export class PrismaClient {
    constructor(options?: any);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    [key: string]: any;
  }
}

declare module 'web3' {
  export default class Web3 {
    constructor(provider?: any);
    eth: any;
    utils: any;
  }
}

declare module '../../../mevProtectionService.js' {
  export const mevProtectionService: {
    protectTransaction: (tx: any, config: any) => Promise<{ txHash: string; protection: any }>;
  };
}

declare module '../../../ultraFastSwapService.js' {
  export const ultraFastSwapService: {
    getSwapQuote: (payload: any) => Promise<any>;
    executeSwap: (payload: any) => Promise<any>;
  };
}