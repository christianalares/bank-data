import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  Download,
  ExternalLink,
  File,
  Inbox,
  Landmark,
  LayoutDashboard,
  Link,
  ListChecks,
  type LucideProps,
  Mail,
  Maximize,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Timer,
  Trash2,
  Unlink,
  Upload,
  WalletCards,
  X,
} from 'lucide-react'

import { cn } from '#/lib/utils'

const icons = {
  check: Check,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsUpDown: ChevronsUpDown,
  creditCard: CreditCard,
  download: Download,
  externalLink: ExternalLink,
  file: File,
  inbox: Inbox,
  landmark: Landmark,
  layoutDashboard: LayoutDashboard,
  link: Link,
  listChecks: ListChecks,
  mail: Mail,
  maximize: Maximize,
  plus: Plus,
  refreshCw: RefreshCw,
  search: Search,
  settings: Settings,
  timer: Timer,
  trash: Trash2,
  unlink: Unlink,
  upload: Upload,
  walletCards: WalletCards,
  x: X,
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
