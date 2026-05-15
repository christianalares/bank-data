import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ChevronRight, Network, XCircle, } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFlows } from "@/lib/hooks";
export function FlowsPage({ onFlowSelect }) {
    const navigate = useNavigate();
    const { data, isLoading, error } = useFlows();
    const handleQueueClick = (queueName) => {
        navigate({ to: "/queues/$queueName", params: { queueName } });
    };
    const flows = data?.flows || [];
    // Loading skeleton
    if (isLoading && flows.length === 0) {
        return (_jsx("div", { className: "divide-y divide-border/50", children: [...Array(12)].map((_, i) => (_jsxs("div", { className: "grid grid-cols-12 items-center gap-4 py-3", children: [_jsxs("div", { className: "col-span-4 flex items-center gap-3", children: [_jsx("div", { className: "h-4 w-4 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-32 animate-pulse rounded bg-muted" })] }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-16 animate-pulse rounded bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-5 w-20 animate-pulse bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-16 animate-pulse rounded bg-muted" }) }), _jsx("div", { className: "col-span-2", children: _jsx("div", { className: "h-4 w-24 animate-pulse rounded bg-muted" }) })] }, i.toString()))) }));
    }
    // Error state
    if (error) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(EmptyState, { icon: AlertCircle, title: "Failed to load flows", description: error.message }) }));
    }
    // Empty state
    if (flows.length === 0) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center", children: _jsx(EmptyState, { icon: Network, title: "No flows found", description: "Flows are created when you use BullMQ's FlowProducer" }) }));
    }
    return (_jsxs("div", { children: [_jsx("div", { className: "sticky top-0 z-10 bg-background", children: _jsxs("div", { className: "grid grid-cols-12 gap-4 border-b border-dashed py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground", children: [_jsx("div", { className: "col-span-4", children: "Flow" }), _jsx("div", { className: "col-span-2", children: "Queue" }), _jsx("div", { className: "col-span-2", children: "Status" }), _jsx("div", { className: "col-span-2", children: "Progress" }), _jsx("div", { className: "col-span-2", children: "Created" })] }) }), _jsx("div", { className: "divide-y divide-border/50", children: flows.map((flow) => (_jsx(FlowRow, { flow: flow, onClick: () => onFlowSelect(flow.queueName, flow.id), onQueueClick: handleQueueClick }, `${flow.queueName}:${flow.id}`))) }), _jsxs("div", { className: "py-2.5 text-[11px] text-muted-foreground border-t border-dashed", children: [flows.length, " flow", flows.length !== 1 ? "s" : ""] })] }));
}
function FlowRow({ flow, onClick, onQueueClick }) {
    const handleQueueClick = (e) => {
        e.stopPropagation();
        onQueueClick(flow.queueName);
    };
    return (_jsxs("div", { onClick: onClick, className: "group grid w-full grid-cols-12 items-center gap-4 py-3 text-left text-sm cursor-default", children: [_jsxs("div", { className: "col-span-4 flex items-center gap-3 min-w-0", children: [_jsx(Network, { className: "h-4 w-4 text-muted-foreground shrink-0" }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate font-medium text-sm", children: flow.name }), _jsx("div", { className: "truncate font-mono text-[11px] text-muted-foreground", children: flow.id })] })] }), _jsx("div", { className: "col-span-2", children: _jsx("button", { type: "button", onClick: handleQueueClick, className: "truncate font-mono text-[11px] text-primary hover:underline", children: flow.queueName }) }), _jsx("div", { className: "col-span-2", children: _jsx(StatusBadge, { status: flow.status }) }), _jsx("div", { className: "col-span-2", children: _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" }), _jsx("span", { className: "text-muted-foreground tabular-nums", children: flow.completedJobs })] }), _jsx("span", { className: "text-muted-foreground", children: "/" }), _jsx("span", { className: "text-muted-foreground tabular-nums", children: flow.totalJobs }), flow.failedJobs > 0 && (_jsxs("div", { className: "flex items-center gap-1 ml-2", children: [_jsx(XCircle, { className: "h-3.5 w-3.5 text-destructive" }), _jsx("span", { className: "text-destructive tabular-nums", children: flow.failedJobs })] }))] }) }), _jsxs("div", { className: "col-span-2 flex items-center justify-between", children: [_jsx(RelativeTime, { timestamp: flow.timestamp }), _jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" })] })] }));
}
