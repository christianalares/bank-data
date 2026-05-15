import type { FlowNode as FlowNodeType } from "@/core/types";
import "@xyflow/react/dist/style.css";
interface FlowGraphProps {
    flow: FlowNodeType;
    onNodeClick?: (node: FlowNodeType) => void;
}
export declare function FlowGraph({ flow, onNodeClick }: FlowGraphProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=flow-graph.d.ts.map