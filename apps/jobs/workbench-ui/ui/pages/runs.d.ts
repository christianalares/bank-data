import type { RunsSearch } from "@/router";
interface RunsPageProps {
    search: RunsSearch;
    onSearchChange: (search: RunsSearch) => void;
    onJobSelect: (queueName: string, jobId: string) => void;
    onQueueSelect: (queueName: string) => void;
}
export declare function RunsPage({ search, onSearchChange, onJobSelect, onQueueSelect, }: RunsPageProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=runs.d.ts.map