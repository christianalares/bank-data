import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, Clock, Hourglass, TrendingUp, Zap, } from "lucide-react";
import { SummaryCard } from "@/components/metrics/summary-card";
import { Badge } from "@/components/ui/badge";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ChartContainer, Legend, Tooltip, XAxis, YAxis, } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics } from "@/lib/hooks";
import { cn, formatDuration } from "@/lib/utils";
// Chart configuration using theme variables
const throughputChartConfig = {
    completed: {
        label: "Completed",
        color: "hsl(var(--chart-completed))",
    },
    failed: {
        label: "Failed",
        color: "hsl(var(--chart-failed))",
    },
};
const durationChartConfig = {
    duration: {
        label: "Duration",
        color: "hsl(var(--chart-duration))",
    },
    waitTime: {
        label: "Wait Time",
        color: "hsl(var(--chart-wait))",
    },
};
function formatHour(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}
function formatHourShort(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: "numeric",
    });
}
function formatPercentage(value) {
    return `${(value * 100).toFixed(1)}%`;
}
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload || !label)
        return null;
    return (_jsxs("div", { className: " border bg-popover px-3 py-2 text-popover-foreground shadow-md", children: [_jsx("p", { className: "text-xs font-medium mb-1.5", children: formatHour(label) }), _jsx("div", { className: "space-y-1", children: payload.map((entry) => (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx("span", { className: "h-2 w-2 shrink-0", style: { backgroundColor: entry.color } }), _jsxs("span", { className: "text-muted-foreground", children: [entry.name, ":"] }), _jsx("span", { className: "font-medium tabular-nums", children: entry.value })] }, entry.name))) })] }));
}
function DurationTooltip({ active, payload, label }) {
    if (!active || !payload || !label)
        return null;
    // Map dataKey to chart config colors
    const getColor = (dataKey, fallbackColor) => {
        if (dataKey === "duration")
            return "hsl(var(--chart-duration))";
        if (dataKey === "waitTime")
            return "hsl(var(--chart-wait))";
        return fallbackColor || "hsl(var(--muted-foreground))";
    };
    return (_jsxs("div", { className: " border bg-popover px-3 py-2 text-popover-foreground shadow-md", children: [_jsx("p", { className: "text-xs font-medium mb-1.5", children: formatHour(label) }), _jsx("div", { className: "space-y-1", children: payload.map((entry) => {
                    const color = entry.dataKey
                        ? getColor(entry.dataKey, entry.color)
                        : entry.color;
                    return (_jsxs("div", { className: "flex items-center gap-2 text-xs", children: [_jsx("span", { className: "h-2 w-2 shrink-0", style: { backgroundColor: color } }), _jsxs("span", { className: "text-muted-foreground", children: [entry.name, ":"] }), _jsx("span", { className: "font-medium tabular-nums", children: formatDuration(entry.value) })] }, entry.name));
                }) })] }));
}
function SlowestJobsTable({ jobs }) {
    if (jobs.length === 0) {
        return (_jsx("div", { className: "text-center py-8 text-sm text-muted-foreground", children: "No completed jobs in the last 24 hours" }));
    }
    return (_jsx("div", { className: "divide-y divide-border", children: jobs.map((job, index) => (_jsxs(Link, { to: "/queues/$queueName/jobs/$jobId", params: { queueName: job.queueName, jobId: job.jobId }, className: "flex items-center justify-between px-4 py-2.5", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("span", { className: "text-xs text-muted-foreground w-5 tabular-nums shrink-0", children: index + 1 }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-sm font-medium truncate", children: job.name }), _jsx("div", { className: "text-xs text-muted-foreground font-mono truncate", children: job.queueName })] })] }), _jsx(Badge, { variant: "outline", className: "font-mono text-xs shrink-0", children: formatDuration(job.duration) })] }, `${job.queueName}-${job.jobId}`))) }));
}
function FailingJobsTable({ jobs }) {
    if (jobs.length === 0) {
        return (_jsx("div", { className: "text-center py-8 text-sm text-muted-foreground", children: "No failed jobs in the last 24 hours" }));
    }
    return (_jsx("div", { className: "divide-y divide-border", children: jobs.map((job, index) => (_jsxs("div", { className: "flex items-center justify-between px-4 py-2.5", children: [_jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [_jsx("span", { className: "text-xs text-muted-foreground w-5 tabular-nums shrink-0", children: index + 1 }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-sm font-medium truncate", children: job.name }), _jsx("div", { className: "text-xs text-muted-foreground font-mono truncate", children: job.queueName })] })] }), _jsxs("div", { className: "flex items-center gap-3 shrink-0", children: [_jsxs("span", { className: "text-xs text-muted-foreground tabular-nums", children: [job.failCount, "/", job.totalCount] }), _jsx(Badge, { variant: "outline", className: cn("font-mono text-xs", job.errorRate > 0.5
                                ? "border-status-error/50 text-status-error"
                                : job.errorRate > 0.2
                                    ? "border-status-warning/50 text-status-warning"
                                    : ""), children: formatPercentage(job.errorRate) })] })] }, `${job.queueName}-${job.name}`))) }));
}
function LoadingSkeleton() {
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "grid grid-cols-4 gap-4", children: ["throughput", "error-rate", "duration", "wait-time"].map((id) => (_jsxs("div", { className: " border p-4 space-y-3", children: [_jsx(Skeleton, { className: "h-4 w-20" }), _jsx(Skeleton, { className: "h-8 w-24" }), _jsx(Skeleton, { className: "h-6 w-20" })] }, id))) }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: " border p-4 space-y-3", children: [_jsx(Skeleton, { className: "h-4 w-32" }), _jsx(Skeleton, { className: "h-48 w-full" })] }), _jsxs("div", { className: " border p-4 space-y-3", children: [_jsx(Skeleton, { className: "h-4 w-32" }), _jsx(Skeleton, { className: "h-48 w-full" })] })] })] }));
}
export function MetricsPage() {
    const { data: metrics, isLoading, error } = useMetrics();
    if (isLoading) {
        return _jsx(LoadingSkeleton, {});
    }
    if (error || !metrics) {
        return (_jsx("div", { className: " border border-destructive/50 bg-destructive/10 p-4", children: _jsx("p", { className: "text-destructive", children: error instanceof Error ? error.message : "Failed to load metrics" }) }));
    }
    const { aggregate, slowestJobs, mostFailingTypes } = metrics;
    const { summary, buckets } = aggregate;
    // Calculate trend (compare first half vs second half of 24h period)
    const midpoint = Math.floor(buckets.length / 2);
    const firstHalf = buckets.slice(0, midpoint);
    const secondHalf = buckets.slice(midpoint);
    const firstHalfCompleted = firstHalf.reduce((sum, b) => sum + b.completed, 0);
    const secondHalfCompleted = secondHalf.reduce((sum, b) => sum + b.completed, 0);
    const firstHalfFailed = firstHalf.reduce((sum, b) => sum + b.failed, 0);
    const secondHalfFailed = secondHalf.reduce((sum, b) => sum + b.failed, 0);
    // Prepare chart data
    const throughputData = buckets.map((b) => ({
        hour: b.hour,
        completed: b.completed,
        failed: b.failed,
    }));
    const durationData = buckets.map((b) => ({
        hour: b.hour,
        duration: b.avgDuration,
        waitTime: b.avgWaitTime,
    }));
    // Sparkline data (just the values)
    const throughputSparkline = buckets.map((b) => b.completed + b.failed);
    const errorSparkline = buckets.map((b) => b.completed + b.failed > 0 ? b.failed / (b.completed + b.failed) : 0);
    const durationSparkline = buckets.map((b) => b.avgDuration);
    const waitTimeSparkline = buckets.map((b) => b.avgWaitTime);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-4 gap-4", children: [_jsx(SummaryCard, { title: "Throughput", value: summary.throughputPerHour.toLocaleString(), subtitle: "jobs/hour avg", sparklineData: throughputSparkline, sparklineColor: "default", trend: {
                            current: secondHalfCompleted + secondHalfFailed,
                            previous: firstHalfCompleted + firstHalfFailed,
                            higherIsBetter: true,
                        }, icon: _jsx(TrendingUp, { className: "h-4 w-4" }) }), _jsx(SummaryCard, { title: "Error Rate", value: formatPercentage(summary.errorRate), subtitle: `${summary.totalFailed} failed`, sparklineData: errorSparkline, sparklineColor: summary.errorRate > 0.1 ? "danger" : "success", trend: {
                            current: secondHalfFailed,
                            previous: firstHalfFailed,
                            higherIsBetter: false,
                        }, icon: _jsx(AlertTriangle, { className: "h-4 w-4" }) }), _jsx(SummaryCard, { title: "Avg Duration", value: formatDuration(summary.avgDuration), subtitle: "processing time", sparklineData: durationSparkline, sparklineColor: "default", icon: _jsx(Zap, { className: "h-4 w-4" }) }), _jsx(SummaryCard, { title: "Avg Wait Time", value: formatDuration(summary.avgWaitTime), subtitle: "queue delay", sparklineData: waitTimeSparkline, sparklineColor: summary.avgWaitTime > 60000 ? "warning" : "default", icon: _jsx(Hourglass, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "border border-dashed bg-card p-4", children: [_jsxs("h3", { className: "text-sm font-medium mb-4 flex items-center gap-2", children: [_jsx(Activity, { className: "h-4 w-4 text-muted-foreground" }), "Job Throughput"] }), _jsx(ChartContainer, { config: throughputChartConfig, className: "h-52 w-full", children: _jsxs(AreaChart, { data: throughputData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "hsl(var(--border))", strokeOpacity: 0.5 }), _jsx(XAxis, { dataKey: "hour", tickFormatter: formatHourShort, tick: {
                                                fontSize: 11,
                                                fill: "hsl(var(--muted-foreground))",
                                            }, tickLine: false, axisLine: false }), _jsx(YAxis, { tick: {
                                                fontSize: 11,
                                                fill: "hsl(var(--muted-foreground))",
                                            }, tickLine: false, axisLine: false, width: 32 }), _jsx(Tooltip, { content: _jsx(ChartTooltip, {}) }), _jsx(Legend, { verticalAlign: "top", height: 32, iconType: "square", iconSize: 8, wrapperStyle: { fontSize: 12 }, formatter: (value) => (_jsx("span", { style: { color: "hsl(var(--foreground))" }, children: value })) }), _jsxs("defs", { children: [_jsxs("linearGradient", { id: "completedGradient", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "var(--color-completed)", stopOpacity: 0.5 }), _jsx("stop", { offset: "100%", stopColor: "var(--color-completed)", stopOpacity: 0.05 })] }), _jsxs("pattern", { id: "failedPattern", x: "0", y: "0", width: "6", height: "6", patternUnits: "userSpaceOnUse", children: [_jsx("rect", { width: "6", height: "6", fill: "var(--color-failed)", fillOpacity: 0.15 }), _jsx("path", { d: "M0,0 L6,6 M-1,5 L5,11 M-1,-1 L7,7", stroke: "var(--color-failed)", strokeWidth: "1", opacity: "0.4" })] })] }), _jsx(Area, { type: "monotone", dataKey: "completed", name: "Completed", stackId: "1", stroke: "var(--color-completed)", fill: "url(#completedGradient)", strokeWidth: 2, dot: false, activeDot: {
                                                r: 4,
                                                fill: "var(--color-completed)",
                                                stroke: "none",
                                            } }), _jsx(Area, { type: "monotone", dataKey: "failed", name: "Failed", stackId: "1", stroke: "var(--color-failed)", fill: "url(#failedPattern)", strokeWidth: 2, dot: false, activeDot: {
                                                r: 4,
                                                fill: "var(--color-failed)",
                                                stroke: "none",
                                            } })] }) })] }), _jsxs("div", { className: "border border-dashed bg-card p-4", children: [_jsxs("h3", { className: "text-sm font-medium mb-4 flex items-center gap-2", children: [_jsx(Clock, { className: "h-4 w-4 text-muted-foreground" }), "Processing Time"] }), _jsx(ChartContainer, { config: durationChartConfig, className: "h-52 w-full", children: _jsxs(BarChart, { data: durationData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "hsl(var(--border))", strokeOpacity: 0.5 }), _jsx(XAxis, { dataKey: "hour", tickFormatter: formatHourShort, tick: {
                                                fontSize: 11,
                                                fill: "hsl(var(--muted-foreground))",
                                            }, tickLine: false, axisLine: false }), _jsx(YAxis, { tickFormatter: (v) => formatDuration(v), tick: {
                                                fontSize: 11,
                                                fill: "hsl(var(--muted-foreground))",
                                            }, tickLine: false, axisLine: false, width: 48 }), _jsx(Tooltip, { content: _jsx(DurationTooltip, {}), cursor: false }), _jsx(Legend, { verticalAlign: "top", height: 32, iconType: "square", iconSize: 8, wrapperStyle: { fontSize: 12 }, formatter: (value) => (_jsx("span", { style: { color: "hsl(var(--foreground))" }, children: value })) }), _jsx(Bar, { dataKey: "duration", name: "Duration", fill: "hsl(210, 90%, 50%)", radius: [0, 0, 0, 0], style: { outline: "none" }, isAnimationActive: false }), _jsx(Bar, { dataKey: "waitTime", name: "Wait Time", fill: "hsl(45, 95%, 50%)", radius: [0, 0, 0, 0], style: { outline: "none" }, isAnimationActive: false })] }) })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "border border-dashed bg-card", children: [_jsx("div", { className: "border-b border-dashed px-4 py-3", children: _jsxs("h3", { className: "text-sm font-medium flex items-center gap-2", children: [_jsx(Clock, { className: "h-4 w-4 text-muted-foreground" }), "Slowest Jobs"] }) }), _jsx(SlowestJobsTable, { jobs: slowestJobs })] }), _jsxs("div", { className: "border border-dashed bg-card", children: [_jsx("div", { className: "border-b border-dashed px-4 py-3", children: _jsxs("h3", { className: "text-sm font-medium flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-muted-foreground" }), "Most Failing Job Types"] }) }), _jsx(FailingJobsTable, { jobs: mostFailingTypes })] })] })] }));
}
