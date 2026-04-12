import { Link, useRouterState } from '@tanstack/react-router';
import {
  BarChart2,
  BookOpen,
  Calendar,
  FileText,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Blotter', icon: LayoutDashboard, tourId: 'sidebar-blotter' },
  { path: '/dashboard', label: 'Dashboard', icon: BarChart2, tourId: 'sidebar-dashboard' },
  { path: '/reviews', label: 'Reviews', icon: BookOpen },
  { path: '/import', label: 'Import', icon: Upload, tourId: 'sidebar-import' },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/trash', label: 'Trash', icon: Trash2 },
  { path: '/settings', label: 'Settings', icon: Settings, tourId: 'sidebar-settings' },
];

export function Sidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <aside className="flex h-full w-14 flex-col items-center border-r border-border bg-card py-3 lg:w-48 lg:items-start lg:px-3">
      {/* Logo */}
      <div className="mb-6 flex h-9 w-full items-center justify-center lg:justify-start lg:px-1">
        <TrendingUp className="h-5 w-5 text-primary shrink-0" />
        <span className="ml-2 hidden text-sm font-semibold tracking-tight text-foreground lg:block">
          Ledger
        </span>
      </div>

      {/* Nav */}
      <nav className="flex w-full flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              data-tour={item.tourId}
              className={cn(
                'flex h-9 w-full items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
              title={item.label}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
