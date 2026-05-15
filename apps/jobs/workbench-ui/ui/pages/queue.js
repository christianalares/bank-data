import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Pause, Play, RefreshCw } from "lucide-react";
import * as React from "react";
import { BulkBottomBar, } from "@/components/shared/bulk-bottom-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { SortableHeader, useSort } from "@/components/shared/sortable-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBulkDelete, useBulkPromote, useBulkRetry, useJobs, usePauseQueue, useQueues, useRefresh, useResumeQueue, } from "@/lib/hooks";
import { truncate } from "@/lib/utils";
const statusTabs = [
    { value: "all", label: "All" },
    { value: "waiting", label: "Waiting" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "delayed", label: "Delayed" },
];
export function QueuePage({ queueName, search, onSearchChange, onJobSelect, }) {
    const _queryClient = useQueryClient();
    // Selection state for bulk actions
    const [selection, setSelection] = React.useState(new Map());
    // Get queue info for pause state
    const { data: queues = [] } = useQueues();
    const queueInfo = queues.find((q) => q.name === queueName);
    const isPaused = queueInfo?.isPaused ?? false;
    // Pause/Resume mutations
    const pauseQueue = usePauseQueue();
    const resumeQueue = useResumeQueue();
    const isPauseLoading = pauseQueue.isPending || resumeQueue.isPending;
    const handleTogglePause = () => {
        if (isPaused) {
            resumeQueue.mutate(queueName);
        }
        else {
            pauseQueue.mutate(queueName);
        }
    };
    // Bulk action mutations
    const bulkRetry = useBulkRetry();
    const bulkDelete = useBulkDelete();
    const bulkPromote = useBulkPromote();
    // Parse status and sort from URL
    const statusFilter = search.status === "all" ? undefined : search.status;
    // Sort hook
    const { currentSort, handleSort } = useSort(search.sort, (sort) => onSearchChange({ ...search, sort }));
    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching, } = useJobs(queueName, statusFilter, search.sort);
    // Flatten all pages into a single array
    const jobs = React.useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    const _total = data?.pages[0]?.total ?? 0;
    // Server-side cache refresh
    const refreshMutation = useRefresh();
    const _refresh = () => {
        refreshMutation.mutate();
    };
    const handleStatusChange = (status) => {
        onSearchChange({
            ...search,
            status: status,
        });
    };
    const _loading = isLoading || isRefetching || refreshMutation.isPending;
    // Selection helpers
    const isSelected = (jobId) => selection.has(jobId);
    const toggleSelection = (job) => {
        setSelection((prev) => {
            const next = new Map(prev);
            if (next.has(job.id)) {
                next.delete(job.id);
            }
            else {
                next.set(job.id, { queueName, jobId: job.id, status: job.status });
            }
            return next;
        });
    };
    const selectAll = () => {
        const newSelection = new Map();
        for (const job of jobs) {
            newSelection.set(job.id, {
                queueName,
                jobId: job.id,
                status: job.status,
            });
        }
        setSelection(newSelection);
    };
    const clearSelection = () => setSelection(new Map());
    const isAllSelected = jobs.length > 0 && selection.size === jobs.length;
    const isPartiallySelected = selection.size > 0 && selection.size < jobs.length;
    // Bulk action handlers - only act on relevant job statuses
    const handleBulkRetry = async () => {
        const failedJobs = Array.from(selection.values()).filter((s) => s.status === "failed");
        if (failedJobs.length > 0) {
            await bulkRetry.mutateAsync({ jobs: failedJobs });
        }
        clearSelection();
    };
    const handleBulkDelete = async () => {
        const jobsList = Array.from(selection.values());
        await bulkDelete.mutateAsync({ jobs: jobsList });
        clearSelection();
    };
    const handleBulkPromote = async () => {
        const delayedJobs = Array.from(selection.values()).filter((s) => s.status === "delayed");
        if (delayedJobs.length > 0) {
            await bulkPromote.mutateAsync({ jobs: delayedJobs });
        }
        clearSelection();
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Tabs, { value: search.status || "all", onValueChange: handleStatusChange, children: _jsx(TabsList, { children: statusTabs.map((tab) => (_jsx(TabsTrigger, { value: tab.value, children: tab.label }, tab.value))) }) }), isPaused && (_jsx(Badge, { variant: "secondary", className: "bg-amber-500/10 text-amber-600", children: "Paused" }))] }), _jsx("div", { className: "flex items-center gap-2", children: _jsx(Button, { variant: isPaused ? "default" : "outline", size: "sm", onClick: handleTogglePause, disabled: isPauseLoading, children: isPaused ? (_jsxs(_Fragment, { children: [_jsx(Play, { className: "mr-2 h-4 w-4" }), "Resume"] })) : (_jsxs(_Fragment, { children: [_jsx(Pause, { className: "mr-2 h-4 w-4" }), "Pause"] })) }) })] }), isLoading && jobs.length === 0 ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 border-b border-dashed py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground", children: [_jsx("div", { className: "col-span-5", children: "Job" }), _jsx("div", { className: "col-span-2", children: "Status" }), _jsx("div", { className: "col-span-2", children: "Queued" }), _jsx("div", { className: "col-span-2", children: "Started" }), _jsx("div", { className: "col-span-1" })] }), _jsx("div", { className: "divide-y divide-border/50", children: [...Array(15)].map((_, i) => (_jsxs("div", { className: "grid grid-cols-12 items-center gap-4 py-3", children: [_jsxs("div", { className: "col-span-5 flex items-center gap-3", children: [_jsx("div", { className: "h-4 w-4 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-4 animate-pulse rounded bg-muted" }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "h-4 w-28 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-3 w-20 animate-pulse rounded bg-muted" })] })] }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-5 w-20 animate-pulse bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-24 animate-pulse rounded bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-24 animate-pulse rounded bg-muted" }) }), _jsx("div", { className: "col-span-1 flex justify-end", children: _jsx("div", { className: "h-4 w-4 animate-pulse rounded bg-muted" }) })] }, i.toString()))) })] })) : error ? (_jsx(EmptyState, { icon: FileText, title: "Failed to load jobs", description: error.message })) : jobs.length === 0 ? (_jsx(EmptyState, { icon: FileText, title: "No jobs found", description: statusFilter
                    ? `No ${statusFilter} jobs in this queue`
                    : "This queue is empty" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-12 gap-4 border-b border-dashed py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground", children: [_jsxs("div", { className: "col-span-5 flex items-center gap-3", children: [_jsx(Checkbox, { checked: isAllSelected, indeterminate: isPartiallySelected, onCheckedChange: (checked) => {
                                            if (checked) {
                                                selectAll();
                                            }
                                            else {
                                                clearSelection();
                                            }
                                        } }), _jsx(SortableHeader, { field: "name", label: "Job", currentSort: currentSort, onSort: handleSort })] }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "status", label: "Status", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "timestamp", label: "Queued", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "processedOn", label: "Started", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-1" })] }), _jsx("div", { className: "divide-y divide-border/50", children: jobs.map((job) => (_jsx(JobRow, { job: job, selected: isSelected(job.id), onSelect: () => toggleSelection(job), onClick: () => onJobSelect(job.id) }, job.id))) }), hasNextPage && (_jsx("div", { className: "flex justify-center pt-4", children: _jsx(Button, { variant: "outline", onClick: () => fetchNextPage(), disabled: isFetchingNextPage, children: isFetchingNextPage ? (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-2 h-4 w-4 animate-spin" }), "Loading..."] })) : ("Load more") }) })), _jsx("div", { className: "flex items-center justify-between pt-2 text-sm text-muted-foreground", children: _jsxs("span", { children: ["Showing ", jobs.length, " jobs"] }) })] })), _jsx(BulkBottomBar, { selection: Array.from(selection.values()), onClear: clearSelection, onRetry: handleBulkRetry, onDelete: handleBulkDelete, onPromote: handleBulkPromote, isRetrying: bulkRetry.isPending, isDeleting: bulkDelete.isPending, isPromoting: bulkPromote.isPending })] }));
}
function JobRow({ job, selected, onSelect, onClick }) {
    const handleCheckboxClick = (e) => {
        e.stopPropagation();
        onSelect();
    };
    return (_jsxs("button", { type: "button", onClick: onClick, className: "group grid w-full grid-cols-12 items-center gap-4 py-3 text-left text-sm cursor-default", children: [_jsxs("div", { className: "col-span-5 flex min-w-0 items-center gap-3", children: [_jsx("div", { onClick: handleCheckboxClick, onKeyDown: (e) => e.stopPropagation(), children: _jsx(Checkbox, { checked: selected }) }), _jsx(FileText, { className: "h-4 w-4 shrink-0 text-muted-foreground" }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate font-medium", children: job.name }), _jsx("div", { className: "truncate font-mono text-xs text-muted-foreground", children: truncate(job.id, 24) })] })] }), _jsx("div", { className: "col-span-2", children: _jsx(StatusBadge, { status: job.status, duration: job.duration }) }), _jsx("div", { className: "col-span-2 text-muted-foreground", children: _jsx(RelativeTime, { timestamp: job.timestamp }) }), _jsx("div", { className: "col-span-2 text-muted-foreground", children: job.processedOn ? (_jsx(RelativeTime, { timestamp: job.processedOn })) : (_jsx("span", { children: "-" })) }), _jsx("div", { className: "col-span-1 flex justify-end", children: _jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground" }) })] }));
}
