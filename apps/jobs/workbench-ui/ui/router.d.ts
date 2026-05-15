import { z } from "zod";
interface SearchContextValue {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    setCommandOpen: (open: boolean) => void;
}
export declare function useSearchContext(): SearchContextValue;
export declare const runsSearchSchema: z.ZodObject<{
    status: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        waiting: "waiting";
        active: "active";
        completed: "completed";
        failed: "failed";
        delayed: "delayed";
        all: "all";
    }>>>;
    q: z.ZodCatch<z.ZodOptional<z.ZodString>>;
    from: z.ZodOptional<z.ZodNumber>;
    to: z.ZodOptional<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RunsSearch = z.infer<typeof runsSearchSchema>;
export declare const queueSearchSchema: z.ZodObject<{
    status: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        waiting: "waiting";
        active: "active";
        completed: "completed";
        failed: "failed";
        delayed: "delayed";
        all: "all";
    }>>>;
    sort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type QueueSearch = z.infer<typeof queueSearchSchema>;
export declare const schedulersSearchSchema: z.ZodObject<{
    tab: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        delayed: "delayed";
        repeatable: "repeatable";
    }>>>;
    repeatableSort: z.ZodOptional<z.ZodString>;
    delayedSort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SchedulersSearch = z.infer<typeof schedulersSearchSchema>;
export declare const jobSearchSchema: z.ZodObject<{
    tab: z.ZodOptional<z.ZodEnum<{
        error: "error";
        output: "output";
        payload: "payload";
        retries: "retries";
        timeline: "timeline";
    }>>;
}, z.core.$strip>;
export type JobSearch = z.infer<typeof jobSearchSchema>;
export declare const testSearchSchema: z.ZodObject<{
    queue: z.ZodOptional<z.ZodString>;
    jobName: z.ZodOptional<z.ZodString>;
    payload: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TestSearch = z.infer<typeof testSearchSchema>;
export declare function parseSort(sort?: string): {
    field: string;
    direction: "asc" | "desc";
} | undefined;
export declare function createSort(field: string, direction: "asc" | "desc"): string;
export declare function createAppRouter(basePath: string): import("@tanstack/router-core").RouterCore<import("@tanstack/router-core").Route<import("@tanstack/react-router").Register, any, "/", "/", string, "__root__", undefined, {}, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, readonly [import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/", "/", string, "/", z.ZodObject<{
    status: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        waiting: "waiting";
        active: "active";
        completed: "completed";
        failed: "failed";
        delayed: "delayed";
        all: "all";
    }>>>;
    q: z.ZodCatch<z.ZodOptional<z.ZodString>>;
    from: z.ZodOptional<z.ZodNumber>;
    to: z.ZodOptional<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, import("@tanstack/router-core").ResolveParams<"/">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/metrics", "/metrics", string, "/metrics", undefined, import("@tanstack/router-core").ResolveParams<"/metrics">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/schedulers", "/schedulers", string, "/schedulers", z.ZodObject<{
    tab: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        delayed: "delayed";
        repeatable: "repeatable";
    }>>>;
    repeatableSort: z.ZodOptional<z.ZodString>;
    delayedSort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, import("@tanstack/router-core").ResolveParams<"/schedulers">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/flows", "/flows", string, "/flows", undefined, import("@tanstack/router-core").ResolveParams<"/flows">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/flows/$queueName/$jobId", "/flows/$queueName/$jobId", string, "/flows/$queueName/$jobId", undefined, import("@tanstack/router-core").ResolveParams<"/flows/$queueName/$jobId">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/test", "/test", string, "/test", z.ZodObject<{
    queue: z.ZodOptional<z.ZodString>;
    jobName: z.ZodOptional<z.ZodString>;
    payload: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, import("@tanstack/router-core").ResolveParams<"/test">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/queues/$queueName", "/queues/$queueName", string, "/queues/$queueName", z.ZodObject<{
    status: z.ZodCatch<z.ZodOptional<z.ZodEnum<{
        waiting: "waiting";
        active: "active";
        completed: "completed";
        failed: "failed";
        delayed: "delayed";
        all: "all";
    }>>>;
    sort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, import("@tanstack/router-core").ResolveParams<"/queues/$queueName">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, import("@tanstack/react-router").Route<unknown, import("@tanstack/react-router").RootRoute<import("@tanstack/react-router").Register, undefined, {}, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>, "/queues/$queueName/jobs/$jobId", "/queues/$queueName/jobs/$jobId", string, "/queues/$queueName/jobs/$jobId", z.ZodObject<{
    tab: z.ZodOptional<z.ZodEnum<{
        error: "error";
        output: "output";
        payload: "payload";
        retries: "retries";
        timeline: "timeline";
    }>>;
}, z.core.$strip>, import("@tanstack/router-core").ResolveParams<"/queues/$queueName/jobs/$jobId">, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, import("@tanstack/router-core").AnyContext, {}, undefined, unknown, unknown, unknown, unknown, undefined>], unknown, unknown, unknown, undefined>, "never", false, import("@tanstack/history").RouterHistory, Record<string, any>>;
declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof createAppRouter>;
    }
}
export {};
//# sourceMappingURL=router.d.ts.map