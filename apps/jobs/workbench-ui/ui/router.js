import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createRootRoute, createRoute, createRouter, Outlet, useLocation, useNavigate, useParams, useSearch, } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { HeaderSearch } from "@/components/layout/header-search";
import { useConfig, useQueueNames, useQueues } from "@/lib/hooks";
import { FlowPage } from "@/pages/flow";
import { FlowsPage } from "@/pages/flows";
import { JobPage } from "@/pages/job";
import { MetricsPage } from "@/pages/metrics";
import { QueuePage } from "@/pages/queue";
import { RunsPage } from "@/pages/runs";
import { SchedulersPage } from "@/pages/schedulers";
import { TestPage } from "@/pages/test";
const SearchContext = React.createContext(null);
export function useSearchContext() {
    const context = React.useContext(SearchContext);
    if (!context) {
        throw new Error("useSearchContext must be used within SearchContextProvider");
    }
    return context;
}
// Search params schema for the Runs page
// sort format: "field:direction" e.g. "timestamp:desc"
export const runsSearchSchema = z.object({
    status: z
        .enum(["all", "active", "completed", "failed", "waiting", "delayed"])
        .optional()
        .catch("all"),
    q: z.string().optional().catch(""),
    from: z.number().optional(),
    to: z.number().optional(),
    sort: z.string().optional(), // format: "field:direction"
});
// Search params schema for the Queue page
export const queueSearchSchema = z.object({
    status: z
        .enum(["all", "active", "completed", "failed", "waiting", "delayed"])
        .optional()
        .catch("all"),
    sort: z.string().optional(), // format: "field:direction"
});
// Search params schema for the Schedulers page
export const schedulersSearchSchema = z.object({
    tab: z.enum(["repeatable", "delayed"]).optional().catch("repeatable"),
    repeatableSort: z.string().optional(), // format: "field:direction"
    delayedSort: z.string().optional(), // format: "field:direction"
});
// Search params schema for the Job page
export const jobSearchSchema = z.object({
    tab: z.enum(["payload", "output", "error", "retries", "timeline"]).optional(),
});
// Search params schema for the Test page (for cloning jobs)
export const testSearchSchema = z.object({
    queue: z.string().optional(),
    jobName: z.string().optional(),
    payload: z.string().optional(),
});
// Helper to parse sort string
export function parseSort(sort) {
    if (!sort)
        return undefined;
    const [field, dir] = sort.split(":");
    if (!field)
        return undefined;
    return { field, direction: dir === "asc" ? "asc" : "desc" };
}
// Helper to create sort string
export function createSort(field, direction) {
    return `${field}:${direction}`;
}
// Root layout component
function RootLayout() {
    const { data: config, isLoading: loading } = useConfig();
    // Use fast queue names for sidebar (no counts, instant)
    useQueueNames();
    // Lazy load full queue info for paused state (loads in background)
    const { data: queuesData = [] } = useQueues();
    const navigate = useNavigate();
    // Derive paused queues set (from lazy-loaded full queue data)
    const pausedQueues = React.useMemo(() => {
        return new Set(queuesData.filter((q) => q.isPaused).map((q) => q.name));
    }, [queuesData]);
    const location = useLocation();
    const [commandOpen, setCommandOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [isDark, setIsDark] = React.useState(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("workbench:theme");
            if (stored)
                return stored === "dark";
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        return false;
    });
    // Derive active nav and queue from location
    const { activeNav, activeQueue } = React.useMemo(() => {
        const path = location.pathname;
        if (path === "/" || path === "") {
            return { activeNav: "runs", activeQueue: undefined };
        }
        if (path === "/metrics") {
            return { activeNav: "metrics", activeQueue: undefined };
        }
        if (path === "/schedulers") {
            return { activeNav: "schedulers", activeQueue: undefined };
        }
        if (path === "/flows" || path.startsWith("/flows/")) {
            return { activeNav: "flows", activeQueue: undefined };
        }
        if (path === "/test") {
            return { activeNav: "test", activeQueue: undefined };
        }
        if (path.startsWith("/queues/")) {
            const queueName = path.split("/")[2];
            return { activeNav: "queues", activeQueue: queueName };
        }
        return { activeNav: "runs", activeQueue: undefined };
    }, [location.pathname]);
    // Toggle dark mode (disable transitions during switch)
    React.useEffect(() => {
        document.documentElement.classList.add("no-transitions");
        document.documentElement.classList.toggle("dark", isDark);
        localStorage.setItem("workbench:theme", isDark ? "dark" : "light");
        // Re-enable transitions after the theme switch
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.documentElement.classList.remove("no-transitions");
            });
        });
    }, [isDark]);
    // Keyboard shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            // Command palette shortcut
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setCommandOpen(true);
                return;
            }
            // Don't handle other shortcuts when command palette is open (let cmdk handle them)
            if (commandOpen)
                return;
            // Refresh shortcut
            if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                window.location.reload();
            }
            // Theme toggle shortcut
            if (e.key === "t" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                e.preventDefault();
                setIsDark(!isDark);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [commandOpen, isDark]);
    if (loading || !config) {
        return (_jsx("div", { className: "flex h-screen items-center justify-center bg-background", children: _jsx("div", { className: "animate-pulse text-muted-foreground", children: "Loading..." }) }));
    }
    const handleNavSelect = (nav) => {
        switch (nav) {
            case "runs":
                navigate({ to: "/" });
                break;
            case "metrics":
                navigate({ to: "/metrics" });
                break;
            case "schedulers":
                navigate({ to: "/schedulers" });
                break;
            case "flows":
                navigate({ to: "/flows" });
                break;
            case "test":
                navigate({ to: "/test" });
                break;
            case "queues":
                // Just expand the queues section, don't navigate
                break;
        }
    };
    const handleQueueSelect = (queue) => {
        navigate({ to: "/queues/$queueName", params: { queueName: queue } });
    };
    return (_jsxs("div", { className: "flex h-screen bg-background", children: [_jsx(AppSidebar, { queues: config.queues, pausedQueues: pausedQueues, activeNav: activeNav, activeQueue: activeQueue, onNavSelect: handleNavSelect, onQueueSelect: handleQueueSelect, isDark: isDark, onToggleTheme: () => setIsDark(!isDark) }), _jsx("div", { className: "flex flex-1 flex-col overflow-hidden", children: _jsx(SearchContext.Provider, { value: { searchQuery, setSearchQuery, setCommandOpen }, children: _jsx(Outlet, {}) }) }), _jsx(CommandPalette, { open: commandOpen, onOpenChange: setCommandOpen, queues: config.queues, searchQuery: searchQuery, onSearchQueryChange: setSearchQuery, isDark: isDark, onToggleTheme: () => setIsDark(!isDark), onSelectQueue: (queue) => {
                    navigate({ to: "/queues/$queueName", params: { queueName: queue } });
                    setCommandOpen(false);
                }, onSelectJob: (queue, jobId) => {
                    navigate({
                        to: "/queues/$queueName/jobs/$jobId",
                        params: { queueName: queue, jobId },
                    });
                    setCommandOpen(false);
                }, onNavigate: (path) => {
                    navigate({ to: path });
                    setCommandOpen(false);
                } })] }));
}
// Page wrapper with header
function PageLayout({ title, subtitle, children, }) {
    const context = useSearchContext();
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-6", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h1", { className: "text-lg font-semibold", children: title }), subtitle && (_jsx("span", { className: "font-mono text-sm text-muted-foreground", children: subtitle }))] }), _jsx(HeaderSearch, { value: context.searchQuery, onValueChange: context.setSearchQuery, onFocus: () => context.setCommandOpen(true) })] }), _jsx("main", { className: "flex-1 overflow-auto p-6", children: children })] }));
}
// Route components - all pages eagerly loaded for instant navigation
function RunsRoute() {
    const navigate = useNavigate();
    const search = useSearch({ from: "/" });
    return (_jsx(PageLayout, { title: "Runs", children: _jsx(RunsPage, { search: search, onSearchChange: (newSearch) => {
                navigate({
                    to: "/",
                    search: newSearch,
                    replace: true,
                });
            }, onJobSelect: (queueName, jobId) => navigate({
                to: "/queues/$queueName/jobs/$jobId",
                params: { queueName, jobId },
            }), onQueueSelect: (queueName) => navigate({
                to: "/queues/$queueName",
                params: { queueName },
            }) }) }));
}
function SchedulersRoute() {
    const navigate = useNavigate();
    const search = useSearch({ from: "/schedulers" });
    return (_jsx(PageLayout, { title: "Schedulers", children: _jsx(SchedulersPage, { search: search, onSearchChange: (newSearch) => {
                navigate({
                    to: "/schedulers",
                    search: newSearch,
                    replace: true,
                });
            } }) }));
}
function MetricsRoute() {
    return (_jsx(PageLayout, { title: "Metrics", children: _jsx(MetricsPage, {}) }));
}
function FlowsRoute() {
    const navigate = useNavigate();
    return (_jsx(PageLayout, { title: "Flows", children: _jsx(FlowsPage, { onFlowSelect: (queueName, jobId) => navigate({
                to: "/flows/$queueName/$jobId",
                params: { queueName, jobId },
            }) }) }));
}
function FlowDetailRoute() {
    const { queueName, jobId } = useParams({ from: "/flows/$queueName/$jobId" });
    return (_jsx(PageLayout, { title: "Flow Details", subtitle: jobId, children: _jsx(FlowPage, { queueName: queueName, jobId: jobId }) }));
}
function TestRoute() {
    const { data: config } = useConfig();
    const search = useSearch({ from: "/test" });
    return (_jsx(PageLayout, { title: "Test", children: _jsx(TestPage, { queues: config?.queues || [], readonly: config?.readonly, prefill: search }) }));
}
function QueueRoute() {
    const { queueName } = useParams({ from: "/queues/$queueName" });
    const navigate = useNavigate();
    const search = useSearch({ from: "/queues/$queueName" });
    return (_jsx(PageLayout, { title: queueName, children: _jsx(QueuePage, { queueName: queueName, search: search, onSearchChange: (newSearch) => {
                navigate({
                    to: "/queues/$queueName",
                    params: { queueName },
                    search: newSearch,
                    replace: true,
                });
            }, onJobSelect: (jobId) => navigate({
                to: "/queues/$queueName/jobs/$jobId",
                params: { queueName, jobId },
            }) }) }));
}
function JobRoute() {
    const { queueName, jobId } = useParams({
        from: "/queues/$queueName/jobs/$jobId",
    });
    const { data: config } = useConfig();
    const navigate = useNavigate();
    const search = useSearch({ from: "/queues/$queueName/jobs/$jobId" });
    return (_jsx(PageLayout, { title: "Job Details", subtitle: jobId, children: _jsx(JobPage, { queueName: queueName, jobId: jobId, readonly: config?.readonly, search: search, onSearchChange: (newSearch) => {
                navigate({
                    to: "/queues/$queueName/jobs/$jobId",
                    params: { queueName, jobId },
                    search: newSearch,
                    replace: true,
                });
            }, onBack: () => navigate({ to: "/queues/$queueName", params: { queueName } }), onClone: (queue, jobName, payload) => navigate({
                to: "/test",
                search: { queue, jobName, payload },
            }) }) }));
}
// Route definitions
const rootRoute = createRootRoute({
    component: RootLayout,
});
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: RunsRoute,
    validateSearch: runsSearchSchema,
});
const metricsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/metrics",
    component: MetricsRoute,
});
const schedulersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/schedulers",
    component: SchedulersRoute,
    validateSearch: schedulersSearchSchema,
});
const flowsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/flows",
    component: FlowsRoute,
});
const flowDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/flows/$queueName/$jobId",
    component: FlowDetailRoute,
});
const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/test",
    component: TestRoute,
    validateSearch: testSearchSchema,
});
const queueRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/queues/$queueName",
    component: QueueRoute,
    validateSearch: queueSearchSchema,
});
const jobRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/queues/$queueName/jobs/$jobId",
    component: JobRoute,
    validateSearch: jobSearchSchema,
});
// Route tree
const routeTree = rootRoute.addChildren([
    indexRoute,
    metricsRoute,
    schedulersRoute,
    flowsRoute,
    flowDetailRoute,
    testRoute,
    queueRoute,
    jobRoute,
]);
// Create and export router
export function createAppRouter(basePath) {
    return createRouter({
        routeTree,
        basepath: basePath,
    });
}
