import { Link, type LinkProps, useMatchRoute } from '@tanstack/react-router'

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

const navItems: NavItem[] = [
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

const footerItems: NavItem[] = [
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

export function AppSidebar() {
  const matchRoute = useMatchRoute()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-16 justify-center border-b py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-none bg-primary text-sm font-bold text-primary-foreground">
                  H
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-semibold">Bank Data</span>
                  <span className="text-xs text-muted-foreground">Private</span>
                </div>
              </Link>
            </SidebarMenuButton>
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
    </Sidebar>
  )
}
