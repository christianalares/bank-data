import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export function EmptyState({ icon: Icon, title, description, action, className, }) {
    return (_jsxs("div", { className: cn("flex flex-col items-center justify-center py-12 text-center", className), children: [_jsx("div", { className: "bg-muted p-4 mb-4", children: _jsx(Icon, { className: "h-8 w-8 text-muted-foreground" }) }), _jsx("h3", { className: "font-medium text-lg mb-1", children: title }), description && (_jsx("p", { className: "text-sm text-muted-foreground max-w-sm mb-4", children: description })), action] }));
}
