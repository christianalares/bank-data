import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowRight, BarChart3, Calendar, FileText, FlaskConical, Layers, Moon, Network, RefreshCw, Search, Sun, } from "lucide-react";
import * as React from "react";
import { parseSearchQuery } from "@/components/smart-search";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, } from "@/components/ui/command";
import { useConfig, useSearch, useTagValues } from "@/lib/hooks";
import { formatRelativeTime, truncate } from "@/lib/utils";
const navigationItems = [
    {
        id: "runs",
        label: "Runs",
        path: "/",
        icon: _jsx(FileText, { className: "h-4 w-4" }),
        keywords: ["runs", "jobs", "all"],
    },
    {
        id: "metrics",
        label: "Metrics",
        path: "/metrics",
        icon: _jsx(BarChart3, { className: "h-4 w-4" }),
        keywords: ["metrics", "stats", "analytics", "dashboard"],
    },
    {
        id: "schedulers",
        label: "Schedulers",
        path: "/schedulers",
        icon: _jsx(Calendar, { className: "h-4 w-4" }),
        keywords: ["schedulers", "scheduled", "cron", "repeatable", "delayed"],
    },
    {
        id: "flows",
        label: "Flows",
        path: "/flows",
        icon: _jsx(Network, { className: "h-4 w-4" }),
        keywords: ["flows", "workflows", "graph"],
    },
    {
        id: "test",
        label: "Test",
        path: "/test",
        icon: _jsx(FlaskConical, { className: "h-4 w-4" }),
        keywords: ["test", "testing", "try"],
    },
];
export function CommandPalette({ open, onOpenChange, queues, searchQuery, onSearchQueryChange, isDark, onToggleTheme, onSelectQueue, onSelectJob, onNavigate, }) {
    const { data: config } = useConfig();
    const [inputValue, setInputValue] = React.useState(searchQuery);
    const tagFields = config?.tags ?? [];
    // Sync input value with searchQuery prop and when dialog opens
    React.useEffect(() => {
        if (open) {
            setInputValue(searchQuery);
        }
    }, [open, searchQuery]);
    // Sync input changes to parent
    const handleInputChange = (value) => {
        setInputValue(value);
        onSearchQueryChange(value);
    };
    // Parse search query for tag autocomplete
    const _parsedQuery = React.useMemo(() => {
        return parseSearchQuery(inputValue);
    }, [inputValue]);
    // Determine if we're typing a tag value
    const { currentToken, tokenType, tokenPrefix } = React.useMemo(() => {
        const cursorPos = inputValue.length; // Command palette doesn't expose cursor position
        const beforeCursor = inputValue.slice(0, cursorPos);
        const lastSpaceIndex = beforeCursor.lastIndexOf(" ");
        const currentToken = beforeCursor.slice(lastSpaceIndex + 1);
        const colonIndex = currentToken.indexOf(":");
        if (colonIndex > 0) {
            const key = currentToken.slice(0, colonIndex);
            const valuePrefix = currentToken.slice(colonIndex + 1);
            return {
                currentToken,
                tokenType: "value",
                tokenPrefix: { key, valuePrefix },
            };
        }
        return {
            currentToken,
            tokenType: "key",
            tokenPrefix: null,
        };
    }, [inputValue]);
    // Get tag values for autocomplete
    const activeTagField = tokenType === "value" ? tokenPrefix?.key : undefined;
    const { data: tagValuesData } = useTagValues(activeTagField ?? "", !!activeTagField && tagFields.includes(activeTagField ?? ""));
    const tagValues = tagValuesData?.values ?? [];
    // Search jobs
    const { data: searchData, isLoading: isSearching } = useSearch(inputValue);
    const jobResults = searchData?.results ?? [];
    // Filter navigation items by query
    const filteredNavigation = React.useMemo(() => {
        if (!inputValue.trim())
            return navigationItems;
        const query = inputValue.toLowerCase();
        return navigationItems.filter((item) => item.label.toLowerCase().includes(query) ||
            item.keywords.some((kw) => kw.toLowerCase().includes(query)));
    }, [inputValue]);
    // Filter queues by query
    const filteredQueues = React.useMemo(() => {
        if (!inputValue.trim())
            return queues;
        const query = inputValue.toLowerCase();
        return queues.filter((q) => q.toLowerCase().includes(query));
    }, [inputValue, queues]);
    // Check if query matches a tag key
    const matchingTagKeys = React.useMemo(() => {
        if (tokenType !== "key" || !currentToken)
            return [];
        return tagFields.filter((field) => field.toLowerCase().startsWith(currentToken.toLowerCase()));
    }, [tokenType, currentToken, tagFields]);
    // Filter tag values by prefix
    const filteredTagValues = React.useMemo(() => {
        if (tokenType !== "value" || !tokenPrefix)
            return [];
        const prefix = tokenPrefix.valuePrefix.toLowerCase();
        return tagValues
            .filter((tv) => tv.value.toLowerCase().startsWith(prefix))
            .slice(0, 10);
    }, [tokenType, tokenPrefix, tagValues]);
    const _hasResults = filteredNavigation.length > 0 ||
        filteredQueues.length > 0 ||
        jobResults.length > 0 ||
        matchingTagKeys.length > 0 ||
        filteredTagValues.length > 0;
    return (_jsxs(CommandDialog, { open: open, onOpenChange: onOpenChange, children: [_jsx(CommandInput, { placeholder: "Search jobs, queues, tags, or navigate...", value: inputValue, onValueChange: handleInputChange }), _jsxs(CommandList, { children: [_jsx(CommandEmpty, { children: isSearching ? "Searching..." : "No results found." }), matchingTagKeys.length > 0 && (_jsx(CommandGroup, { heading: "Tag Fields", children: matchingTagKeys.map((key) => (_jsxs(CommandItem, { value: `tag-key-${key}`, onSelect: () => {
                                const newValue = inputValue.replace(currentToken, `${key}:`);
                                handleInputChange(newValue);
                            }, children: [_jsx(Search, { className: "mr-2 h-4 w-4" }), _jsxs("span", { className: "font-mono", children: [key, ":"] }), _jsx("span", { className: "ml-2 text-xs text-muted-foreground", children: "tag field" })] }, key))) })), filteredTagValues.length > 0 && (_jsx(CommandGroup, { heading: `${tokenPrefix?.key} values`, children: filteredTagValues.map((tv) => {
                            const fullValue = `${tokenPrefix?.key}:${tv.value}`;
                            return (_jsxs(CommandItem, { value: `tag-value-${tv.value}`, onSelect: () => {
                                    const beforeColon = inputValue.slice(0, inputValue.lastIndexOf(currentToken));
                                    const newValue = `${beforeColon}${fullValue} `.trim();
                                    handleInputChange(newValue);
                                }, children: [_jsx(Search, { className: "mr-2 h-4 w-4" }), _jsx("span", { className: "font-mono", children: fullValue }), tv.count > 0 && (_jsxs("span", { className: "ml-2 text-xs text-muted-foreground", children: [tv.count, " jobs"] }))] }, tv.value));
                        }) })), filteredNavigation.length > 0 && (_jsx(CommandGroup, { heading: "Navigation", children: filteredNavigation.map((item) => (_jsxs(CommandItem, { value: `nav-${item.id}`, onSelect: () => {
                                onNavigate(item.path);
                                onOpenChange(false);
                            }, children: [item.icon, _jsx("span", { children: item.label }), _jsx(ArrowRight, { className: "ml-auto h-4 w-4 text-muted-foreground" })] }, item.id))) })), filteredQueues.length > 0 && (_jsx(CommandGroup, { heading: "Queues", children: filteredQueues.map((queue) => (_jsxs(CommandItem, { value: `queue-${queue}`, onSelect: () => {
                                onSelectQueue(queue);
                                onOpenChange(false);
                            }, children: [_jsx(Layers, { className: "mr-2 h-4 w-4" }), _jsx("span", { className: "font-mono", children: queue })] }, queue))) })), jobResults.length > 0 && (_jsx(CommandGroup, { heading: `Jobs (${jobResults.length})`, children: jobResults.map((result) => (_jsxs(CommandItem, { value: `job-${result.job.id}`, onSelect: () => {
                                onSelectJob(result.queue, result.job.id);
                                onOpenChange(false);
                            }, children: [_jsx(FileText, { className: "mr-2 h-4 w-4" }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col gap-0.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-medium", children: result.job.name }), _jsx("span", { className: "text-xs text-muted-foreground", children: formatRelativeTime(result.job.timestamp) })] }), _jsxs("span", { className: "truncate font-mono text-xs text-muted-foreground", children: [truncate(result.job.id, 30), " \u00B7 ", result.queue] })] }), _jsx(StatusDot, { status: result.job.status })] }, `${result.queue}-${result.job.id}`))) })), !inputValue.trim() && (_jsxs(_Fragment, { children: [_jsx(CommandSeparator, {}), _jsxs(CommandGroup, { heading: "Actions", children: [_jsxs(CommandItem, { value: "refresh", onSelect: () => {
                                            window.location.reload();
                                        }, children: [_jsx(RefreshCw, { className: "mr-2 h-4 w-4" }), _jsx("span", { children: "Refresh" }), _jsxs("kbd", { className: "ml-auto pointer-events-none flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100", children: [_jsx("span", { className: "text-xs", children: "\u2318" }), "R"] })] }), _jsxs(CommandItem, { value: "theme", onSelect: () => {
                                            onToggleTheme();
                                        }, children: [isDark ? (_jsx(Sun, { className: "mr-2 h-4 w-4" })) : (_jsx(Moon, { className: "mr-2 h-4 w-4" })), _jsx("span", { children: "Toggle Theme" }), _jsxs("kbd", { className: "ml-auto pointer-events-none flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100", children: [_jsx("span", { className: "text-xs", children: "\u2318" }), "\u21E7T"] })] })] })] }))] })] }));
}
function StatusDot({ status }) {
    const colors = {
        completed: "bg-success",
        active: "bg-warning",
        waiting: "bg-muted-foreground",
        delayed: "bg-muted-foreground",
        failed: "bg-destructive",
    };
    return (_jsx("span", { className: `h-2 w-2 rounded-full ${colors[status] || "bg-muted-foreground"}` }));
}
