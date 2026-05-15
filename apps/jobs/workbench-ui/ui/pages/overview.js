import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Activity, AlertCircle, CheckCircle, Layers } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { useOverview } from "@/lib/hooks";
import { cn } from "@/lib/utils";
export function OverviewPage({ onQueueSelect }) {
    const { data, isLoading, error } = useOverview();
    if (isLoading && !data) {
        return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [...Array(4)].map((_, i) => (_jsxs("div", { className: "p-4 border bg-card", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("div", { className: "h-4 w-16 animate-pulse rounded bg-muted" }), _jsx("div", { className: "h-4 w-4 animate-pulse rounded bg-muted" })] }), _jsx("div", { className: "h-8 w-20 animate-pulse rounded bg-muted mb-1" }), _jsx("div", { className: "h-3 w-12 animate-pulse rounded bg-muted" })] }, i.toString()))) }), _jsxs("div", { children: [_jsx("div", { className: "h-5 w-16 animate-pulse rounded bg-muted mb-4" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: [...Array(6)].map((_, i) => (_jsxs("div", { className: "p-4 border bg-card", children: [_jsx("div", { className: "flex items-center justify-between mb-3", children: _jsx("div", { className: "h-5 w-24 animate-pulse rounded bg-muted" }) }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: [...Array(3)].map((__, j) => (_jsxs("div", { children: [_jsx("div", { className: "h-3 w-12 animate-pulse rounded bg-muted mb-1" }), _jsx("div", { className: "h-5 w-8 animate-pulse rounded bg-muted" })] }, j.toString()))) })] }, i.toString()))) })] })] }));
    }
    if (error) {
        return (_jsx(EmptyState, { icon: AlertCircle, title: "Failed to load overview", description: error.message }));
    }
    if (!data)
        return null;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { title: "Total Jobs", value: data.totalJobs.toLocaleString(), description: "In queue", icon: Layers }), _jsx(StatCard, { title: "Active", value: data.activeJobs.toLocaleString(), description: "Currently processing", icon: Activity, accent: "warning" }), _jsx(StatCard, { title: "Failed", value: data.failedJobs.toLocaleString(), description: "Need attention", icon: AlertCircle, accent: data.failedJobs > 0 ? "destructive" : undefined }), _jsx(StatCard, { title: "Completed", value: data.completedToday.toLocaleString(), description: "Today", icon: CheckCircle, accent: "success" })] }), _jsxs("div", { children: [_jsx("h3", { className: "font-medium mb-4", children: "Queues" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: data.queues.map((queue) => (_jsxs("button", { type: "button", onClick: () => onQueueSelect(queue.name), className: "text-left p-4 border bg-card hover:bg-accent transition-colors", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("span", { className: "font-mono font-medium", children: queue.name }), queue.isPaused && (_jsx("span", { className: "text-xs text-muted-foreground bg-muted px-2 py-0.5", children: "Paused" }))] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-muted-foreground text-xs", children: "Waiting" }), _jsx("div", { className: "font-medium", children: queue.counts.waiting })] }), _jsxs("div", { children: [_jsx("div", { className: "text-muted-foreground text-xs", children: "Active" }), _jsx("div", { className: "font-medium text-warning", children: queue.counts.active })] }), _jsxs("div", { children: [_jsx("div", { className: "text-muted-foreground text-xs", children: "Failed" }), _jsx("div", { className: cn("font-medium", queue.counts.failed > 0 && "text-destructive"), children: queue.counts.failed })] })] })] }, queue.name))) })] })] }));
}
function StatCard({ title, value, description, icon: Icon, accent, }) {
    const accentClasses = {
        success: "text-success",
        warning: "text-warning",
        destructive: "text-destructive",
    };
    return (_jsxs("div", { className: "p-4 border bg-card", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-sm text-muted-foreground", children: title }), _jsx(Icon, { className: "h-4 w-4 text-muted-foreground" })] }), _jsx("div", { className: cn("text-2xl font-semibold", accent && accentClasses[accent]), children: value }), _jsx("div", { className: "text-xs text-muted-foreground mt-1", children: description })] }));
}
