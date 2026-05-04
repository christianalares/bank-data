import { createFileRoute } from '@tanstack/react-router'

import { ModulePage } from '#/components/module-page'

export const Route = createFileRoute('/app/exports')({
  component: ExportsPage,
})

function ExportsPage() {
  return (
    <ModulePage
      title="Exports"
      description="Background accountant export jobs will package CSVs and receipt attachments."
      status="placeholder"
      stats={[
        {
          label: 'Ready exports',
          value: '0',
          description: 'Export artifacts will be stored in the bucket.',
        },
        {
          label: 'Running jobs',
          value: '0',
          description: 'BullMQ will track export progress and retries.',
        },
        {
          label: 'Last export',
          value: 'Never',
          description: 'Date range export lands after tracker, banking, and inbox slices.',
        },
      ]}
    />
  )
}
