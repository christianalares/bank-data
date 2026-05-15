export interface ParsedFilters {
    status?: string;
    tags: Record<string, string>;
    text: string;
}
interface SmartSearchProps {
    value: string;
    status?: string;
    onChange: (value: string, status?: string) => void;
    className?: string;
}
/**
 * Parse a search query into structured filters
 * e.g., "teamId:abc-123 invoice" -> { tags: { teamId: "abc-123" }, text: "invoice" }
 */
export declare function parseSearchQuery(query: string): ParsedFilters;
/**
 * Build a search query string from structured filters
 */
export declare function buildSearchQuery(filters: ParsedFilters): string;
export declare function SmartSearch({ value, status, onChange, className, }: SmartSearchProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=smart-search.d.ts.map