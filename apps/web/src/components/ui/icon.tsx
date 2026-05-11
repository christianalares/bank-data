import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Inbox,
  LayoutDashboard,
  ListChecks,
  type LucideProps,
  Plus,
  Settings,
  Timer,
  Trash2,
} from 'lucide-react'

import { cn } from '#/lib/utils'

const icons = {
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  creditCard: CreditCard,
  download: Download,
  inbox: Inbox,
  layoutDashboard: LayoutDashboard,
  listChecks: ListChecks,
  plus: Plus,
  settings: Settings,
  timer: Timer,
  trash: Trash2,
}

export type IconName = keyof typeof icons

type IconProps = {
  name: IconName
  className?: string
} & LucideProps

export function Icon({ name, className, ...props }: IconProps) {
  const IconComponent = icons[name]

  return <IconComponent className={cn(className)} {...props} />
}
