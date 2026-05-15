import type * as React from "react";
interface SummaryCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    sparklineData?: number[];
    sparklineColor?: "default" | "success" | "danger" | "warning";
    trend?: {
        current: number;
        previous: number;
        higherIsBetter?: boolean;
    };
    className?: string;
    icon?: React.ReactNode;
}
/**
 * Summary card with value, sparkline, and optional trend
 */
export declare function SummaryCard({ title, value, subtitle, sparklineData, sparklineColor, trend, className, icon, }: SummaryCardProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=summary-card.d.ts.map