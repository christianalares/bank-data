import { ModulePage } from '#/components/module-page'

export function DashboardContent() {
  return (
    <ModulePage
      title="Dashboard"
      description="A private overview of time, banking, inbox processing, matching, and exports."
      status="placeholder"
      stats={[
        {
          label: 'Tracked this month',
          value: '0h',
          description: 'Tracker schema is ready for the first workflow.',
        },
        {
          label: 'Transactions',
          value: '0',
          description: 'CSV import and bank sync come next.',
        },
        {
          label: 'Inbox items',
          value: '0',
          description: 'Gmail ingestion will stay separate from app login.',
        },
      ]}
    />
  )
}
