import { createFileRoute } from '@tanstack/react-router'

import { DashboardContent } from '#/components/dashboard-content'

export const Route = createFileRoute('/_protected/')({
  component: DashboardContent,
})
