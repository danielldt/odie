import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/strategies", label: "Strategies", icon: "⚡" },
  { path: "/settings", label: "Settings", icon: "⚙️" },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-900/80 backdrop-blur border-r border-surface-800 flex flex-col">
        <div className="p-6 border-b border-surface-800">
          <h1 className="text-2xl font-display font-bold text-primary-400">ODIE</h1>
          <p className="text-xs text-surface-500 mt-1">Polymarket Trading</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                location.pathname.startsWith(item.path)
                  ? "bg-primary-600/20 text-primary-400"
                  : "text-surface-400 hover:bg-surface-800 hover:text-surface-200"
              }`}
            >
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-800">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-sm font-medium text-surface-200 truncate">{user?.email}</p>
              <p className="text-xs text-surface-500">Connected</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-surface-400 hover:text-red-400 transition-colors"
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
