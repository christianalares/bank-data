import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertCircle, CheckCircle, FlaskConical } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { useTestJob } from "@/lib/hooks";
import { cn } from "@/lib/utils";
export function TestPage({ queues, readonly, prefill }) {
    const testJobMutation = useTestJob();
    const [queueName, setQueueName] = React.useState(prefill?.queue || queues[0] || "");
    const [jobName, setJobName] = React.useState(prefill?.jobName || "test-job");
    const [payload, setPayload] = React.useState(prefill?.payload || '{\n  "message": "Hello from Workbench"\n}');
    const [delay, setDelay] = React.useState("");
    const [result, setResult] = React.useState(null);
    // Update state when prefill changes (e.g., navigating from clone)
    React.useEffect(() => {
        if (prefill?.queue)
            setQueueName(prefill.queue);
        if (prefill?.jobName)
            setJobName(prefill.jobName);
        if (prefill?.payload)
            setPayload(prefill.payload);
    }, [prefill?.queue, prefill?.jobName, prefill?.payload]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!queueName || !jobName) {
            setResult({ success: false, message: "Queue and job name are required" });
            return;
        }
        let parsedPayload;
        try {
            parsedPayload = JSON.parse(payload);
        }
        catch {
            setResult({ success: false, message: "Invalid JSON payload" });
            return;
        }
        setResult(null);
        testJobMutation.mutate({
            queueName,
            name: jobName,
            data: parsedPayload,
            delay: delay ? Number(delay) * 1000 : undefined,
        }, {
            onSuccess: (response) => {
                setResult({
                    success: true,
                    message: `Job enqueued with ID: ${response.id}`,
                });
            },
            onError: (error) => {
                setResult({ success: false, message: error.message });
            },
        });
    };
    if (readonly) {
        return (_jsxs("div", { className: "flex h-[400px] flex-col items-center justify-center text-center", children: [_jsx(FlaskConical, { className: "mb-4 h-12 w-12 text-muted-foreground" }), _jsx("h2", { className: "mb-2 text-lg font-medium", children: "Test Mode Disabled" }), _jsx("p", { className: "max-w-md text-muted-foreground", children: "The dashboard is in readonly mode. Job testing is disabled." })] }));
    }
    return (_jsxs("div", { className: "max-w-2xl", children: [_jsx("div", { className: "mb-6", children: _jsx("p", { className: "text-sm text-muted-foreground", children: "Manually enqueue a job for testing purposes" }) }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: "queue", className: "text-sm font-medium", children: "Queue" }), _jsxs(Select, { value: queueName, onValueChange: setQueueName, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select a queue" }) }), _jsx(SelectContent, { children: queues.map((queue) => (_jsx(SelectItem, { value: queue, children: queue }, queue))) })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: "jobName", className: "text-sm font-medium", children: "Job Name" }), _jsx("input", { type: "text", value: jobName, onChange: (e) => setJobName(e.target.value), className: "h-9 w-full border bg-background px-3 text-sm focus:outline-none", placeholder: "my-job-name" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: "delay", className: "text-sm font-medium", children: "Delay (seconds)" }), _jsx("input", { type: "number", value: delay, onChange: (e) => setDelay(e.target.value), className: "h-9 w-full border bg-background px-3 text-sm focus:outline-none", placeholder: "0", min: "0" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Optional delay before the job is processed" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { htmlFor: "payload", className: "text-sm font-medium", children: "Payload (JSON)" }), _jsx("textarea", { value: payload, onChange: (e) => setPayload(e.target.value), className: "h-48 w-full resize-none border bg-background px-3 py-2 font-mono text-sm focus:outline-none", placeholder: '{ "key": "value" }' })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Button, { type: "submit", disabled: testJobMutation.isPending, children: testJobMutation.isPending ? _jsx(_Fragment, { children: "Processing..." }) : _jsx(_Fragment, { children: "Enqueue Job" }) }), result && (_jsxs("div", { className: cn("flex items-center gap-2 text-sm", result.success ? "text-success" : "text-destructive"), children: [result.success ? (_jsx(CheckCircle, { className: "h-4 w-4" })) : (_jsx(AlertCircle, { className: "h-4 w-4" })), result.message] }))] })] })] }));
}
