import type { JobStatus } from "@/core/types";
import { api } from "./api";
/** Type for dashboard config returned by the API */
export type WorkbenchConfig = Awaited<ReturnType<typeof api.getConfig>>;
export declare const queryKeys: {
    config: readonly ["config"];
    overview: readonly ["overview"];
    queueNames: readonly ["queue-names"];
    queues: readonly ["queues"];
    queue: (name: string) => readonly ["queue", string];
    jobs: (queueName: string, status?: JobStatus, sort?: string) => readonly ["jobs", string, JobStatus | undefined, string | undefined];
    jobsAll: (queueName: string) => readonly ["jobs", string];
    job: (queueName: string, jobId: string) => readonly ["job", string, string];
    runs: (sort?: string, filters?: {
        status?: JobStatus;
        tags?: Record<string, string>;
        text?: string;
        timeRange?: {
            start: number;
            end: number;
        };
    }) => readonly ["runs", string | undefined, {
        status?: JobStatus;
        tags?: Record<string, string>;
        text?: string;
        timeRange?: {
            start: number;
            end: number;
        };
    } | undefined];
    runsAll: readonly ["runs"];
    schedulers: {
        repeatable: (sort?: string) => readonly ["schedulers", "repeatable", string | undefined];
        delayed: (sort?: string) => readonly ["schedulers", "delayed", string | undefined];
        all: readonly ["schedulers"];
    };
    search: (query: string) => readonly ["search", string];
    tagValues: (field: string) => readonly ["tagValues", string];
    metrics: readonly ["metrics"];
    activity: readonly ["activity"];
    flows: readonly ["flows"];
    flow: (queueName: string, jobId: string) => readonly ["flow", string, string];
};
/**
 * Hook for fetching dashboard config
 */
export declare function useConfig(): import("@tanstack/react-query").UseQueryResult<{
    title: string;
    logo?: string;
    readonly: boolean;
    queues: string[];
    tags: string[];
}, Error>;
/**
 * Hook for fetching overview stats
 */
export declare function useOverview(): import("@tanstack/react-query").UseQueryResult<import("@/core/types").OverviewStats, Error>;
/**
 * Hook for fetching quick job counts (lightweight, for smart polling)
 */
export declare function useCounts(): import("@tanstack/react-query").UseQueryResult<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
    timestamp: number;
}, Error>;
/**
 * Hook for fetching just queue names (fast, no counts)
 * Used for sidebar initial render
 */
export declare function useQueueNames(): import("@tanstack/react-query").UseQueryResult<string[], Error>;
/**
 * Hook for fetching full queue info with counts
 */
export declare function useQueues(): import("@tanstack/react-query").UseQueryResult<import("@/core/types").QueueInfo[], Error>;
/**
 * Hook to get a single queue's info from the cached queues data
 * Returns undefined if not yet loaded
 */
export declare function useQueueInfo(queueName: string): import("@/core/types").QueueInfo | undefined;
/**
 * Hook for fetching 24-hour metrics
 */
export declare function useMetrics(): import("@tanstack/react-query").UseQueryResult<import("@/core/types").MetricsResponse, Error>;
/**
 * Hook for fetching 7-day activity stats for timeline
 */
export declare function useActivityStats(): import("@tanstack/react-query").UseQueryResult<import("@/core/types").ActivityStatsResponse, Error>;
/**
 * Hook for fetching jobs with pagination and sorting
 */
export declare function useJobs(queueName: string, status?: JobStatus, sort?: string): import("@tanstack/react-query").UseInfiniteQueryResult<import("@tanstack/query-core").InfiniteData<import("@/core/types").PaginatedResponse<import("@/core/types").JobInfo>, unknown>, Error>;
/**
 * Hook for fetching a single job
 */
export declare function useJob(queueName: string, jobId: string): import("@tanstack/react-query").UseQueryResult<import("@/core/types").JobInfo, Error>;
/**
 * Hook for fetching all runs with sorting and filtering
 * Optimized for fast initial load with reasonable polling
 */
export declare function useRuns(sort?: string, filters?: {
    status?: JobStatus;
    tags?: Record<string, string>;
    text?: string;
    timeRange?: {
        start: number;
        end: number;
    };
}): import("@tanstack/react-query").UseInfiniteQueryResult<import("@tanstack/query-core").InfiniteData<import("@/core/types").PaginatedResponse<import("@/core/types").RunInfoList>, unknown>, Error>;
/**
 * Hook for fetching repeatable schedulers with sorting
 */
export declare function useRepeatableSchedulers(sort?: string): import("@tanstack/react-query").UseQueryResult<import("@/core/types").SchedulerInfo[], Error>;
/**
 * Hook for fetching delayed schedulers with sorting
 */
export declare function useDelayedSchedulers(sort?: string): import("@tanstack/react-query").UseQueryResult<import("@/core/types").DelayedJobInfo[], Error>;
/**
 * Hook for search
 */
export declare function useSearch(query: string): import("@tanstack/react-query").UseQueryResult<{
    results: import("@/core/types").SearchResult[];
}, Error>;
/**
 * Hook for fetching unique values for a tag field
 */
export declare function useTagValues(field: string, enabled?: boolean): import("@tanstack/react-query").UseQueryResult<{
    field: string;
    values: {
        value: string;
        count: number;
    }[];
}, Error>;
/**
 * Hook for clearing server-side cache and refetching all data
 */
export declare function useRefresh(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
}, Error, void, unknown>;
/**
 * Hook for retrying a job
 */
export declare function useRetryJob(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    queueName: string;
    jobId: string;
}, unknown>;
/**
 * Hook for removing a job
 */
export declare function useRemoveJob(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    queueName: string;
    jobId: string;
}, unknown>;
/**
 * Hook for promoting a delayed job
 */
export declare function usePromoteJob(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    queueName: string;
    jobId: string;
}, unknown>;
/**
 * Hook for testing a job
 */
export declare function useTestJob(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
}, Error, {
    queueName: string;
    name: string;
    data: unknown;
    delay?: number;
}, unknown>;
/**
 * Hook for cleaning queue jobs
 */
export declare function useCleanQueue(): import("@tanstack/react-query").UseMutationResult<{
    removed: number;
}, Error, {
    queueName: string;
    status: JobStatus;
}, unknown>;
type BulkJobParams = {
    jobs: {
        queueName: string;
        jobId: string;
    }[];
};
type BulkResult = {
    success: number;
    failed: number;
};
/**
 * Hook for bulk retrying jobs
 */
export declare function useBulkRetry(): import("@tanstack/react-query").UseMutationResult<BulkResult, Error, BulkJobParams, unknown>;
/**
 * Hook for bulk deleting jobs
 */
export declare function useBulkDelete(): import("@tanstack/react-query").UseMutationResult<BulkResult, Error, BulkJobParams, unknown>;
/**
 * Hook for bulk promoting delayed jobs
 */
export declare function useBulkPromote(): import("@tanstack/react-query").UseMutationResult<BulkResult, Error, BulkJobParams, unknown>;
/**
 * Hook for pausing a queue
 */
export declare function usePauseQueue(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
    paused: boolean;
}, Error, string, unknown>;
/**
 * Hook for resuming a queue
 */
export declare function useResumeQueue(): import("@tanstack/react-query").UseMutationResult<{
    success: boolean;
    paused: boolean;
}, Error, string, unknown>;
/**
 * Hook for fetching all flows
 */
export declare function useFlows(): import("@tanstack/react-query").UseQueryResult<{
    flows: import("@/core/types").FlowSummary[];
}, Error>;
/**
 * Hook for fetching a single flow tree
 */
export declare function useFlow(queueName: string, jobId: string): import("@tanstack/react-query").UseQueryResult<import("@/core/types").FlowNode, Error>;
/**
 * Hook for creating a flow
 */
export declare function useCreateFlow(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
}, Error, import("@/core/types").CreateFlowRequest, unknown>;
export {};
//# sourceMappingURL=hooks.d.ts.map