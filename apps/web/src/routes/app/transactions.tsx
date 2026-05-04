import { createFileRoute } from '@tanstack/react-router'

import { ModulePage } from '#/components/module-page'

export const Route = createFileRoute('/app/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  return (
    <ModulePage
      title="Transactions"
      description="CSV import first, GoCardless Sweden/EU bank sync after credentials are ready."
      status="placeholder"
      stats={[
        {
          label: 'Imported',
          value: '0',
          description: 'CSV import will prove normalization without bank credentials.',
        },
        {
          label: 'Connected accounts',
          value: '0',
          description: 'GoCardless connection is a later HITL-gated slice.',
        },
        {
          label: 'Sync status',
          value: 'Idle',
          description: 'BullMQ jobs will own banking sync work.',
        },
      ]}
    />
  )
}
