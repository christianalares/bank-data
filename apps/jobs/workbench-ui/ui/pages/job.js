import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Copy, CopyPlus, Download, ExternalLink, FastForward, Hash, Info, Layers, Network, Play, RefreshCw, RotateCcw, Trash2, XCircle, } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonViewer } from "@/components/shared/json-viewer";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJob, usePromoteJob, useRemoveJob, useRetryJob } from "@/lib/hooks";
import { cn, formatAbsoluteTime, formatDuration } from "@/lib/utils";
export function JobPage({ queueName, jobId, readonly, search, onSearchChange, onBack, onClone, }) {
    const navigate = useNavigate();
    const { data: job, isLoading, error } = useJob(queueName, jobId);
    const retryMutation = useRetryJob();
    const removeMutation = useRemoveJob();
    const promoteMutation = usePromoteJob();
    const [copied, setCopied] = React.useState(false);
    const actionLoading = retryMutation.isPending ||
        removeMutation.isPending ||
        promoteMutation.isPending;
    const handleCopyId = async () => {
        await navigator.clipboard.writeText(jobId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const handleRetry = () => {
        retryMutation.mutate({ queueName, jobId });
    };
    const handleRemove = () => {
        removeMutation.mutate({ queueName, jobId }, {
            onSuccess: () => onBack(),
        });
    };
    const handlePromote = () => {
        promoteMutation.mutate({ queueName, jobId });
    };
    const handleExport = () => {
        if (!job)
            return;
        const exportData = {
            id: job.id,
            name: job.name,
            queueName,
            status: job.status,
            data: job.data,
            returnvalue: job.returnvalue,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace,
            attemptsMade: job.attemptsMade,
            opts: job.opts,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            duration: job.duration,
            progress: job.progress,
            tags: job.tags,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `job-${job.name}-${jobId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const handleClone = () => {
        if (!job)
            return;
        const payload = JSON.stringify(job.data, null, 2);
        onClone(queueName, job.name, payload);
    };
    if (isLoading && !job) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: " border bg-card", children: [_jsxs("div", { className: "flex items-center justify-between border-b px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-6 w-32 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-5 w-20 animate-pulse bg-muted" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-8 w-8 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-8 w-8 animate-pulse rounded bg-muted" })] })] }), _jsxs("div", { className: "flex items-center gap-6 px-4 py-3", children: [_jsx("div", { className: "h-4 w-24 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-32 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-20 animate-pulse rounded bg-muted" })] })] }), _jsxs("div", { className: " border bg-card p-4", children: [_jsx("div", { className: "h-5 w-16 animate-pulse rounded bg-muted mb-3" }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "h-4 w-full animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-3/4 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-1/2 animate-pulse rounded bg-muted" })] })] })] }));
    }
    if (error || !job) {
        return (_jsx(EmptyState, { icon: AlertCircle, title: "Job not found", description: error?.message || "This job may have been removed", action: _jsx(Button, { variant: "outline", onClick: onBack, children: "Go back" }) }));
    }
    return (_jsxs("div", { className: "flex h-full flex-col gap-4", children: [_jsxs("div", { className: " border bg-card", children: [_jsxs("div", { className: "flex items-center justify-between border-b px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex items-center gap-2  bg-muted px-2.5 py-1 text-sm font-medium", children: job.name }), _jsx(StatusBadge, { status: job.status })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: handleExport, children: [_jsx(Download, { className: "mr-1.5 h-3.5 w-3.5" }), "Export"] }), !readonly && (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: handleClone, children: [_jsx(CopyPlus, { className: "mr-1.5 h-3.5 w-3.5" }), "Clone"] }), job.status === "failed" && (_jsxs(Button, { variant: "outline", size: "sm", onClick: handleRetry, disabled: actionLoading, children: [_jsx(RefreshCw, { className: "mr-1.5 h-3.5 w-3.5" }), "Retry"] })), job.status === "delayed" && (_jsxs(Button, { variant: "outline", size: "sm", onClick: handlePromote, disabled: actionLoading, children: [_jsx(FastForward, { className: "mr-1.5 h-3.5 w-3.5" }), "Run Now"] })), _jsxs(Button, { variant: "outline", size: "sm", onClick: handleRemove, disabled: actionLoading, className: "text-destructive hover:bg-destructive/10 hover:text-destructive", children: [_jsx(Trash2, { className: "mr-1.5 h-3.5 w-3.5" }), "Remove"] })] }))] })] }), _jsxs("div", { className: "divide-y text-sm", children: [_jsx(MetadataRow, { icon: Hash, label: "Job ID", mono: true, children: _jsxs("span", { className: "flex items-center gap-2", children: [jobId, _jsx("button", { type: "button", onClick: handleCopyId, className: "rounded p-1 hover:bg-muted", children: copied ? (_jsx(Check, { className: "h-3.5 w-3.5 text-status-success" })) : (_jsx(Copy, { className: "h-3.5 w-3.5 text-muted-foreground" })) })] }) }), _jsx(MetadataRow, { icon: Layers, label: "Queue", children: _jsx("button", { type: "button", onClick: () => navigate({
                                        to: "/queues/$queueName",
                                        params: { queueName },
                                    }), className: "font-mono text-xs text-primary hover:underline", children: queueName }) }), job.parent && (_jsx(MetadataRow, { icon: Network, label: "Part of Flow", children: _jsxs("button", { type: "button", onClick: () => navigate({
                                        to: "/flows/$queueName/$jobId",
                                        params: {
                                            queueName: job.parent.queueName,
                                            jobId: job.parent.id,
                                        },
                                    }), className: "flex items-center gap-1.5 text-primary hover:underline", children: [_jsx("span", { className: "font-mono text-xs", children: job.parent.id }), _jsx(ExternalLink, { className: "h-3 w-3" })] }) })), _jsx(MetadataRow, { icon: Clock, label: "Created", children: formatAbsoluteTime(job.timestamp) }), job.processedOn && (_jsx(MetadataRow, { icon: Clock, label: "Started", children: formatAbsoluteTime(job.processedOn) })), job.finishedOn && (_jsx(MetadataRow, { icon: Clock, label: "Finished", children: formatAbsoluteTime(job.finishedOn) }))] }), _jsxs("div", { className: "flex items-center gap-6 border-t px-4 py-3 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-foreground", children: "Duration" }), _jsx("span", { className: "font-mono font-medium", children: job.duration ? formatDuration(job.duration) : "-" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(RotateCcw, { className: "h-3.5 w-3.5 text-muted-foreground" }), _jsx("span", { className: "text-muted-foreground", children: "Attempts" }), _jsxs("span", { className: "font-mono font-medium", children: [job.attemptsMade, " / ", job.opts.attempts || 3] }), job.attemptsMade > 1 && (_jsx(Badge, { variant: "secondary", className: "bg-amber-500/10 text-amber-600 text-[10px] px-1.5", children: "Retried" }))] }), job.opts.delay && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-foreground", children: "Delay" }), _jsx("span", { className: "font-mono font-medium", children: formatDuration(job.opts.delay) })] }))] })] }), _jsxs(Tabs, { value: search.tab || (job.status === "failed" ? "error" : "payload"), onValueChange: (tab) => onSearchChange({
                    ...search,
                    tab: tab,
                }), className: "flex-1", children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "payload", children: "Payload" }), _jsx(TabsTrigger, { value: "output", children: "Output" }), job.failedReason && (_jsx(TabsTrigger, { value: "error", className: "text-status-error", children: "Error" })), job.attemptsMade > 1 &&
                                job.stacktrace &&
                                job.stacktrace.length > 0 && (_jsxs(TabsTrigger, { value: "retries", children: ["Retries (", job.attemptsMade - 1, ")"] })), _jsx(TabsTrigger, { value: "timeline", children: "Timeline" })] }), _jsx(TabsContent, { value: "payload", className: "mt-4", children: _jsx("div", { className: " border", children: _jsx(JsonViewer, { data: job.data }) }) }), _jsx(TabsContent, { value: "output", className: "mt-4", children: _jsx("div", { className: " border", children: job.returnvalue ? (_jsx(JsonViewer, { data: job.returnvalue })) : (_jsx("div", { className: "flex h-32 items-center justify-center text-muted-foreground", children: "No output data" })) }) }), job.failedReason && (_jsx(TabsContent, { value: "error", className: "mt-4 flex flex-col", style: { maxHeight: "calc(100vh - 480px)", minHeight: "200px" }, children: _jsx(ErrorDisplay, { error: job.failedReason, stacktrace: job.stacktrace, jobName: job.name, queueName: queueName }) })), job.attemptsMade > 1 &&
                        job.stacktrace &&
                        job.stacktrace.length > 0 && (_jsx(TabsContent, { value: "retries", className: "mt-4", children: _jsx(RetryHistory, { attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts || 3, stacktraces: job.stacktrace, status: job.status }) })), _jsx(TabsContent, { value: "timeline", className: "mt-4", children: _jsx(Timeline, { job: job }) })] })] }));
}
function MetadataRow({ icon: Icon, label, children, mono, }) {
    return (_jsxs("div", { className: "flex items-center justify-between px-4 py-2.5", children: [_jsxs("div", { className: "flex items-center gap-2 text-muted-foreground", children: [_jsx(Icon, { className: "h-4 w-4" }), label] }), _jsx("div", { className: cn(mono && "font-mono"), children: children })] }));
}
function ErrorDisplay({ error, stacktrace, jobName, queueName, }) {
    const [expanded, setExpanded] = React.useState(true);
    const [copied, setCopied] = React.useState(false);
    const handleCopy = async () => {
        const text = stacktrace ? `${error}\n\n${stacktrace.join("\n")}` : error;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const handleOpenInCursor = () => {
        const errorText = stacktrace
            ? `${error}\n\n${stacktrace.join("\n")}`
            : error;
        const prompt = `Debug this error from job "${jobName || "unknown"}" in queue "${queueName || "unknown"}":\n\n${errorText}\n\nHelp me understand what caused this error and how to fix it.`;
        const deeplink = `https://cursor.com/link/prompt?text=${encodeURIComponent(prompt)}`;
        window.open(deeplink, "_blank");
    };
    return (_jsxs("div", { className: "flex flex-col h-full overflow-hidden border border-status-error/30 bg-status-error/5", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-status-error/30 px-4 py-2 shrink-0", children: [_jsx("span", { className: "font-medium text-status-error", children: error }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { type: "button", onClick: handleOpenInCursor, className: "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-status-error/10 hover:text-foreground", title: "Fix in Cursor", children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", fillRule: "evenodd", xmlns: "http://www.w3.org/2000/svg", className: "shrink-0", children: _jsx("path", { d: "M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z" }) }), _jsx("span", { children: "Fix in Cursor" })] }), _jsx("div", { className: "h-4 w-px bg-border" }), _jsx("button", { type: "button", onClick: handleCopy, className: "rounded p-1.5 hover:bg-status-error/10", title: "Copy error", children: copied ? (_jsx(Check, { className: "h-4 w-4 text-status-success" })) : (_jsx(Copy, { className: "h-4 w-4 text-muted-foreground" })) }), stacktrace && stacktrace.length > 0 && (_jsx("button", { type: "button", onClick: () => setExpanded(!expanded), className: "rounded p-1.5 hover:bg-status-error/10", title: expanded ? "Collapse" : "Expand", children: _jsx(ChevronDown, { className: cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180") }) }))] })] }), expanded && stacktrace && stacktrace.length > 0 && (_jsx("div", { className: "flex-1 overflow-auto p-4 min-h-0", children: _jsx("pre", { className: "font-mono text-xs text-muted-foreground", children: stacktrace.join("\n") }) }))] }));
}
function Timeline({ job }) {
    const [expanded, setExpanded] = React.useState({
        root: true,
        attempt: true,
    });
    // Build span tree from job data
    const { spans, timeRange } = React.useMemo(() => {
        const startTime = job.timestamp;
        const endTime = job.finishedOn || job.processedOn || Date.now();
        const totalDuration = endTime - startTime;
        // Root job span
        const rootSpan = {
            id: "root",
            label: job.name,
            icon: job.status === "completed"
                ? CheckCircle2
                : job.status === "failed"
                    ? XCircle
                    : Play,
            iconColor: job.status === "completed"
                ? "text-status-success"
                : job.status === "failed"
                    ? "text-status-error"
                    : "text-status-warning",
            startTime: job.timestamp,
            endTime: job.finishedOn,
            status: job.status === "completed"
                ? "success"
                : job.status === "failed"
                    ? "error"
                    : "running",
            badge: job.attemptsMade > 0 ? `Attempt ${job.attemptsMade}` : undefined,
            children: [],
        };
        // Add queue wait span if there was waiting time
        if (job.processedOn && job.processedOn > job.timestamp) {
            const waitDuration = job.processedOn - job.timestamp;
            if (waitDuration > 100) {
                // Only show if > 100ms
                rootSpan.children?.push({
                    id: "wait",
                    label: "Queued",
                    icon: Clock,
                    iconColor: "text-muted-foreground",
                    startTime: job.timestamp,
                    endTime: job.processedOn,
                    status: "waiting",
                });
            }
        }
        // Add execution span
        if (job.processedOn) {
            const execSpan = {
                id: "exec",
                label: "run()",
                icon: Play,
                iconColor: "text-blue-500",
                startTime: job.processedOn,
                endTime: job.finishedOn,
                status: job.status === "completed"
                    ? "success"
                    : job.status === "failed"
                        ? "error"
                        : "running",
                badge: job.duration ? formatDuration(job.duration) : undefined,
                children: [],
            };
            // Add progress entries as logs if progress is an object with entries
            if (job.progress && typeof job.progress === "object") {
                const progress = job.progress;
                if (Array.isArray(progress.logs)) {
                    for (const log of progress.logs) {
                        execSpan.children?.push({
                            id: `log-${execSpan.children.length}`,
                            label: log.message,
                            icon: Info,
                            iconColor: "text-blue-400",
                            startTime: log.time || job.processedOn,
                            status: "success",
                            isLog: true,
                        });
                    }
                }
            }
            // Add error as final log if failed
            if (job.status === "failed" && job.failedReason) {
                execSpan.children?.push({
                    id: "error",
                    label: job.failedReason,
                    icon: AlertCircle,
                    iconColor: "text-status-error",
                    startTime: job.finishedOn || job.processedOn,
                    status: "error",
                    isLog: true,
                });
            }
            rootSpan.children?.push(execSpan);
        }
        return {
            spans: [rootSpan],
            timeRange: { start: startTime, end: endTime, duration: totalDuration },
        };
    }, [job]);
    const toggleExpand = (id) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    // Generate time axis labels
    const timeLabels = React.useMemo(() => {
        const { start, duration } = timeRange;
        const labels = [];
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const timestamp = start + (duration / steps) * i;
            const relativePosition = ((timestamp - start) / duration) * 100;
            labels.push({
                position: relativePosition,
                label: formatDuration(timestamp - start),
            });
        }
        return labels;
    }, [timeRange]);
    const renderSpan = (span, depth = 0) => {
        const hasChildren = span.children && span.children.length > 0;
        const isExpanded = expanded[span.id] !== false;
        const Icon = span.icon;
        // Calculate bar position
        const barStart = ((span.startTime - timeRange.start) / timeRange.duration) * 100;
        const barEnd = span.endTime
            ? ((span.endTime - timeRange.start) / timeRange.duration) * 100
            : 100;
        const barWidth = Math.max(barEnd - barStart, 0.5);
        return (_jsxs(React.Fragment, { children: [_jsxs("div", { className: "group flex min-h-[36px] items-center border-b border-border/50 hover:bg-muted/30", children: [_jsxs("div", { className: "flex w-[45%] min-w-0 items-center gap-1 py-2 pr-4", style: { paddingLeft: `${depth * 20 + 12}px` }, children: [hasChildren ? (_jsx("button", { type: "button", onClick: () => toggleExpand(span.id), className: "flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted", children: _jsx(ChevronRight, { className: cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90") }) })) : (_jsx("div", { className: "w-5 shrink-0" })), _jsx(Icon, { className: cn("h-4 w-4 shrink-0", span.iconColor) }), _jsx("span", { className: cn("truncate text-sm", span.isLog ? "text-muted-foreground" : "font-medium"), children: span.label }), span.badge && (_jsx("span", { className: "ml-2 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground", children: span.badge }))] }), _jsx("div", { className: "relative h-full flex-1 py-2 pr-4", children: span.isLog ? (_jsx("div", { className: "absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-muted-foreground/40", style: { left: `${barStart}%` } })) : (_jsx("div", { className: cn("absolute top-1/2 h-5 -translate-y-1/2 ", span.status === "success" && "bg-status-success", span.status === "error" && "bg-status-error", span.status === "running" && "bg-status-warning", span.status === "waiting" && "bg-muted-foreground/30"), style: {
                                    left: `${barStart}%`,
                                    width: `${barWidth}%`,
                                    minWidth: "2px",
                                }, children: barWidth > 8 && span.endTime && (_jsx("span", { className: "absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white", children: formatDuration(span.endTime - span.startTime) })) })) })] }), hasChildren &&
                    isExpanded &&
                    span.children?.map((child) => renderSpan(child, depth + 1))] }, span.id));
    };
    return (_jsxs("div", { className: "flex flex-col border bg-card overflow-hidden h-full", children: [_jsxs("div", { className: "flex border-b bg-muted/30 shrink-0", children: [_jsx("div", { className: "w-[45%] shrink-0 flex items-center py-2 pr-4", style: { paddingLeft: "12px" }, children: _jsx("span", { className: "text-xs font-medium text-muted-foreground", children: "Span" }) }), _jsx("div", { className: "relative flex-1 py-2 pr-4 flex items-center", children: timeLabels.map((label, i) => (_jsx("span", { className: "absolute font-mono text-[10px] text-muted-foreground", style: {
                                left: `${label.position}%`,
                                transform: "translateX(-50%)",
                            }, children: label.label }, i.toString()))) })] }), _jsx("div", { className: "flex-1 overflow-auto min-h-0", children: spans.map((span) => renderSpan(span)) })] }));
}
function RetryHistory({ attemptsMade, maxAttempts, stacktraces, status, }) {
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-4  border bg-muted/30 px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(RotateCcw, { className: "h-4 w-4 text-amber-500" }), _jsx("span", { className: "font-medium", children: "Retry History" })] }), _jsxs("div", { className: "text-sm text-muted-foreground", children: [attemptsMade, " of ", maxAttempts, " attempts"] }), _jsx(Badge, { variant: status === "completed" ? "default" : "destructive", className: "ml-auto", children: status === "completed"
                            ? "Eventually succeeded"
                            : "All attempts failed" })] }), _jsx("div", { className: "space-y-3", children: stacktraces.map((trace, index) => (_jsx(RetryAttemptCard, { attemptNumber: index + 1, isLast: index === stacktraces.length - 1, stacktrace: trace, succeeded: status === "completed" && index === stacktraces.length - 1 }, index.toString()))) })] }));
}
function RetryAttemptCard({ attemptNumber, isLast, stacktrace, succeeded, }) {
    const [expanded, setExpanded] = React.useState(isLast);
    // Parse error message from stacktrace (first line usually)
    const errorMessage = stacktrace.split("\n")[0] || "Unknown error";
    return (_jsxs("div", { className: cn("overflow-hidden  border", succeeded
            ? "border-status-success/30 bg-status-success/5"
            : "border-status-error/30 bg-status-error/5"), children: [_jsxs("button", { type: "button", onClick: () => setExpanded(!expanded), className: "flex w-full items-center gap-3 px-4 py-2.5 text-left", children: [_jsx("div", { className: cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", succeeded
                            ? "bg-status-success/20 text-status-success"
                            : "bg-status-error/20 text-status-error"), children: attemptNumber }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-sm font-medium", children: ["Attempt ", attemptNumber] }), succeeded ? (_jsx(Badge, { variant: "secondary", className: "bg-status-success/10 text-status-success text-[10px]", children: "Success" })) : (_jsx(Badge, { variant: "secondary", className: "bg-status-error/10 text-status-error text-[10px]", children: "Failed" }))] }), !succeeded && (_jsx("div", { className: "truncate text-xs text-muted-foreground", children: errorMessage }))] }), _jsx(ChevronDown, { className: cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180") })] }), expanded && !succeeded && (_jsx("div", { className: "border-t border-inherit px-4 py-3", children: _jsx("pre", { className: "max-h-48 overflow-auto font-mono text-xs text-muted-foreground whitespace-pre-wrap", children: stacktrace }) })), expanded && succeeded && (_jsx("div", { className: "border-t border-inherit px-4 py-3 text-sm text-status-success", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(CheckCircle2, { className: "h-4 w-4" }), "Job completed successfully on this attempt"] }) }))] }));
}
