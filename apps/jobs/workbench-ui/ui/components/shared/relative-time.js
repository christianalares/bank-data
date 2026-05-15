import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@/components/ui/tooltip";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/utils";
export function RelativeTime({ timestamp, className }) {
    return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: className, children: formatRelativeTime(timestamp) }) }), _jsx(TooltipContent, { children: _jsx("span", { className: "font-mono text-xs", children: formatAbsoluteTime(timestamp) }) })] }));
}
