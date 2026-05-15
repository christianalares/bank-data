import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export function Shell({ children, className }) {
    return (_jsx("div", { className: cn("flex h-screen bg-background", className), children: children }));
}
export function ShellSidebar({ children, collapsed }) {
    return (_jsx("aside", { className: cn("border-r border-border bg-card flex flex-col transition-all duration-200", collapsed ? "w-14" : "w-56"), children: children }));
}
export function ShellContent({ children }) {
    return (_jsx("main", { className: "flex-1 flex flex-col overflow-hidden", children: children }));
}
export function ShellHeader({ children }) {
    return (_jsx("header", { className: "h-14 border-b border-border flex items-center px-6 gap-4 shrink-0", children: children }));
}
export function ShellMain({ children }) {
    return _jsx("div", { className: "flex-1 overflow-auto p-6", children: children });
}
