import { Link, type LinkProps, useMatchRoute, useRouterState } from '@tanstack/react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Icon, type IconName } from '#/components/ui/icon'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '#/components/ui/sidebar'

type NavItem = {
  label: string
  to: LinkProps['to']
  icon: IconName
}

const businessNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/',
    icon: 'layoutDashboard',
  },
  {
    label: 'Transactions',
    to: '/transactions',
    icon: 'creditCard',
  },
  {
    label: 'Inbox',
    to: '/inbox',
    icon: 'inbox',
  },
  {
    label: 'Tracker',
    to: '/tracker',
    icon: 'timer',
  },
  {
    label: 'Exports',
    to: '/exports',
    icon: 'download',
  },
]

const businessFooterItems: NavItem[] = [
  {
    label: 'Settings',
    to: '/settings',
    icon: 'settings',
  },
  {
    label: 'Jobs',
    to: '/jobs',
    icon: 'listChecks',
  },
]

const personalNavItems: NavItem[] = [
  {
    label: 'Transactions',
    to: '/personal/transactions',
    icon: 'walletCards',
  },
  {
    label: 'Connections',
    to: '/personal/connections',
    icon: 'landmark',
  },
]

export function AppSidebar() {
  const matchRoute = useMatchRoute()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isPersonal = pathname.startsWith('/personal')
  const navItems = isPersonal ? personalNavItems : businessNavItems
  const footerItems = isPersonal ? [] : businessFooterItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-16 justify-center border-b py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Switch workspace">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-none bg-primary text-sm font-bold text-primary-foreground">
                    {isPersonal ? 'P' : 'H'}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-semibold">
                      {isPersonal ? 'Personal' : 'Hidden Village'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isPersonal ? 'Private finances' : 'Business'}
                    </span>
                  </div>
                  <Icon name="chevronsUpDown" className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56" side="bottom" align="start">
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <div className="flex size-7 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
                      H
                    </div>
                    <div className="flex flex-col">
                      <span>Hidden Village</span>
                      <span className="text-[11px] text-muted-foreground">Business</span>
                    </div>
                    {!isPersonal && <Icon name="check" className="ml-auto" />}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/personal/transactions">
                    <div className="flex size-7 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">
                      P
                    </div>
                    <div className="flex flex-col">
                      <span>Personal</span>
                      <span className="text-[11px] text-muted-foreground">Private finances</span>
                    </div>
                    {isPersonal && <Icon name="check" className="ml-auto" />}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={!!matchRoute({ to: item.to, fuzzy: item.to !== '/' })}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {footerItems.length > 0 && (
        <SidebarFooter>
          <SidebarSeparator />
          <SidebarMenu>
            {footerItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={!!matchRoute({ to: item.to })}
                  tooltip={item.label}
                >
                  <Link to={item.to}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
