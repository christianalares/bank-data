import type { FlowNode as FlowNodeType } from "@/core/types";
export interface FlowNodeData extends Record<string, unknown> {
    flowNode: FlowNodeType;
    onClick?: (flowNode: FlowNodeType) => void;
}
interface FlowNodeProps {
    data: FlowNodeData;
}
declare function FlowNodeComponent({ data }: FlowNodeProps): import("react/jsx-runtime").JSX.Element;
export declare const FlowNodeMemo: import("react").MemoExoticComponent<typeof FlowNodeComponent>;
export {};
//# sourceMappingURL=flow-node.d.ts.map