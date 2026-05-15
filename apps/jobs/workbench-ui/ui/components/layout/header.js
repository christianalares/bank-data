import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Header({ title, subtitle, onBack, onRefresh, actions, }) {
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-3 flex-1", children: [onBack && (_jsxs(Button, { variant: "ghost", size: "sm", onClick: onBack, children: [_jsx(ArrowLeft, { className: "h-4 w-4 mr-1" }), "Back"] })), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold", children: title }), subtitle && (_jsx("p", { className: "text-xs text-muted-foreground font-mono", children: subtitle }))] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [actions, onRefresh && (_jsxs(Button, { variant: "outline", size: "sm", onClick: onRefresh, children: [_jsx(RefreshCw, { className: "h-4 w-4 mr-1" }), "Refresh"] }))] })] }));
}
