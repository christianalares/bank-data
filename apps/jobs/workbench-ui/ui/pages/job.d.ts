import type { JobSearch } from "@/router";
interface JobPageProps {
    queueName: string;
    jobId: string;
    readonly?: boolean;
    search: JobSearch;
    onSearchChange: (search: JobSearch) => void;
    onBack: () => void;
    onClone: (queueName: string, jobName: string, payload: string) => void;
}
export declare function JobPage({ queueName, jobId, readonly, search, onSearchChange, onBack, onClone, }: JobPageProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=job.d.ts.map