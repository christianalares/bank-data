import type * as React from "react";
interface ShellProps {
    children: React.ReactNode;
    className?: string;
}
export declare function Shell({ children, className }: ShellProps): import("react/jsx-runtime").JSX.Element;
interface ShellSidebarProps {
    children: React.ReactNode;
    collapsed?: boolean;
}
export declare function ShellSidebar({ children, collapsed }: ShellSidebarProps): import("react/jsx-runtime").JSX.Element;
export declare function ShellContent({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function ShellHeader({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function ShellMain({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=shell.d.ts.map