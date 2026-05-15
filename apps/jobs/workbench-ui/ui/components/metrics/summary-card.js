import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
/**
 * Simple sparkline chart using SVG
 */
function Sparkline({ data, className, color = "default" }) {
    if (data.length === 0)
        return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 80;
    const height = 24;
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    });
    const pathD = `M ${points.join(" L ")}`;
    // Create gradient area
    const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(" ");
    const colorClass = {
        default: "text-chart-1",
        success: "text-chart-success",
        danger: "text-chart-error",
        warning: "text-chart-4",
    }[color];
    const patternId = `sparkline-${color}-pattern`;
    const fillColorClass = {
        default: "fill-chart-1",
        success: "fill-chart-success",
        danger: "fill-chart-error",
        warning: "fill-chart-4",
    }[color];
    const strokeColorClass = {
        default: "stroke-chart-1",
        success: "stroke-chart-success",
        danger: "stroke-chart-error",
        warning: "stroke-chart-4",
    }[color];
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: cn("w-20 h-6", className), preserveAspectRatio: "none", children: [_jsx("defs", { children: _jsxs("pattern", { id: patternId, x: "0", y: "0", width: "4", height: "4", patternUnits: "userSpaceOnUse", children: [_jsx("rect", { width: "4", height: "4", className: cn(fillColorClass, "opacity-15") }), _jsx("path", { d: "M0,0 L4,4 M-1,3 L3,7 M-1,-1 L5,5", className: strokeColorClass, strokeWidth: "0.75", opacity: "0.4" })] }) }), _jsx("polygon", { points: areaPoints, fill: `url(#${patternId})` }), _jsx("path", { d: pathD, fill: "none", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", className: cn("stroke-current", colorClass) })] }));
}
/**
 * Shows trend compared to previous period
 */
function TrendBadge({ current, previous, higherIsBetter = true, }) {
    if (previous === 0)
        return null;
    const change = ((current - previous) / previous) * 100;
    const isUp = change > 0;
    const isNeutral = Math.abs(change) < 1;
    const isGood = higherIsBetter ? isUp : !isUp;
    if (isNeutral) {
        return (_jsxs("span", { className: "inline-flex items-center text-xs text-muted-foreground", children: [_jsx(Minus, { className: "h-3 w-3 mr-0.5" }), "0%"] }));
    }
    return (_jsxs("span", { className: cn("inline-flex items-center text-xs font-medium", isGood ? "text-chart-success" : "text-chart-error"), children: [isUp ? (_jsx(ArrowUp, { className: "h-3 w-3 mr-0.5" })) : (_jsx(ArrowDown, { className: "h-3 w-3 mr-0.5" })), Math.abs(change).toFixed(0), "%"] }));
}
/**
 * Summary card with value, sparkline, and optional trend
 */
export function SummaryCard({ title, value, subtitle, sparklineData, sparklineColor = "default", trend, className, icon, }) {
    return (_jsxs("div", { className: cn("border border-dashed bg-card p-4 flex flex-col gap-2", className), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium uppercase tracking-wider text-muted-foreground", children: title }), icon && _jsx("span", { className: "text-muted-foreground", children: icon })] }), _jsxs("div", { className: "flex items-end justify-between gap-4", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-2xl font-semibold tabular-nums", children: value }), subtitle && (_jsx("span", { className: "text-xs text-muted-foreground", children: subtitle })), trend && (_jsx(TrendBadge, { current: trend.current, previous: trend.previous, higherIsBetter: trend.higherIsBetter }))] }), sparklineData && sparklineData.length > 0 && (_jsx(Sparkline, { data: sparklineData, color: sparklineColor }))] })] }));
}
