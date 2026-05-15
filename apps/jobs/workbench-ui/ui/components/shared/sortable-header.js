import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
/**
 * Hook for managing sort state
 * Returns current sort state, handler for SortableHeader, and the sort string for URL/API
 */
export function useSort(sortString, onSortChange) {
    const currentSort = React.useMemo(() => parseSort(sortString), [sortString]);
    const handleSort = React.useCallback((field, direction) => {
        if (field && direction) {
            onSortChange(`${field}:${direction}`);
        }
        else {
            onSortChange(undefined);
        }
    }, [onSortChange]);
    return { currentSort, handleSort, sortString };
}
/**
 * Sortable table header component
 * Displays sort direction indicator and toggles direction on click
 * Cycle: unsorted -> desc -> asc -> unsorted
 */
export function SortableHeader({ field, label, currentSort, onSort, className, }) {
    const isActive = currentSort?.field === field;
    const direction = isActive ? currentSort.direction : undefined;
    const handleClick = () => {
        if (!isActive) {
            // First click: sort descending (newest/highest first)
            onSort(field, "desc");
        }
        else if (direction === "desc") {
            // Second click: sort ascending
            onSort(field, "asc");
        }
        else {
            // Third click: clear sort (reset to default)
            onSort(undefined, undefined);
        }
    };
    return (_jsxs("button", { type: "button", onClick: handleClick, className: cn("flex items-center gap-1 text-left font-medium transition-colors hover:text-foreground", isActive ? "text-foreground" : "text-muted-foreground", className), children: [label, _jsx("span", { className: "inline-flex h-4 w-4 items-center justify-center", children: isActive ? (direction === "asc" ? (_jsx(ArrowUp, { className: "h-3 w-3" })) : (_jsx(ArrowDown, { className: "h-3 w-3" }))) : (_jsx(ArrowUpDown, { className: "h-3 w-3 opacity-50" })) })] }));
}
/**
 * Helper to parse sort string into SortState
 */
export function parseSort(sort) {
    if (!sort)
        return undefined;
    const [field, dir] = sort.split(":");
    if (!field)
        return undefined;
    return { field, direction: dir === "asc" ? "asc" : "desc" };
}
/**
 * Helper to create sort string from field and direction
 */
export function createSort(field, direction) {
    return `${field}:${direction}`;
}
