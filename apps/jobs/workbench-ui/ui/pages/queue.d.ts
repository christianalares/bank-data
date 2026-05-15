import type { QueueSearch } from "@/router";
interface QueuePageProps {
    queueName: string;
    search: QueueSearch;
    onSearchChange: (search: QueueSearch) => void;
    onJobSelect: (jobId: string) => void;
}
export declare function QueuePage({ queueName, search, onSearchChange, onJobSelect, }: QueuePageProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=queue.d.ts.map