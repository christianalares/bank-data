import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Search } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
export function HeaderSearch({ value, onValueChange, onFocus, placeholder = "Search anything...", className, }) {
    const inputRef = React.useRef(null);
    const handleKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            onFocus?.();
        }
    };
    return (_jsxs("div", { className: cn("relative flex items-center", className), children: [_jsx(Search, { className: "absolute left-2 h-4 w-4 text-foreground/60 pointer-events-none" }), _jsx(Input, { ref: inputRef, type: "text", value: value, onChange: (e) => onValueChange(e.target.value), onFocus: onFocus, onKeyDown: handleKeyDown, placeholder: placeholder, className: "h-8 w-64 pl-8 pr-20 text-[10px] bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none !text-foreground placeholder:text-foreground/30" }), _jsxs("kbd", { className: "absolute right-2 hidden h-5 items-center gap-1 rounded-none border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex pointer-events-none", children: [_jsx("span", { className: "text-xs", children: "\u2318" }), "K"] })] }));
}
