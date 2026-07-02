import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Key, Bell, Menu, X, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'sonner';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Todos', href: '/todos', icon: CheckSquare },
    { name: 'Reminders', href: '/reminders', icon: Bell },
    { name: 'API Keys', href: '/api-keys', icon: Key },
  ];

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
  };

  const userName =
    user?.discriminator && user.discriminator !== '0'
      ? `${user.username}#${user.discriminator}`
      : user?.username;

  return (
    <div className="app-shell">
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-64 flex-col bg-panel sidebar-enter ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5"
            >
              <img
                className="h-7 w-7 rounded-md object-contain"
                src="/bot_icon.png"
                alt="Aethel"
              />
              <span className="text-base font-semibold text-ink">Aethel</span>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md p-1.5 text-muted hover:bg-panel-hover"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <SidebarNav
            navigation={navigation}
            location={location}
            onNavigate={() => setMobileMenuOpen(false)}
          />
          <SidebarFooter
            user={user}
            userName={userName}
            onLogout={handleLogout}
          />
        </div>
      </div>

      <header className="top-bar">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-panel-hover hover:text-ink lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5"
        >
          <img
            className="h-7 w-7 rounded-md object-contain"
            src="/bot_icon.png"
            alt="Aethel"
          />
          <span className="text-base font-semibold text-ink">Aethel</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <aside className="sidebar hidden lg:flex">
        <SidebarNav
          navigation={navigation}
          location={location}
        />
        <SidebarFooter
          user={user}
          userName={userName}
          onLogout={handleLogout}
        />
      </aside>

      <main className="main-content">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
};
export default Layout;

function SidebarNav({
  navigation,
  location,
  onNavigate,
}: {
  navigation: { name: string; href: string; icon: typeof LayoutDashboard }[];
  location: { pathname: string };
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Menu
      </p>
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-100 ${
              isActive
                ? 'bg-accent-tint-panel text-accent'
                : 'text-muted hover:bg-panel-hover hover:text-ink'
            }`}
          >
            <Icon
              className={`h-[18px] w-[18px] flex-shrink-0 ${
                isActive ? 'text-accent' : 'text-faint group-hover:text-ink'
              }`}
            />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  user,
  userName,
  onLogout,
}: {
  user: { id: string; avatar: string | null; email?: string } | null;
  userName?: string;
  onLogout: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        {user?.avatar ? (
          <img
            className="h-8 w-8 rounded-full object-cover"
            src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
            alt={userName}
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
            <User className="h-4 w-4 text-accent-contrast" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{userName}</p>
          {user?.email && <p className="truncate text-xs text-faint">{user.email}</p>}
        </div>
        <button
          onClick={onLogout}
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger-tint hover:text-danger"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
