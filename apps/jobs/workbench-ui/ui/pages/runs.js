import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, RefreshCw, X } from "lucide-react";
import * as React from "react";
import { BulkBottomBar, } from "@/components/shared/bulk-bottom-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { SortableHeader, useSort } from "@/components/shared/sortable-header";
import { StatusBadge, StatusDot } from "@/components/shared/status-badge";
import { parseSearchQuery, SmartSearch } from "@/components/smart-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@/components/ui/tooltip";
import { useActivityStats, useBulkDelete, useBulkPromote, useBulkRetry, useRefresh, useRuns, } from "@/lib/hooks";
import { formatDuration, truncate } from "@/lib/utils";
export function RunsPage({ search, onSearchChange, onJobSelect, onQueueSelect, }) {
    const _queryClient = useQueryClient();
    // Selection state for bulk actions
    const [selection, setSelection] = React.useState(new Map());
    // Bulk action mutations
    const bulkRetry = useBulkRetry();
    const bulkDelete = useBulkDelete();
    const bulkPromote = useBulkPromote();
    // Sort hook
    const { currentSort, handleSort } = useSort(search.sort, (sort) => onSearchChange({ ...search, sort }));
    // Parse tag filters from the q param
    const parsedQuery = React.useMemo(() => parseSearchQuery(search.q ?? ""), [search.q]);
    // Derive time range from URL params
    const timeRange = React.useMemo(() => {
        if (search.from && search.to) {
            return { start: search.from, end: search.to };
        }
        return undefined;
    }, [search.from, search.to]);
    // Build filters object for server-side filtering
    const filters = React.useMemo(() => {
        const statusFilter = search.status ?? "all";
        const hasFilters = statusFilter !== "all" ||
            Object.keys(parsedQuery.tags).length > 0 ||
            !!parsedQuery.text ||
            !!timeRange;
        if (!hasFilters) {
            return undefined;
        }
        return {
            status: statusFilter !== "all" ? statusFilter : undefined,
            tags: Object.keys(parsedQuery.tags).length > 0 ? parsedQuery.tags : undefined,
            text: parsedQuery.text || undefined,
            timeRange,
        };
    }, [search.status, parsedQuery, timeRange]);
    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching, } = useRuns(search.sort, filters);
    // Flatten all pages into a single array (already filtered server-side)
    const runs = React.useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    // No client-side filtering needed - server handles it
    const filteredRuns = runs;
    // Handle search change
    const handleSearchChange = (q, status) => {
        onSearchChange({
            ...search,
            q: q || undefined,
            status: status ?? search.status,
        });
    };
    // Handle timeline selection
    const handleTimeRangeChange = (range) => {
        onSearchChange({
            ...search,
            from: range?.start,
            to: range?.end,
        });
    };
    // Server-side cache refresh
    const refreshMutation = useRefresh();
    const _refresh = () => {
        refreshMutation.mutate();
    };
    const _loading = isLoading || isRefetching || refreshMutation.isPending;
    // Selection helpers
    const selectionKey = (queueName, jobId) => `${queueName}:${jobId}`;
    const isSelected = (queueName, jobId) => selection.has(selectionKey(queueName, jobId));
    const toggleSelection = (run) => {
        const key = selectionKey(run.queueName, run.id);
        setSelection((prev) => {
            const next = new Map(prev);
            if (next.has(key)) {
                next.delete(key);
            }
            else {
                next.set(key, {
                    queueName: run.queueName,
                    jobId: run.id,
                    status: run.status,
                });
            }
            return next;
        });
    };
    const selectAll = () => {
        const newSelection = new Map();
        for (const run of filteredRuns) {
            const key = selectionKey(run.queueName, run.id);
            newSelection.set(key, {
                queueName: run.queueName,
                jobId: run.id,
                status: run.status,
            });
        }
        setSelection(newSelection);
    };
    const clearSelection = () => setSelection(new Map());
    const isAllSelected = filteredRuns.length > 0 && selection.size === filteredRuns.length;
    const isPartiallySelected = selection.size > 0 && selection.size < filteredRuns.length;
    // Bulk action handlers - only act on relevant job statuses
    const handleBulkRetry = async () => {
        const failedJobs = Array.from(selection.values()).filter((s) => s.status === "failed");
        if (failedJobs.length > 0) {
            await bulkRetry.mutateAsync({ jobs: failedJobs });
        }
        clearSelection();
    };
    const handleBulkDelete = async () => {
        const jobs = Array.from(selection.values());
        await bulkDelete.mutateAsync({ jobs });
        clearSelection();
    };
    const handleBulkPromote = async () => {
        const delayedJobs = Array.from(selection.values()).filter((s) => s.status === "delayed");
        if (delayedJobs.length > 0) {
            await bulkPromote.mutateAsync({ jobs: delayedJobs });
        }
        clearSelection();
    };
    // Fetch activity stats from API (cached server-side, complete 7-day data)
    const { data: activityData } = useActivityStats();
    // Transform API data into timeline format
    const timelineData = React.useMemo(() => {
        if (!activityData) {
            // Return empty placeholder while loading
            const now = Date.now();
            const bucketSize = 4 * 60 * 60 * 1000;
            const startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            startDate.setDate(startDate.getDate() - 6);
            return {
                buckets: [],
                startTime: startDate.getTime(),
                endTime: now,
                bucketSize,
            };
        }
        const buckets = activityData.buckets.map((bucket) => {
            const date = new Date(bucket.time);
            return {
                time: bucket.time,
                label: date.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                }),
                dayLabel: date.toLocaleDateString([], { weekday: "short" }),
                success: bucket.completed,
                error: bucket.failed,
            };
        });
        return {
            buckets,
            startTime: activityData.startTime,
            endTime: activityData.endTime,
            bucketSize: activityData.bucketSize,
        };
    }, [activityData]);
    const totalSuccess = activityData?.totalCompleted ?? 0;
    const totalError = activityData?.totalFailed ?? 0;
    // Infinite scroll - load more when sentinel is visible
    const loadMoreRef = React.useRef(null);
    React.useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel || !hasNextPage)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        }, { rootMargin: "100px" });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
    return (_jsxs("div", { className: "h-full overflow-auto", children: [_jsx("div", { className: "py-4", children: _jsx(ActivityTimeline, { data: timelineData, selection: timeRange ?? null, onSelectionChange: handleTimeRangeChange, totalSuccess: totalSuccess, totalError: totalError }) }), _jsxs("div", { className: "sticky top-0 z-20 bg-background", children: [_jsx("div", { className: "border-b border-dashed pb-3", children: _jsx(SmartSearch, { value: search.q ?? "", status: search.status, onChange: handleSearchChange }) }), _jsxs("div", { className: "grid grid-cols-12 gap-4 border-b border-dashed py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground", children: [_jsxs("div", { className: "col-span-5 flex items-center gap-3", children: [_jsx(Checkbox, { checked: isAllSelected, indeterminate: isPartiallySelected, onCheckedChange: (checked) => {
                                            if (checked) {
                                                selectAll();
                                            }
                                            else {
                                                clearSelection();
                                            }
                                        } }), _jsx(SortableHeader, { field: "name", label: "Job", currentSort: currentSort, onSort: handleSort })] }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "queueName", label: "Queue", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "status", label: "Status", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-2", children: _jsx(SortableHeader, { field: "timestamp", label: "Time", currentSort: currentSort, onSort: handleSort }) }), _jsx("div", { className: "col-span-1", children: _jsx(SortableHeader, { field: "duration", label: "Duration", currentSort: currentSort, onSort: handleSort }) })] })] }), isLoading && runs.length === 0 ? (_jsx("div", { className: "divide-y divide-border/50", children: [...Array(15)].map((_, i) => (_jsxs("div", { className: "grid grid-cols-12 items-center gap-4 py-3", children: [_jsxs("div", { className: "col-span-5 flex items-center gap-3", children: [_jsx("div", { className: "h-4 w-4 animate-pulse bg-muted" }), _jsx("div", { className: "h-2 w-2 animate-pulse bg-muted" }), _jsx("div", { className: "h-4 w-32 animate-pulse bg-muted" })] }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-16 animate-pulse bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-5 w-20 animate-pulse bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-24 animate-pulse bg-muted" }) }), _jsx("div", { className: "col-span-1", children: _jsx("div", { className: "h-4 w-12 animate-pulse bg-muted" }) })] }, i.toString()))) })) : error ? (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(EmptyState, { icon: FileText, title: "Failed to load runs", description: error.message }) })) : filteredRuns.length === 0 ? (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(EmptyState, { icon: FileText, title: "No runs found", description: parsedQuery.text
                        ? `No results for "${parsedQuery.text}"`
                        : search.status && search.status !== "all"
                            ? `No ${search.status} runs`
                            : "No job runs yet" }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "divide-y divide-border/50", children: filteredRuns.map((run) => (_jsx(RunRow, { run: run, selected: isSelected(run.queueName, run.id), onSelect: () => toggleSelection(run), onClick: () => onJobSelect(run.queueName, run.id), onQueueClick: onQueueSelect }, `${run.queueName}-${run.id}`))) }), hasNextPage && (_jsx("div", { ref: loadMoreRef, className: "flex items-center justify-center py-4", children: isFetchingNextPage && (_jsx(RefreshCw, { className: "h-4 w-4 animate-spin text-muted-foreground" })) })), _jsxs("div", { className: "px-6 py-3 text-xs text-muted-foreground", children: ["Showing ", filteredRuns.length, " runs"] })] })), _jsx(BulkBottomBar, { selection: Array.from(selection.values()), onClear: clearSelection, onRetry: handleBulkRetry, onDelete: handleBulkDelete, onPromote: handleBulkPromote, isRetrying: bulkRetry.isPending, isDeleting: bulkDelete.isPending, isPromoting: bulkPromote.isPending })] }));
}
function RunRow({ run, selected, onSelect, onClick, onQueueClick, }) {
    const hasTags = run.tags && Object.keys(run.tags).length > 0;
    const handleCheckboxClick = (e) => {
        e.stopPropagation();
        onSelect();
    };
    const handleQueueClick = (e) => {
        e.stopPropagation();
        onQueueClick(run.queueName);
    };
    return (_jsxs("div", { className: "group grid w-full grid-cols-12 items-center gap-4 py-3 text-left text-sm cursor-pointer", onClick: onClick, children: [_jsxs("div", { className: "col-span-5 flex min-w-0 items-center gap-3", children: [_jsx("div", { onClick: handleCheckboxClick, onKeyDown: (e) => e.stopPropagation(), children: _jsx(Checkbox, { checked: selected }) }), _jsx(StatusDot, { status: run.status }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "truncate font-medium", children: run.name }), hasTags && (_jsxs("div", { className: "flex items-center gap-1", children: [Object.entries(run.tags)
                                                .slice(0, 2)
                                                .map(([key, val]) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("span", { className: "inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground", children: [key, ":", truncate(String(val), 8)] }) }), _jsx(TooltipContent, { children: _jsxs("span", { className: "font-mono", children: [key, ": ", String(val)] }) })] }, key))), Object.keys(run.tags).length > 2 && (_jsxs("span", { className: "text-[10px] text-muted-foreground", children: ["+", Object.keys(run.tags).length - 2] }))] }))] }), _jsx("div", { className: "truncate font-mono text-xs text-muted-foreground", children: truncate(run.id, 24) })] })] }), _jsx("div", { className: "col-span-2", children: _jsx("button", { type: "button", onClick: handleQueueClick, className: "truncate font-mono text-xs text-primary hover:underline", children: run.queueName }) }), _jsx("div", { className: "col-span-2", children: _jsx(StatusBadge, { status: run.status }) }), _jsx("div", { className: "col-span-2 text-muted-foreground", children: run.processedOn ? (_jsx(RelativeTime, { timestamp: run.processedOn })) : (_jsx(RelativeTime, { timestamp: run.timestamp })) }), _jsxs("div", { className: "col-span-1 flex items-center justify-between", children: [_jsx("span", { className: "font-mono text-muted-foreground", children: run.duration ? formatDuration(run.duration) : "-" }), _jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" })] })] }));
}
function ActivityTimeline({ data, selection, onSelectionChange, totalSuccess, totalError, }) {
    const containerRef = React.useRef(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragStart, setDragStart] = React.useState(null);
    const [dragEnd, setDragEnd] = React.useState(null);
    const maxValue = Math.max(...data.buckets.map((b) => b.success + b.error), 1);
    const getTimeFromPosition = (clientX) => {
        if (!containerRef.current)
            return data.startTime;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const ratio = x / rect.width;
        return data.startTime + ratio * (data.endTime - data.startTime);
    };
    const handleMouseDown = (e) => {
        if (e.button !== 0)
            return;
        const time = getTimeFromPosition(e.clientX);
        setIsDragging(true);
        setDragStart(time);
        setDragEnd(time);
    };
    const handleMouseMove = (e) => {
        if (!isDragging || dragStart === null)
            return;
        const time = getTimeFromPosition(e.clientX);
        setDragEnd(time);
    };
    const handleMouseUp = () => {
        if (isDragging && dragStart !== null && dragEnd !== null) {
            const start = Math.min(dragStart, dragEnd);
            const end = Math.max(dragStart, dragEnd);
            // Only set selection if dragged more than 1 second
            if (end - start > 1000) {
                onSelectionChange({ start, end });
            }
        }
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };
    const handleMouseLeave = () => {
        if (isDragging) {
            handleMouseUp();
        }
    };
    const formatDayLabel = (time) => {
        const date = new Date(time);
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        if (isToday)
            return "Today";
        return date.toLocaleDateString([], { weekday: "short" });
    };
    // Calculate selection position for overlay
    const getSelectionStyle = (range) => {
        const duration = data.endTime - data.startTime;
        const left = ((range.start - data.startTime) / duration) * 100;
        const width = ((range.end - range.start) / duration) * 100;
        return { left: `${left}%`, width: `${width}%` };
    };
    return (_jsxs("div", { className: "border border-dashed p-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("span", { className: "text-xs font-medium uppercase tracking-wider text-muted-foreground", children: "Activity" }), _jsx("span", { className: "text-xs text-muted-foreground", children: "Last 7 days" })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-2 w-2 bg-chart-1" }), _jsxs("span", { className: "text-xs tabular-nums text-muted-foreground", children: [totalSuccess, " completed"] })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "h-2 w-2 bg-chart-failed" }), _jsxs("span", { className: "text-xs tabular-nums text-muted-foreground", children: [totalError, " failed"] })] }), _jsx("div", { className: "h-6", children: selection && (_jsxs(Button, { variant: "ghost", size: "sm", onClick: () => onSelectionChange(null), className: "h-6 gap-1 px-2 text-xs", children: [_jsx(X, { className: "h-3 w-3" }), "Clear"] })) })] })] }), _jsxs("div", { ref: containerRef, className: "relative h-12 cursor-crosshair select-none", onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp, onMouseLeave: handleMouseLeave, children: [data.buckets.map((bucket, i) => {
                        const total = bucket.success + bucket.error;
                        const successHeight = bucket.success > 0
                            ? Math.max((bucket.success / maxValue) * 100, 8)
                            : 0;
                        const errorHeight = bucket.error > 0 ? Math.max((bucket.error / maxValue) * 100, 8) : 0;
                        const hasActivity = total > 0;
                        // Calculate position based on bucket time
                        const timeRange = data.endTime - data.startTime;
                        const bucketPosition = ((bucket.time - data.startTime) / timeRange) * 100;
                        return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { className: "absolute bottom-0 flex h-full w-[3px] flex-col justify-end", style: { left: `${bucketPosition}%` }, children: hasActivity ? (_jsxs(_Fragment, { children: [bucket.error > 0 && (_jsx("div", { className: "w-full bg-chart-failed", style: { height: `${errorHeight}%` } })), bucket.success > 0 && (_jsx("div", { className: "w-full bg-chart-1", style: { height: `${successHeight}%` } }))] })) : (_jsx("div", { className: "h-px w-full bg-muted/30" })) }) }), _jsxs(TooltipContent, { side: "top", className: "text-xs", children: [_jsx("div", { className: "font-medium text-foreground", children: bucket.label }), total > 0 ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-muted-foreground", children: [total, " ", total === 1 ? "run" : "runs"] }), bucket.success > 0 && (_jsxs("div", { className: "text-chart-1", children: [bucket.success, " completed"] })), bucket.error > 0 && (_jsxs("div", { className: "text-chart-failed", children: [bucket.error, " failed"] }))] })) : (_jsx("div", { className: "text-muted-foreground", children: "No activity" }))] })] }, i.toString()));
                    }), _jsx("div", { className: "absolute bottom-0 left-0 right-0 h-px bg-border" }), isDragging && dragStart !== null && dragEnd !== null && (_jsx("div", { className: "pointer-events-none absolute bottom-0 top-0 border-x border-ring bg-ring/10", style: getSelectionStyle({
                            start: Math.min(dragStart, dragEnd),
                            end: Math.max(dragStart, dragEnd),
                        }) })), selection && !isDragging && (_jsx("div", { className: "pointer-events-none absolute bottom-0 top-0 border-x-2 border-ring bg-ring/20", style: getSelectionStyle(selection) }))] }), _jsx("div", { className: "mt-2 flex justify-between text-[10px] text-muted-foreground", children: Array.from({ length: 7 }).map((_, i) => {
                    const dayTime = data.startTime + i * 24 * 60 * 60 * 1000;
                    return _jsx("span", { children: formatDayLabel(dayTime) }, i.toString());
                }) })] }));
}
