import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  CheckSquare, 
  Key, 
  Bell,
  Menu, 
  X, 
  LogOut
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { toast } from 'sonner'


interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Todos', href: '/todos', icon: CheckSquare },
    { name: 'Reminders', href: '/reminders', icon: Bell },
    { name: 'API Keys', href: '/api-keys', icon: Key },
  ]

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
        sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <div className="fixed inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
        <div className={`fixed inset-y-0 left-0 flex w-64 flex-col bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-r border-slate-200/50 dark:border-slate-700/50 shadow-xl transform transition-transform duration-300 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200/50 dark:border-slate-700/50">
             <div className="flex items-center space-x-3">
               <img
                 className="w-7 h-7 rounded-lg"
                 src="/bot_icon.png"
                 alt="Aethel Bot"
               />
               <h1 className="text-lg font-bold text-slate-900 dark:text-white">Aethel</h1>
             </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                     isActive
                       ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                       : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                   }`}
                >
                  <Icon className={`mr-3 h-4 w-4 flex-shrink-0 ${
                     isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-500'
                   }`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-r border-slate-200/50 dark:border-slate-700/50">
          <div className="flex h-14 items-center px-5 border-b border-slate-200/50 dark:border-slate-700/50">
             <div className="flex items-center space-x-3">
               <img
                 className="w-7 h-7 rounded-lg"
                 src="/bot_icon.png"
                 alt="Aethel Bot"
               />
               <h1 className="text-lg font-bold text-slate-900 dark:text-white">Aethel</h1>
             </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                     isActive
                       ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                       : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                   }`}
                >
                  <Icon className={`mr-3 h-4 w-4 flex-shrink-0 ${
                     isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-500'
                   }`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>
          
          <div className="border-t border-slate-200/50 dark:border-slate-700/50 p-4">
            <div className="flex items-center mb-4 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div className="flex-shrink-0">
                {user?.avatar ? (
                  <img
                    className="h-9 w-9 rounded-full ring-2 ring-slate-200 dark:ring-slate-600"
                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                    alt={user.username}
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-2 ring-slate-200 dark:ring-slate-600">
                    <img
                      className="h-5 w-5"
                      src="/bot_icon.png"
                      alt="Bot Icon"
                    />
                  </div>
                )}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user?.discriminator && user.discriminator !== '0' 
                    ? `${user.username}#${user.discriminator}` 
                    : user?.username}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 group"
            >
              <LogOut className="mr-3 h-4 w-4 flex-shrink-0 group-hover:text-red-500" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-x-4 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-4 lg:hidden">
          <button
            type="button"
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center space-x-3">
            <img
              className="w-7 h-7 rounded-lg"
              src="/bot_icon.png"
              alt="Aethel Bot"
            />
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              Aethel
            </span>
          </div>
        </div>

        <main className="p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout