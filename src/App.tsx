import { createHashRouter, RouterProvider, Routes, Route, Navigate, Link, Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { useSawyerStorage } from '@/src/hooks/use-sawyer-storage';
import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Lock, Book, Settings as SettingsIcon, LayoutDashboard, LogOut, AlertTriangle, ExternalLink, Package, Truck, ShieldAlert } from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Dashboard from '@/src/pages/Dashboard';
import Settings from '@/src/pages/Settings';
import OrderDetails from '@/src/pages/OrderDetails';
import AddressBook from '@/src/pages/AddressBook';
import Tracking from '@/src/pages/Tracking';
import { APP_VERSION } from '@/src/constants';

function BackdoorRecovery({ onBackdoorUnlock, onCancel }: { onBackdoorUnlock: (key: string, reset?: { enabled: boolean, newPassword: string }) => Promise<boolean>, onCancel: () => void }) {
  const [backdoorKey, setBackdoorKey] = useState('');
  const [resetPassword, setResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleAction = async () => {
    if (resetPassword && (!newPassword || newPassword !== confirmPassword)) {
      setError("Passwords do not match or are empty");
      return;
    }
    const success = await onBackdoorUnlock(backdoorKey, resetPassword ? { enabled: true, newPassword } : undefined);
    if (!success) {
      setError("Invalid Backdoor Key or No Recovery Blob Found");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <Card className="w-full max-w-lg border-red-900/50 bg-zinc-950 text-zinc-100 shadow-2xl shadow-red-900/20">
        <CardHeader>
          <div className="flex items-center gap-3 text-red-500 mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <ShieldAlert size={28} />
            </div>
            <div>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Recovery Backdoor</CardTitle>
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This bypass grants access to the encrypted recovery blob. 
            If "Reset Password" is enabled, the main vault will be re-encrypted with your new credentials.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Backdoor Key</label>
            </div>
            <Input 
              type="password" 
              value={backdoorKey} 
              onChange={(e) => setBackdoorKey(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-zinc-100 font-mono text-[11px] h-10 tracking-widest"
              placeholder="Paste hexadecimal recovery key..."
              autoComplete="off"
              name="backdoor-recovery-key-bypass"
              data-lpignore="true"
            />
          </div>

          <div className="flex items-center space-x-3 py-3 px-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
            <input 
              type="checkbox" 
              id="reset-check"
              checked={resetPassword}
              onChange={(e) => setResetPassword(e.target.checked)}
              className="w-5 h-5 rounded border-zinc-800 bg-zinc-950 accent-red-600 cursor-pointer"
            />
            <label htmlFor="reset-check" className="text-sm font-bold text-zinc-200 cursor-pointer select-none">
              Reset Master Password? <span className="text-[10px] text-zinc-500 font-normal">(Re-encrypts all data)</span>
            </label>
          </div>

          {resetPassword && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">New Master Password</label>
                  <Input 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100 h-10"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest">Confirm New Password</label>
                  <Input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100 h-10"
                    placeholder="Repeat new password"
                  />
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 italic text-center">
                Warning: This will overwrite the previous master password used to lock current data.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 p-3 rounded-lg border border-red-900/50">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between gap-4 bg-zinc-900/30 p-6 border-zinc-800 rounded-b-xl">
          <Button variant="ghost" onClick={onCancel} className="text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 h-11 px-6">
            Abort
          </Button>
          <Button 
            onClick={handleAction} 
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest h-11 px-8 shadow-lg shadow-red-600/20"
            disabled={!backdoorKey || (resetPassword && !newPassword)}
          >
            Authorize Bypass
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function LockScreen({ onUnlock, onReset, hasStoredData }: { onUnlock: (pw: string) => Promise<boolean>, onReset: () => void, hasStoredData: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onUnlock(password);
    if (!success) setError(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center mb-4">
            <Lock className="text-white w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-bold">Sawyer-Ship</CardTitle>
          <CardDescription>
            {hasStoredData 
              ? "Enter your master password to unlock your credentials." 
              : "Create a master password to secure your shipping tokens."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={error ? "border-red-500" : ""}
              />
              {error && <p className="text-xs text-red-500">Invalid password. Please try again.</p>}
            </div>
            <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800">
              {hasStoredData ? "Unlock" : "Setup Sawyer-Ship"}
            </Button>
          </form>

          {hasStoredData && (
            <div className="mt-6 pt-6 border-t border-zinc-100 text-center">
              <AlertDialog>
                <AlertDialogTrigger className="text-xs text-zinc-500 hover:text-red-600 underline bg-transparent border-none p-0 h-auto font-normal cursor-pointer">
                  Forgotten password? Reset application
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle size={20} />
                      Warning: Data Loss
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Resetting the application will permanently delete all your stored API tokens and settings from this browser's local storage. This action cannot be undone.
                      <br /><br />
                      Are you sure you want to proceed?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onReset} className="bg-red-600 hover:bg-red-700">
                      Yes, Reset Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
      <footer className="fixed bottom-4 right-4 text-lg font-mono text-zinc-400">
        v{APP_VERSION}
      </footer>
    </div>
  );
}

function Layout({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="h-screen bg-zinc-50 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col h-full shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <Package className="text-white w-5 h-5" />
            </div>
            <span>Sawyer-Ship</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
          <Link to="/address-book" className="flex items-center gap-3 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
            <Book size={20} />
            <span>Address Book</span>
          </Link>
          <Link to="/tracking" className="flex items-center gap-3 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
            <Truck size={20} />
            <span>Tracking</span>
          </Link>
          <Link to="/settings" className="flex items-center gap-3 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
            <SettingsIcon size={20} />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-zinc-200">
          <Button variant="ghost" className="w-full justify-start gap-3 text-zinc-600" onClick={onLogout}>
            <LogOut size={20} />
            <span>Lock App</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-7xl mx-auto p-8 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { 
    isLocked, 
    isBackdoorVisible,
    setIsBackdoorVisible,
    credentials, 
    unlock, 
    backdoorUnlock,
    logout, 
    hasStoredData, 
    save, 
    exportData, 
    importData, 
    resetData 
  } = useSawyerStorage();

  // Auto-lock logic
  React.useEffect(() => {
    if (isLocked || !credentials.general.autoLockMinutes || credentials.general.autoLockMinutes <= 0) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
      }, credentials.general.autoLockMinutes * 60 * 1000);
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));

    // Initial timer start
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [isLocked, credentials.general.autoLockMinutes, logout]);

  const router = useMemo(() => createHashRouter([
    {
      path: "/",
      element: <Layout onLogout={logout} />,
      children: [
        {
          index: true,
          element: <Dashboard credentials={credentials} />,
        },
        {
          path: "address-book",
          element: <AddressBook credentials={credentials} onSave={save} />,
        },
        {
          path: "order/:id",
          element: <OrderDetails credentials={credentials} onSave={save} />,
        },
        {
          path: "tracking",
          element: <Tracking credentials={credentials} onSave={save} />,
        },
        {
          path: "settings",
          element: (
            <Settings 
              credentials={credentials} 
              onSave={save} 
              onExport={exportData} 
              onImport={importData} 
            />
          ),
        },
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
  ]), [credentials, logout, save, exportData, importData]);

  if (isLocked) {
    return (
      <>
        {isBackdoorVisible && (
          <BackdoorRecovery 
            onBackdoorUnlock={backdoorUnlock}
            onCancel={() => setIsBackdoorVisible(false)}
          />
        )}
        <LockScreen onUnlock={unlock} onReset={resetData} hasStoredData={hasStoredData} />
        <Toaster position="top-right" richColors expand={true} />
      </>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors expand={true} />
    </>
  );
}
