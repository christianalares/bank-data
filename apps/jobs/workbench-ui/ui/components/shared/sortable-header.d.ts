export type SortDirection = "asc" | "desc";
export interface SortState {
    field: string;
    direction: SortDirection;
}
/**
 * Hook for managing sort state
 * Returns current sort state, handler for SortableHeader, and the sort string for URL/API
 */
export declare function useSort(sortString: string | undefined, onSortChange: (sort: string | undefined) => void): {
    currentSort: SortState | undefined;
    handleSort: (field: string | undefined, direction: SortDirection | undefined) => void;
    sortString: string | undefined;
};
interface SortableHeaderProps {
    field: string;
    label: string;
    currentSort?: SortState;
    onSort: (field: string | undefined, direction: SortDirection | undefined) => void;
    className?: string;
}
/**
 * Sortable table header component
 * Displays sort direction indicator and toggles direction on click
 * Cycle: unsorted -> desc -> asc -> unsorted
 */
export declare function SortableHeader({ field, label, currentSort, onSort, className, }: SortableHeaderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Helper to parse sort string into SortState
 */
export declare function parseSort(sort?: string): SortState | undefined;
/**
 * Helper to create sort string from field and direction
 */
export declare function createSort(field: string, direction: SortDirection): string;
export {};
//# sourceMappingURL=sortable-header.d.ts.map