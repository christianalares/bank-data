import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type * as React from "react";
interface CheckboxProps extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
    indeterminate?: boolean;
}
declare function Checkbox({ className, indeterminate, checked, ...props }: CheckboxProps): import("react/jsx-runtime").JSX.Element;
export { Checkbox };
//# sourceMappingURL=checkbox.d.ts.map