"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart3, Clock, FlaskConical, Layers, Moon, Network, Play, Sun, } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger, } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@/components/ui/tooltip";
import { useQueueInfo } from "@/lib/hooks";
import { cn } from "@/lib/utils";
// Lazy-loaded queue counts component
function QueueCounts({ queueName }) {
    const queueInfo = useQueueInfo(queueName);
    if (!queueInfo) {
        return (_jsx("div", { className: "flex gap-2 text-[9px] text-muted-foreground", children: _jsx("span", { children: "Loading..." }) }));
    }
    const { counts } = queueInfo;
    const total = counts.waiting +
        counts.active +
        counts.completed +
        counts.failed +
        counts.delayed;
    return (_jsxs("div", { className: "flex gap-2 text-[9px]", children: [counts.active > 0 && (_jsxs("span", { className: "text-chart-2", children: [counts.active, " active"] })), counts.waiting > 0 && (_jsxs("span", { className: "text-muted-foreground", children: [counts.waiting, " waiting"] })), counts.failed > 0 && (_jsxs("span", { className: "text-chart-3", children: [counts.failed, " failed"] })), total === 0 && _jsx("span", { className: "text-muted-foreground", children: "empty" })] }));
}
// Custom Workbench logo icon
function WorkbenchIcon({ className }) {
    return (_jsxs("svg", { viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", className: className, children: [_jsx("path", { d: "M12 2L21 7V17L12 22L3 17V7L12 2Z", stroke: "currentColor", strokeWidth: "1.5", fill: "none" }), _jsx("rect", { x: "7", y: "9", width: "10", height: "2", rx: "0.5", fill: "currentColor" }), _jsx("rect", { x: "7", y: "13", width: "6", height: "2", rx: "0.5", fill: "currentColor" })] }));
}
export function AppSidebar({ queues, pausedQueues = new Set(), activeNav, activeQueue, onNavSelect, onQueueSelect, isDark, onToggleTheme, }) {
    const mainNavItems = [
        { id: "runs", label: "Runs", icon: Play },
        { id: "metrics", label: "Metrics", icon: BarChart3 },
        { id: "schedulers", label: "Schedulers", icon: Clock },
        { id: "flows", label: "Flows", icon: Network },
        { id: "test", label: "Test", icon: FlaskConical },
    ];
    const NavButton = ({ icon: Icon, label, isActive, onClick, isPaused, }) => {
        return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onClick, className: cn("flex w-full items-center justify-center p-2 text-sm font-medium transition-colors", isActive
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"), children: _jsxs("div", { className: "relative", children: [_jsx(Icon, { className: "h-4 w-4 shrink-0" }), isPaused && (_jsx("span", { className: "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" }))] }) }) }), _jsx(TooltipContent, { side: "right", sideOffset: 16, children: _jsxs("span", { className: "flex items-center gap-2", children: [label, isPaused && _jsx("span", { className: "text-amber-500", children: "(paused)" })] }) })] }));
    };
    return (_jsxs("aside", { className: "flex h-screen w-[52px] flex-col border-r border-border bg-background", children: [_jsx("div", { className: "flex h-14 items-center justify-center border-b border-border", children: _jsx(WorkbenchIcon, { className: "h-5 w-5" }) }), _jsx(ScrollArea, { className: "flex-1", children: _jsxs("div", { className: "space-y-6 p-2", children: [_jsx("nav", { className: "space-y-1", children: mainNavItems.map((item) => (_jsx(NavButton, { icon: item.icon, label: item.label, isActive: activeNav === item.id, onClick: () => onNavSelect(item.id) }, item.id))) }), _jsx("div", { className: "border-t border-border pt-2", children: _jsxs(HoverCard, { openDelay: 100, closeDelay: 200, children: [_jsx(HoverCardTrigger, { asChild: true, children: _jsx("button", { type: "button", className: cn("flex w-full items-center justify-center p-2 text-sm font-medium transition-colors", activeNav === "queues" || activeQueue
                                                ? "text-foreground"
                                                : "text-muted-foreground hover:text-foreground"), children: _jsx(Layers, { className: "h-4 w-4 shrink-0" }) }) }), _jsx(HoverCardContent, { side: "right", align: "start", sideOffset: 16, className: "w-auto min-w-[140px] p-1", children: _jsxs("div", { className: "space-y-0.5", children: [_jsx("div", { className: "px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground", children: "Queues" }), queues.map((queue) => (_jsxs("button", { type: "button", onClick: () => onQueueSelect(queue), className: cn("flex w-full flex-col items-start gap-0.5 px-2 py-1.5 transition-colors", activeQueue === queue
                                                        ? "text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"), children: [_jsxs("div", { className: "flex w-full items-center justify-between gap-2", children: [_jsx("span", { className: "font-mono text-[11px]", children: queue }), pausedQueues.has(queue) && (_jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" }))] }), _jsx(QueueCounts, { queueName: queue })] }, queue)))] }) })] }) })] }) }), _jsx("div", { className: "border-t border-border p-2", children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", onClick: onToggleTheme, className: "flex w-full items-center justify-center rounded p-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground", children: isDark ? (_jsx(Sun, { className: "h-4 w-4 shrink-0" })) : (_jsx(Moon, { className: "h-4 w-4 shrink-0" })) }) }), _jsx(TooltipContent, { side: "right", sideOffset: 16, children: isDark ? "Light mode" : "Dark mode" })] }) })] }));
}
