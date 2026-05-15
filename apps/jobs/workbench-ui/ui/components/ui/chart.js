import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { cn } from "@/lib/utils";
const ChartContext = React.createContext(null);
function useChart() {
    const context = React.useContext(ChartContext);
    if (!context) {
        throw new Error("useChart must be used within a <ChartContainer />");
    }
    return context;
}
const ChartContainer = React.forwardRef(({ config, children, className, style, ...props }, ref) => {
    // Generate CSS variables from config
    const cssVars = React.useMemo(() => {
        const vars = {};
        for (const [key, value] of Object.entries(config)) {
            if (value.color) {
                vars[`--color-${key}`] = value.color;
            }
        }
        return vars;
    }, [config]);
    return (_jsx(ChartContext.Provider, { value: { config }, children: _jsx("div", { ref: ref, className: cn("flex aspect-video justify-center [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none", className), style: { ...cssVars, ...style }, ...props, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: children }) }) }));
});
ChartContainer.displayName = "ChartContainer";
const ChartTooltipContent = React.forwardRef(({ active, payload, label, hideLabel = false, indicator = "dot", className }, ref) => {
    const { config } = useChart();
    if (!active || !payload?.length) {
        return null;
    }
    return (_jsxs("div", { ref: ref, className: cn("border bg-background px-3 py-2 text-xs shadow-md", className), children: [!hideLabel && label && (_jsx("div", { className: "mb-1.5 font-medium", children: label })), _jsx("div", { className: "flex flex-col gap-1", children: payload.map((item, index) => {
                    const key = item.dataKey || item.name;
                    const itemConfig = config[key];
                    const indicatorColor = item.color || itemConfig?.color;
                    return (_jsxs("div", { className: "flex items-center gap-2", children: [indicator === "dot" && (_jsx("div", { className: "h-2 w-2 rounded-full", style: { backgroundColor: indicatorColor } })), indicator === "line" && (_jsx("div", { className: "h-0.5 w-3", style: { backgroundColor: indicatorColor } })), _jsxs("span", { className: "text-muted-foreground", children: [itemConfig?.label || key, ":"] }), _jsx("span", { className: "font-medium", children: item.value })] }, index.toString()));
                }) })] }));
});
ChartTooltipContent.displayName = "ChartTooltipContent";
// Re-export Recharts components
export { Area, AreaChart, Bar, BarChart, CartesianGrid, ChartContainer, ChartTooltipContent, Legend, ResponsiveContainer, Tooltip, useChart, XAxis, YAxis, };
