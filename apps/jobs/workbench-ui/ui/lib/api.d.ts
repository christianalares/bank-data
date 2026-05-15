import type { ActivityStatsResponse, CreateFlowRequest, DelayedJobInfo, FlowNode, FlowSummary, JobInfo, JobStatus, MetricsResponse, OverviewStats, PaginatedResponse, QueueInfo, RunInfoList, SchedulerInfo, SearchResult } from "@/core/types";
export declare const api: {
    /**
     * Clear all server-side caches (for user-initiated refresh)
     */
    refresh(): Promise<{
        success: boolean;
    }>;
    /**
     * Get dashboard overview stats (longer timeout as it scans all queues)
     */
    getOverview(signal?: AbortSignal): Promise<OverviewStats>;
    /**
     * Get quick job counts for smart polling (lightweight, cached)
     */
    getCounts(signal?: AbortSignal): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        total: number;
        timestamp: number;
    }>;
    /**
     * Get just queue names (fast, no counts)
     */
    getQueueNames(signal?: AbortSignal): Promise<string[]>;
    /**
     * Get all queues with counts
     */
    getQueues(signal?: AbortSignal): Promise<QueueInfo[]>;
    /**
     * Get 24-hour metrics (longer timeout as it scans all queues)
     */
    getMetrics(signal?: AbortSignal): Promise<MetricsResponse>;
    /**
     * Get 7-day activity stats for the timeline (cached server-side)
     */
    getActivityStats(signal?: AbortSignal): Promise<ActivityStatsResponse>;
    /**
     * Get jobs for a queue
     */
    getJobs(queueName: string, options?: {
        status?: JobStatus;
        limit?: number;
        cursor?: string;
        sort?: string;
    }): Promise<PaginatedResponse<JobInfo>>;
    /**
     * Get a single job
     */
    getJob(queueName: string, jobId: string): Promise<JobInfo>;
    /**
     * Retry a job
     */
    retryJob(queueName: string, jobId: string): Promise<void>;
    /**
     * Remove a job
     */
    removeJob(queueName: string, jobId: string): Promise<void>;
    /**
     * Promote a delayed job
     */
    promoteJob(queueName: string, jobId: string): Promise<void>;
    /**
     * Search jobs
     */
    search(query: string, limit?: number): Promise<{
        results: SearchResult[];
    }>;
    /**
     * Clean jobs from a queue
     */
    cleanJobs(queueName: string, status: "completed" | "failed", grace?: number): Promise<{
        removed: number;
    }>;
    /**
     * Get dashboard config
     */
    getConfig(): Promise<{
        title: string;
        logo?: string;
        readonly: boolean;
        queues: string[];
        tags: string[];
    }>;
    /**
     * Get unique values for a tag field
     */
    getTagValues(field: string, limit?: number): Promise<{
        field: string;
        values: {
            value: string;
            count: number;
        }[];
    }>;
    /**
     * Get all runs (jobs across all queues, longer timeout)
     */
    getRuns(options?: {
        limit?: number;
        cursor?: string;
        sort?: string;
        status?: JobStatus;
        tags?: Record<string, string>;
        text?: string;
        timeRange?: {
            start: number;
            end: number;
        };
    }, signal?: AbortSignal): Promise<PaginatedResponse<RunInfoList>>;
    /**
     * Get schedulers (repeatable and delayed jobs)
     */
    getSchedulers(options?: {
        repeatableSort?: string;
        delayedSort?: string;
    }): Promise<{
        repeatable: SchedulerInfo[];
        delayed: DelayedJobInfo[];
    }>;
    /**
     * Get repeatable schedulers
     */
    getRepeatableSchedulers(sort?: string): Promise<SchedulerInfo[]>;
    /**
     * Get delayed schedulers
     */
    getDelayedSchedulers(sort?: string): Promise<DelayedJobInfo[]>;
    /**
     * Enqueue a test job
     */
    testJob(request: {
        queueName: string;
        name: string;
        data: unknown;
        delay?: number;
    }): Promise<{
        id: string;
    }>;
    /**
     * Clean queue jobs by status
     */
    cleanQueue(queueName: string, status: JobStatus, grace?: number): Promise<{
        removed: number;
    }>;
    /**
     * Retry multiple jobs
     */
    bulkRetry(jobs: {
        queueName: string;
        jobId: string;
    }[]): Promise<{
        success: number;
        failed: number;
    }>;
    /**
     * Delete multiple jobs
     */
    bulkDelete(jobs: {
        queueName: string;
        jobId: string;
    }[]): Promise<{
        success: number;
        failed: number;
    }>;
    /**
     * Promote multiple delayed jobs
     */
    bulkPromote(jobs: {
        queueName: string;
        jobId: string;
    }[]): Promise<{
        success: number;
        failed: number;
    }>;
    /**
     * Pause a queue
     */
    pauseQueue(queueName: string): Promise<{
        success: boolean;
        paused: boolean;
    }>;
    /**
     * Resume a queue
     */
    resumeQueue(queueName: string): Promise<{
        success: boolean;
        paused: boolean;
    }>;
    /**
     * Get all flows (longer timeout as it scans all queues)
     */
    getFlows(limit?: number, signal?: AbortSignal): Promise<{
        flows: FlowSummary[];
    }>;
    /**
     * Get a single flow tree
     */
    getFlow(queueName: string, jobId: string): Promise<FlowNode>;
    /**
     * Create a new flow
     */
    createFlow(request: CreateFlowRequest): Promise<{
        id: string;
    }>;
};
//# sourceMappingURL=api.d.ts.map