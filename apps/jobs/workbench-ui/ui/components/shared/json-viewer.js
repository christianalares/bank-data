import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Check, ChevronRight, Copy } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
export function JsonViewer({ data, className, defaultExpanded = true, }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (_jsxs("div", { className: cn("relative group", className), children: [_jsx("button", { type: "button", onClick: handleCopy, className: "absolute right-3 top-3 rounded p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100", children: copied ? (_jsx(Check, { size: 16, className: "h-4 w-4 text-status-success" })) : (_jsx(Copy, { className: "h-4 w-4 text-muted-foreground" })) }), _jsx("div", { className: "max-h-96 overflow-auto p-4 font-mono text-sm", children: _jsx(JsonNode, { data: data, level: 0, defaultExpanded: defaultExpanded }) })] }));
}
function JsonNode({ data, level, defaultExpanded, keyName }) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);
    const KeyLabel = ({ name }) => (_jsxs("span", { className: "text-primary", children: ["\"", name, "\""] }));
    if (data === null) {
        return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-muted-foreground italic", children: "null" })] }));
    }
    if (data === undefined) {
        return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-muted-foreground italic", children: "undefined" })] }));
    }
    if (typeof data === "boolean") {
        return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-status-warning", children: String(data) })] }));
    }
    if (typeof data === "number") {
        return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-status-success", children: data })] }));
    }
    if (typeof data === "string") {
        return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsxs("span", { className: "text-chart-5", children: ["\"", data, "\""] })] }));
    }
    if (Array.isArray(data)) {
        if (data.length === 0) {
            return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-muted-foreground", children: "[]" })] }));
        }
        return (_jsxs("div", { children: [_jsxs("button", { type: "button", onClick: () => setExpanded(!expanded), className: "inline-flex items-center gap-1 hover:opacity-70", children: [_jsx(ChevronRight, { className: cn("h-3 w-3 text-muted-foreground transition-transform", expanded && "rotate-90") }), keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsxs("span", { className: "text-muted-foreground", children: ["Array(", data.length, ")"] })] }), expanded && (_jsx("div", { className: "ml-4 mt-1 space-y-1 border-l border-border pl-3", children: data.map((item, index) => (_jsx("div", { children: _jsx(JsonNode, { data: item, level: level + 1, defaultExpanded: level < 1, keyName: String(index) }) }, index.toString()))) }))] }));
    }
    if (typeof data === "object") {
        const entries = Object.entries(data);
        if (entries.length === 0) {
            return (_jsxs("span", { children: [keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsx("span", { className: "text-muted-foreground", children: "{}" })] }));
        }
        return (_jsxs("div", { children: [_jsxs("button", { type: "button", onClick: () => setExpanded(!expanded), className: "inline-flex items-center gap-1 hover:opacity-70", children: [_jsx(ChevronRight, { className: cn("h-3 w-3 text-muted-foreground transition-transform", expanded && "rotate-90") }), keyName && (_jsxs(_Fragment, { children: [_jsx(KeyLabel, { name: keyName }), _jsx("span", { className: "text-foreground", children: ": " })] })), _jsxs("span", { className: "text-muted-foreground", children: ["Object(", entries.length, ")"] })] }), expanded && (_jsx("div", { className: "ml-4 mt-1 space-y-1 border-l border-border pl-3", children: entries.map(([key, value]) => (_jsx("div", { children: _jsx(JsonNode, { data: value, level: level + 1, defaultExpanded: level < 1, keyName: key }) }, key))) }))] }));
    }
    return _jsx("span", { children: String(data) });
}
