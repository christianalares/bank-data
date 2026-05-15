"use client";
import * as React from "react";
import { createPortal } from "react-dom";
export function Portal({ children, container }) {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);
    if (!mounted) {
        return null;
    }
    return createPortal(children, container || document.body);
}
