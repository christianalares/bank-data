import { createFileRoute } from '@tanstack/react-router'

import { ModulePage } from '#/components/module-page'

export const Route = createFileRoute('/_protected/inbox')({
  component: InboxPage,
})

function InboxPage() {
  return (
    <ModulePage
      title="Inbox"
      description="Gmail receipt ingestion will create normalized inbox items and storage-backed attachments."
      status="placeholder"
      stats={[
        {
          label: 'Accounts',
          value: '0',
          description: 'Gmail OAuth is separate from Better Auth login.',
        },
        {
          label: 'Pending review',
          value: '0',
          description: 'Matching suggestions will surface here.',
        },
        {
          label: 'Attachments',
          value: '0',
          description: 'Files will live in Railway bucket storage.',
        },
      ]}
    />
  )
}
