import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Check, ChevronDown, Copy } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function StackTrace({ error, stacktrace, className }) {
    const [expanded, setExpanded] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    if (!error && (!stacktrace || stacktrace.length === 0)) {
        return null;
    }
    const fullText = [error, ...(stacktrace || [])].filter(Boolean).join("\n");
    const handleCopy = () => {
        navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (_jsxs("div", { className: cn("border border-destructive/20 bg-destructive/5", className), children: [_jsxs("div", { className: "p-4 flex items-start gap-3", children: [_jsx("div", { className: "flex-1 min-w-0", children: _jsx("p", { className: "font-medium text-destructive break-words", children: error || "Unknown error" }) }), _jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7", onClick: handleCopy, children: copied ? (_jsx(Check, { className: "h-3.5 w-3.5 text-success" })) : (_jsx(Copy, { className: "h-3.5 w-3.5" })) }), stacktrace && stacktrace.length > 0 && (_jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7", onClick: () => setExpanded(!expanded), children: _jsx(ChevronDown, { className: cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180") }) }))] })] }), expanded && stacktrace && stacktrace.length > 0 && (_jsx("div", { className: "border-t border-destructive/20 p-4", children: _jsx("pre", { className: "font-mono text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap", children: stacktrace.map((line, i) => (_jsx("div", { className: "hover:bg-destructive/10 px-1 -mx-1", children: formatStackLine(line) }, i.toString()))) }) }))] }));
}
function formatStackLine(line) {
    // Highlight file paths and line numbers
    const fileMatch = line.match(/at (.+?) \((.+?):(\d+):(\d+)\)/);
    if (fileMatch) {
        const [, fnName, filePath, lineNum, colNum] = fileMatch;
        return (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted-foreground", children: "at " }), _jsx("span", { className: "text-foreground", children: fnName }), _jsx("span", { className: "text-muted-foreground", children: " (" }), _jsx("span", { className: "text-primary", children: filePath }), _jsx("span", { className: "text-muted-foreground", children: ":" }), _jsx("span", { className: "text-warning", children: lineNum }), _jsx("span", { className: "text-muted-foreground", children: ":" }), _jsx("span", { className: "text-warning", children: colNum }), _jsx("span", { className: "text-muted-foreground", children: ")" })] }));
    }
    // Simple file path format
    const simpleMatch = line.match(/at (.+?):(\d+):(\d+)/);
    if (simpleMatch) {
        const [, filePath, lineNum, colNum] = simpleMatch;
        return (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted-foreground", children: "at " }), _jsx("span", { className: "text-primary", children: filePath }), _jsx("span", { className: "text-muted-foreground", children: ":" }), _jsx("span", { className: "text-warning", children: lineNum }), _jsx("span", { className: "text-muted-foreground", children: ":" }), _jsx("span", { className: "text-warning", children: colNum })] }));
    }
    return line;
}
