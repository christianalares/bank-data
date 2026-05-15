import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Clock, GitBranch, Loader2, Network, XCircle, } from "lucide-react";
import { FlowGraph } from "@/components/flows";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFlow } from "@/lib/hooks";
import { formatDuration } from "@/lib/utils";
export function FlowPage({ queueName, jobId }) {
    const navigate = useNavigate();
    const { data: flow, isLoading, error } = useFlow(queueName, jobId);
    const handleNodeClick = (node) => {
        navigate({
            to: "/queues/$queueName/jobs/$jobId",
            params: { queueName: node.queueName, jobId: node.job.id },
        });
    };
    // Loading state
    if (isLoading) {
        return (_jsxs("div", { className: "flex flex-col h-full -mb-6", children: [_jsxs("div", { className: "pb-4 border-b border-border shrink-0", children: [_jsx("div", { className: "flex items-center justify-between mb-4", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-6 w-32 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-5 w-20 animate-pulse rounded bg-muted" })] }) }), _jsxs("div", { className: "flex items-center gap-6", children: [_jsx("div", { className: "h-4 w-24 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-32 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-20 animate-pulse rounded bg-muted" })] })] }), _jsx("div", { className: "flex-1 -mx-6 -mb-6 mt-6 flex items-center justify-center dotted-bg", children: _jsx(Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) })] }));
    }
    // Error state
    if (error || !flow) {
        return (_jsx(EmptyState, { icon: AlertCircle, title: "Failed to load flow", description: error?.message ||
                "Flow not found or jobs have been cleaned up" }));
    }
    // Count stats from flow tree
    const stats = countFlowStats(flow);
    return (_jsxs("div", { className: "flex flex-col h-full -mb-6", children: [_jsxs("div", { className: "pb-4 border-b border-border shrink-0", children: [_jsx("div", { className: "flex items-center justify-between mb-4", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Network, { className: "h-5 w-5 text-muted-foreground" }), _jsx(StatusBadge, { status: flow.job.status })] }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-x-6 gap-y-2 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted-foreground", children: "Queue:" }), _jsx("button", { type: "button", onClick: () => navigate({
                                            to: "/queues/$queueName",
                                            params: { queueName },
                                        }), className: "text-xs bg-muted px-1.5 py-0.5 font-mono text-primary hover:underline", children: queueName })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(GitBranch, { className: "h-4 w-4 text-muted-foreground" }), _jsxs("span", { className: "text-muted-foreground", children: [stats.total, " job", stats.total !== 1 ? "s" : ""] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-emerald-500" }), _jsxs("span", { className: "text-muted-foreground", children: [stats.completed, " completed"] })] }), stats.failed > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(XCircle, { className: "h-4 w-4 text-red-500" }), _jsxs("span", { className: "text-red-500", children: [stats.failed, " failed"] })] })), flow.job.duration !== undefined && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Clock, { className: "h-4 w-4 text-muted-foreground" }), _jsx("span", { className: "text-muted-foreground", children: formatDuration(flow.job.duration) })] }))] })] }), _jsx("div", { className: "flex-1 -mx-6 -mb-6 mt-6 dotted-bg", children: _jsx(FlowGraph, { flow: flow, onNodeClick: handleNodeClick }) })] }));
}
function countFlowStats(node) {
    let total = 1;
    let completed = node.job.status === "completed" ? 1 : 0;
    let failed = node.job.status === "failed" ? 1 : 0;
    if (node.children) {
        for (const child of node.children) {
            const childStats = countFlowStats(child);
            total += childStats.total;
            completed += childStats.completed;
            failed += childStats.failed;
        }
    }
    return { total, completed, failed };
}
