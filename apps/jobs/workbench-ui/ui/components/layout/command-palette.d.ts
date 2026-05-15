interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    queues: string[];
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    isDark: boolean;
    onToggleTheme: () => void;
    onSelectQueue: (queue: string) => void;
    onSelectJob: (queue: string, jobId: string) => void;
    onNavigate: (path: string) => void;
}
export declare function CommandPalette({ open, onOpenChange, queues, searchQuery, onSearchQueryChange, isDark, onToggleTheme, onSelectQueue, onSelectJob, onNavigate, }: CommandPaletteProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=command-palette.d.ts.map