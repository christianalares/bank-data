"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MoreVertical, RotateCcw, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Portal } from "./portal";
export function BulkBottomBar({ selection, onClear, onRetry, onDelete, onPromote, isRetrying, isDeleting, isPromoting, className, }) {
    const isLoading = isRetrying || isDeleting || isPromoting;
    // Check what types of jobs are selected
    const hasFailedJobs = selection.some((s) => s.status === "failed");
    const hasDelayedJobs = selection.some((s) => s.status === "delayed");
    // Count by status for display
    const failedCount = selection.filter((s) => s.status === "failed").length;
    const delayedCount = selection.filter((s) => s.status === "delayed").length;
    return (_jsx(AnimatePresence, { children: selection.length > 0 && (_jsx(Portal, { children: _jsx(motion.div, { className: cn("fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none", className), initial: { y: 100, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 100, opacity: 0 }, transition: { duration: 0.2, ease: "easeOut" }, children: _jsxs("div", { className: "relative pointer-events-auto min-w-[400px] h-12", children: [_jsx(motion.div, { className: "absolute inset-0 backdrop-blur-xl bg-background/70 shadow-lg border border-border/50", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }), _jsxs("div", { className: "relative h-12 flex items-center justify-between px-4", children: [_jsxs("span", { className: "text-xs text-foreground", children: [selection.length, " selected"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: onClear, disabled: isLoading, className: "text-xs text-muted-foreground hover:text-foreground hover:bg-transparent", children: "Deselect all" }), (onPromote && hasDelayedJobs) ||
                                            (onRetry && hasFailedJobs) ||
                                            onDelete ? (_jsx(MoreVertical, { className: "h-3 w-3 text-muted-foreground/50" })) : null, onPromote && hasDelayedJobs && (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "ghost", size: "sm", onClick: onPromote, disabled: isLoading, className: "text-xs text-muted-foreground hover:text-foreground hover:bg-transparent", children: [isPromoting ? (_jsx(Loader2, { className: "mr-1 h-3 w-3 animate-spin" })) : (_jsx(Zap, { className: "mr-1 h-3 w-3" })), "Promote", delayedCount < selection.length &&
                                                            ` (${delayedCount})`] }), (onRetry && hasFailedJobs) || onDelete ? (_jsx(MoreVertical, { className: "h-3 w-3 text-muted-foreground/50" })) : null] })), onRetry && hasFailedJobs && (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "ghost", size: "sm", onClick: onRetry, disabled: isLoading, className: "text-xs text-muted-foreground hover:text-foreground hover:bg-transparent", children: [isRetrying ? (_jsx(Loader2, { className: "mr-1 h-3 w-3 animate-spin" })) : (_jsx(RotateCcw, { className: "mr-1 h-3 w-3" })), "Retry", failedCount < selection.length && ` (${failedCount})`] }), onDelete ? (_jsx(MoreVertical, { className: "h-3 w-3 text-muted-foreground/50" })) : null] })), onDelete && (_jsxs(Button, { variant: "ghost", size: "sm", onClick: onDelete, disabled: isLoading, className: "text-xs text-muted-foreground hover:text-foreground hover:bg-transparent", children: [isDeleting ? (_jsx(Loader2, { className: "mr-1 h-3 w-3 animate-spin" })) : (_jsx(Trash2, { className: "mr-1 h-3 w-3" })), "Delete"] }))] })] })] }) }) })) }));
}
