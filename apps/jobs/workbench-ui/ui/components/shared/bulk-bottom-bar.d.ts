import type { JobStatus } from "@/core/types";
export interface BulkSelection {
    queueName: string;
    jobId: string;
    status: JobStatus;
}
interface BulkBottomBarProps {
    /** Selected items */
    selection: BulkSelection[];
    /** Clear selection callback */
    onClear: () => void;
    /** Retry selected jobs (only for failed) */
    onRetry?: () => void;
    /** Delete selected jobs */
    onDelete?: () => void;
    /** Promote selected jobs (only for delayed) */
    onPromote?: () => void;
    /** Loading state for retry */
    isRetrying?: boolean;
    /** Loading state for delete */
    isDeleting?: boolean;
    /** Loading state for promote */
    isPromoting?: boolean;
    /** Optional class name */
    className?: string;
}
export declare function BulkBottomBar({ selection, onClear, onRetry, onDelete, onPromote, isRetrying, isDeleting, isPromoting, className, }: BulkBottomBarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=bulk-bottom-bar.d.ts.map