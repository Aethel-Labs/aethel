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
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-black text-gray-900 dark:text-gray-100 font-inter transition-colors duration-300">
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-pink-400 to-purple-500 dark:opacity-20" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full blur-xl md:blur-3xl opacity-30 bg-gradient-to-tr from-indigo-400 to-sky-500 dark:opacity-20" />
      
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-200 ${
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="fixed inset-0 bg-black/70"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`fixed inset-y-0 left-0 flex w-72 flex-col bg-white dark:bg-gray-800 backdrop-blur-md shadow-xl transform transition-transform duration-200 ease-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <img
                className="w-8 h-8 rounded-lg object-contain"
                src="/bot_icon.png"
                alt="Aethel Bot"
                style={{ imageRendering: 'crisp-edges' }}
              />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Aethel</h1>
            </div>
            <div className="flex items-center space-x-2">
              <ThemeToggle className="shadow-md" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-150"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <nav className="flex-1 px-4 py-6">
            <div className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      className={`mr-3 h-5 w-5 flex-shrink-0 ${
                        isActive
                          ? 'text-white'
                          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                      }`}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center mb-4 p-3 rounded-xl">
              <div className="flex-shrink-0">
                {user?.avatar ? (
                  <img
                    className="h-10 w-10 rounded-full"
                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                    alt={user.username}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user?.discriminator && user.discriminator !== '0'
                    ? `${user.username}#${user.discriminator}`
                    : user?.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-xl hover:bg-red-600 hover:text-white transition-all duration-150 group"
            >
              <LogOut className="mr-3 h-4 w-4 flex-shrink-0" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <header className="fixed top-4 left-8 right-8 lg:left-16 lg:right-16 xl:left-32 xl:right-32 z-40 bg-white dark:bg-gray-800 backdrop-blur-xl border border-gray-200 dark:border-gray-700 shadow-2xl rounded-2xl transition-colors duration-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                type="button"
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-150 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center space-x-3">
                <img
                  className="w-8 h-8 rounded-lg object-contain"
                  src="/bot_icon.png"
                  alt="Aethel Bot"
                  style={{ imageRendering: 'crisp-edges' }}
                />
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Aethel</h1>
              </div>
            </div>

            <nav className="hidden lg:flex lg:space-x-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`group flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      className={`mr-2 h-4 w-4 flex-shrink-0 ${
                        isActive
                          ? 'text-white'
                          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                      }`}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center space-x-4">
              <div className="hidden lg:flex items-center space-x-3 px-3 py-2 rounded-xl">
                <div className="flex-shrink-0">
                  {user?.avatar ? (
                    <img
                      className="h-8 w-8 rounded-full"
                      src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                      alt={user.username}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <div className="hidden xl:block">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user?.discriminator && user.discriminator !== '0'
                      ? `${user.username}#${user.discriminator}`
                      : user?.username}
                  </p>
                </div>
              </div>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="hidden lg:flex items-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-full hover:bg-red-600 hover:text-white transition-all duration-150"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
