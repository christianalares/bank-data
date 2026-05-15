export type NavItem = "runs" | "metrics" | "schedulers" | "flows" | "queues" | "test";
interface AppSidebarProps {
    queues: string[];
    pausedQueues?: Set<string>;
    activeNav: NavItem;
    activeQueue?: string;
    onNavSelect: (nav: NavItem) => void;
    onQueueSelect: (queue: string) => void;
    isDark: boolean;
    onToggleTheme: () => void;
    title?: string;
}
export declare function AppSidebar({ queues, pausedQueues, activeNav, activeQueue, onNavSelect, onQueueSelect, isDark, onToggleTheme, }: AppSidebarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=app-sidebar.d.ts.map