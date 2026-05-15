import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
export type ChartConfig = {
    [k in string]: {
        label?: React.ReactNode;
        icon?: React.ComponentType;
        color?: string;
    };
};
type ChartContextProps = {
    config: ChartConfig;
};
declare function useChart(): ChartContextProps;
interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    config: ChartConfig;
    children: React.ReactNode;
}
declare const ChartContainer: React.ForwardRefExoticComponent<ChartContainerProps & React.RefAttributes<HTMLDivElement>>;
interface ChartTooltipContentProps {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: number;
        payload: Record<string, unknown>;
        color?: string;
        dataKey?: string;
    }>;
    label?: string;
    hideLabel?: boolean;
    indicator?: "line" | "dot" | "dashed";
    className?: string;
}
declare const ChartTooltipContent: React.ForwardRefExoticComponent<ChartTooltipContentProps & React.RefAttributes<HTMLDivElement>>;
export { Area, AreaChart, Bar, BarChart, CartesianGrid, ChartContainer, ChartTooltipContent, Legend, ResponsiveContainer, Tooltip, useChart, XAxis, YAxis, };
//# sourceMappingURL=chart.d.ts.map