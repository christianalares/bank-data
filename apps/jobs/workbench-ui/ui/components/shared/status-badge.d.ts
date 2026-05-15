import type { JobStatus } from "@/core/types";
interface StatusBadgeProps {
    status: JobStatus;
    duration?: number;
    className?: string;
}
export declare function StatusBadge({ status, duration, className }: StatusBadgeProps): import("react/jsx-runtime").JSX.Element;
export declare function StatusDot({ status, className, }: {
    status: JobStatus;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function StatusText({ status, duration, className, }: {
    status: JobStatus;
    duration?: number;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=status-badge.d.ts.map