type NavItem = "runs" | "schedulers" | "queues" | "test";
interface SidebarProps {
    queues: string[];
    activeNav: NavItem;
    activeQueue?: string;
    onNavSelect: (nav: NavItem) => void;
    onQueueSelect: (queue: string) => void;
    isDark: boolean;
    onToggleTheme: () => void;
    title?: string;
    collapsed: boolean;
    onToggleCollapse: () => void;
}
export declare function Sidebar({ queues, activeNav, activeQueue, onNavSelect, onQueueSelect, isDark, onToggleTheme, title, collapsed, onToggleCollapse, }: SidebarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=sidebar.d.ts.map