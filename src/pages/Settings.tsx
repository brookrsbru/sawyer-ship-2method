import React, { useState, useEffect, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SawyerCredentials } from '@/src/hooks/use-sawyer-storage';
import { COUNTRY_NAMES } from '@/src/lib/countries';
import { Save, Download, Upload, Shield, Globe, Truck, Info, FileJson, ExternalLink, Plus, Trash2, ChevronRight, LayoutDashboard, Package, Lock, Loader2, Settings as SettingsIcon, HardDrive, Search } from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { APP_VERSION } from '@/src/constants';

const FEDEX_PICKUP_LABELS: Record<string, string> = {
  "CONTACT_FEDEX_TO_SCHEDULE": "Contact FedEx to Schedule",
  "DROPOFF_AT_FEDEX_LOCATION": "Dropoff at FedEx Location",
  "USE_SCHEDULED_PICKUP": "Use Scheduled Pickup"
};

import { MagentoOrder, FedExClient, MagentoClient } from '@/src/lib/api-clients';

export default function Settings({ 
  credentials, 
  onSave, 
  onExport, 
  onImport 
}: { 
  credentials: SawyerCredentials, 
  onSave: (data: SawyerCredentials) => Promise<void>,
  onExport: () => string | null,
  onImport: (data: string) => void
}) {
  const [formData, setFormData] = useState<SawyerCredentials>(credentials);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<string | null>(null);
  const [devOrderId, setDevOrderId] = useState(() => localStorage.getItem('sawyer_last_search') || '');
  const [devOrderData, setDevOrderData] = useState<any>(null);
  const [isDevLoading, setIsDevLoading] = useState(false);

  // Storage usage calculator
  const storageUsage = useMemo(() => {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += ((localStorage[key].length + key.length) * 2);
      }
    }
    // Return formatted string
    if (total < 1024) return `${total} bytes`;
    if (total < 1048576) return `${(total / 1024).toFixed(2)} KB`;
    return `${(total / 1048576).toFixed(2)} MB`;
  }, [formData, credentials]);

  // Check for unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(credentials);
  }, [formData, credentials]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname
  );

  const handleSave = async (exitAfter = false) => {
    setIsSaving(true);
    try {
      await onSave(formData);
      toast.success("Settings saved successfully.");
      if (exitAfter && blocker.state === 'blocked') {
        blocker.proceed();
      }
    } catch (e) {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDevFetch = async () => {
    if (!devOrderId) return;
    setIsDevLoading(true);
    setDevOrderData(null);
    try {
      const client = new MagentoClient(
        credentials.magento.url,
        credentials.magento.token,
        credentials.general.proxyUrl
      );
      const data = await client.getDevOrderData(devOrderId);
      setDevOrderData(data);
      toast.success("Order data fetched successfully.");
    } catch (e: any) {
      toast.error(`Failed to fetch order: ${e.message}`);
    } finally {
      setIsDevLoading(false);
    }
  };

  // Sync state if credentials change (e.g. after a save or import)
  useEffect(() => {
    setFormData(credentials);
  }, [credentials]);

  const handleExport = () => {
    const data = onExport();
    if (data) {
      const blob = new Blob([JSON.stringify({ encryptedData: data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sawyer-ship-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Settings exported as JSON file.");
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.encryptedData) {
          setPendingImportData(json.encryptedData);
        } else {
          toast.error("Invalid backup file format.");
        }
      } catch (err) {
        toast.error("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (pendingImportData) {
      onImport(pendingImportData);
      toast.success("Data imported. Please refresh and unlock with the original master password.");
      setTimeout(() => window.location.reload(), 2000);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-zinc-200 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-zinc-900">Settings</h1>
            <span className="text-[10px] font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200 mt-2">v{APP_VERSION}</span>
          </div>
          <p className="text-zinc-500">Manage your API credentials and application preferences.</p>
        </div>
        <Button 
          onClick={() => handleSave(false)} 
          disabled={isSaving || !hasChanges}
          className="bg-zinc-900 hover:bg-zinc-800 gap-2 shadow-lg"
        >
          {isSaving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={18} />}
          {hasChanges ? "Save All Settings" : "Saved"}
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="hidden lg:block relative">
          <div className="sticky top-6 space-y-4 z-20">
            <Card className="border-none shadow-none bg-transparent">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-xs font-bold uppercase text-zinc-400 tracking-widest text-center w-full">Navigation</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <nav className="space-y-1">
                  {[
                    { id: 'general', label: 'General Preferences', icon: SettingsIcon },
                    { id: 'shipping', label: 'Shipping Defaults', icon: Truck },
                    { id: 'magento', label: 'Magento Integration', icon: Globe },
                    { id: 'fedex', label: 'FedEx Integration', icon: Truck },
                    { id: 'security', label: 'Security & Backup', icon: Shield },
                    { id: 'dev', label: 'Dev Menu', icon: FileJson },
                    { id: 'help', label: 'Help Desk', icon: Info },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        const element = document.getElementById(item.id);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="w-full flex items-center justify-between group px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon size={16} className="text-zinc-400 group-hover:text-zinc-900" />
                        {item.label}
                      </div>
                      <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-12">
          {/* General Section */}
          <section id="general" className="scroll-mt-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-zinc-200" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">General Preferences</h2>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>
            
            <Card>
            <CardHeader>
                <CardTitle>Application Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Connectivity & Automation */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Globe size={16} className="text-zinc-400" />
                    Connectivity & Automation
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="space-y-2">
                      <Label htmlFor="proxy">CORS Proxy URL</Label>
                      <div className="flex gap-2">
                        <Input 
                          id="proxy" 
                          placeholder="https://cors-anywhere.herokuapp.com/" 
                          value={formData.general.proxyUrl}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, proxyUrl: e.target.value } })}
                          className="flex-1"
                        />
                        <Button 
                          variant="outline" 
                          size="icon"
                          type="button"
                          title="Request Access to Proxy"
                          onClick={() => window.open(formData.general.proxyUrl, '_blank')}
                        >
                          <ExternalLink size={18} />
                        </Button>
                      </div>
                      <p className="text-xs text-zinc-500">Required for browser-based API calls. Click the button to request temporary access if using Heroku CORS Anywhere.</p>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-zinc-500 hover:text-zinc-900"
                        onClick={() => setFormData({ ...formData, general: { ...formData.general, proxyUrl: 'https://cors-anywhere.herokuapp.com/' } })}
                      >
                        Reset to demo server (Heroku)
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Mark as Shipped in Magento</Label>
                        <p className="text-[10px] text-zinc-500">Automatically create shipment in Magento after creating label.</p>
                      </div>
                      <Select 
                        value={formData.general.markAsShipped ? "yes" : "no"}
                        onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, markAsShipped: v === "yes" } })}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Select">
                            {formData.general.markAsShipped ? "Yes" : "No"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-Open Shipping Label</Label>
                        <p className="text-[10px] text-zinc-500">Automatically open the label viewer after generation.</p>
                      </div>
                      <Select 
                        value={formData.general.autoOpenLabel ? "yes" : "no"}
                        onValueChange={(v) => setFormData({ 
                          ...formData, 
                          general: { 
                            ...formData.general, 
                            autoOpenLabel: v === "yes",
                            autoPrintLabel: v === "yes" ? formData.general.autoPrintLabel : false 
                          } 
                        })}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Select">
                            {formData.general.autoOpenLabel ? "Yes" : "No"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.general.autoOpenLabel && (
                      <div className="flex items-center justify-between animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="space-y-0.5">
                          <Label>Auto-Trigger Print Menu</Label>
                          <p className="text-[10px] text-zinc-500">Automatically open the system print dialog when the label opens.</p>
                        </div>
                        <Select 
                          value={formData.general.autoPrintLabel ? "yes" : "no"}
                          onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, autoPrintLabel: v === "yes" } })}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Select">
                              {formData.general.autoPrintLabel ? "Yes" : "No"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Display & Units */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <LayoutDashboard size={16} className="text-zinc-400" />
                    Display & Units
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="space-y-2">
                      <Label htmlFor="format">Default Label Format</Label>
                      <Select 
                        value={formData.general.labelFormat}
                        onValueChange={(v: 'PDF' | 'ZPL') => setFormData({ ...formData, general: { ...formData.general, labelFormat: v } })}
                      >
                        <SelectTrigger id="format">
                          <SelectValue placeholder="Select format">
                            {formData.general.labelFormat === 'PDF' ? 'PDF (Standard)' : 'ZPL (Thermal)'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PDF">PDF (Standard)</SelectItem>
                          <SelectItem value="ZPL">ZPL (Thermal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="label-size">Label Size</Label>
                      <Select 
                        value={formData.general.labelSize}
                        onValueChange={(v: '4x6' | '8.5x11') => setFormData({ ...formData, general: { ...formData.general, labelSize: v } })}
                      >
                        <SelectTrigger id="label-size">
                          <SelectValue placeholder="Select size">
                            {formData.general.labelSize === '4x6' ? '4" x 6" (Thermal)' : '8.5" x 11" (Letter)'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="4x6">4" x 6" (Thermal)</SelectItem>
                          <SelectItem value="8.5x11">8.5" x 11" (Letter)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weight-display">Weight Display Mode</Label>
                      <Select 
                        value={formData.general.weightDisplayMode}
                        onValueChange={(v: 'both' | 'grams' | 'kg') => setFormData({ ...formData, general: { ...formData.general, weightDisplayMode: v } })}
                      >
                        <SelectTrigger id="weight-display">
                          <SelectValue placeholder="Select mode">
                            {formData.general.weightDisplayMode === 'both' ? 'Both (kg & g)' : 
                             formData.general.weightDisplayMode === 'grams' ? 'Only Grams' : 'Only Kilograms'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Both (kg & g)</SelectItem>
                          <SelectItem value="grams">Only Grams</SelectItem>
                          <SelectItem value="kg">Only Kilograms</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500">Choose how weight is displayed and entered. "Both" enables auto-shifting (e.g. 3.2kg to 3kg 200g).</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currency">Display Currency</Label>
                      <Select 
                        value={formData.general.currency}
                        onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, currency: v } })}
                      >
                        <SelectTrigger id="currency">
                          <SelectValue placeholder="Select currency">
                            {formData.general.currency === 'GBP' ? 'GBP (£)' : formData.general.currency === 'USD' ? 'USD ($)' : 'EUR (€)'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Security */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Shield size={16} className="text-zinc-400" />
                    Security
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="space-y-2">
                      <Label htmlFor="autolock">Auto-Lock Timer</Label>
                      <Select 
                        value={(formData.general.autoLockMinutes ?? 0).toString()}
                        onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, autoLockMinutes: parseInt(v) } })}
                      >
                        <SelectTrigger id="autolock">
                          <SelectValue placeholder="Select time">
                            {formData.general.autoLockMinutes === 0 ? 'Never Lock' : 
                             formData.general.autoLockMinutes === 1 ? '1 Minute' :
                             formData.general.autoLockMinutes === 5 ? '5 Minutes' :
                             formData.general.autoLockMinutes === 15 ? '15 Minutes' :
                             formData.general.autoLockMinutes === 30 ? '30 Minutes' : '1 Hour'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Never Lock</SelectItem>
                          <SelectItem value="1">1 Minute</SelectItem>
                          <SelectItem value="5">5 Minutes</SelectItem>
                          <SelectItem value="15">15 Minutes</SelectItem>
                          <SelectItem value="30">30 Minutes</SelectItem>
                          <SelectItem value="60">1 Hour</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500">Automatically lock the app after a period of inactivity.</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Shipping Origin */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Truck size={16} className="text-zinc-400" />
                    Shipping Origin
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="space-y-2">
                      <Label htmlFor="origin-country">Origin Country</Label>
                      <Select 
                        value={formData.general.originCountry}
                        onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, originCountry: v } })}
                      >
                        <SelectTrigger id="origin-country">
                          <SelectValue placeholder="Select country">
                            {COUNTRY_NAMES[formData.general.originCountry] || formData.general.originCountry}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                            <SelectItem key={code} value={code}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500">Your shipping origin country. Used to determine if duties/taxes options are shown.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="origin-contact">Contact Name</Label>
                        <Input 
                          id="origin-contact"
                          value={formData.general.originContactName}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originContactName: e.target.value } })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="origin-company">Company Name</Label>
                        <Input 
                          id="origin-company"
                          value={formData.general.originCompanyName}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originCompanyName: e.target.value } })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="origin-email">Email</Label>
                        <Input 
                          id="origin-email"
                          type="email"
                          value={formData.general.originEmail}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originEmail: e.target.value } })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="origin-phone">Phone</Label>
                        <Input 
                          id="origin-phone"
                          value={formData.general.originPhone}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originPhone: e.target.value } })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="origin-street1">Street Address</Label>
                      <Input 
                        id="origin-street1"
                        placeholder="Line 1"
                        value={formData.general.originStreet1}
                        onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originStreet1: e.target.value } })}
                      />
                      <Input 
                        id="origin-street2"
                        placeholder="Line 2 (Optional)"
                        value={formData.general.originStreet2}
                        onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originStreet2: e.target.value } })}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="origin-city">City</Label>
                        <Input 
                          id="origin-city"
                          value={formData.general.originCity}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originCity: e.target.value } })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="origin-state">Region</Label>
                        <Input 
                          id="origin-state"
                          value={formData.general.originState}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originState: e.target.value } })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="origin-postcode">Postal Code</Label>
                        <Input 
                          id="origin-postcode"
                          value={formData.general.originPostalCode}
                          onChange={(e) => setFormData({ ...formData, general: { ...formData.general, originPostalCode: e.target.value } })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Advanced Options */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Plus size={16} className="text-zinc-400" />
                    Advanced Options
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Always show Duties/Taxes</Label>
                        <p className="text-[10px] text-zinc-500">Show duties billing even for domestic shipments.</p>
                      </div>
                      <Select 
                        value={formData.general.alwaysShowDuties ? "yes" : "no"}
                        onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, alwaysShowDuties: v === "yes" } })}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Select">
                            {formData.general.alwaysShowDuties ? "Yes" : "No"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

            {/* Shipping Defaults Section */}
            <section id="shipping" className="scroll-mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-zinc-200" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Shipping Defaults</h2>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                  <Truck size={20} /> Shipping Defaults
                </CardTitle>
                <CardDescription>Set default values for new shipments and choose which fields should overwrite order data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Package Defaults */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Package size={16} className="text-zinc-400" />
                    Package Defaults
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-5 space-y-2">
                        <Label>Default Weight (KG)</Label>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={formData.shippingDefaults.weightKg}
                          onChange={(e) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, weightKg: e.target.value } })}
                        />
                      </div>
                      <div className="col-span-5 space-y-2">
                        <Label>Default Weight (Grams)</Label>
                        <Input 
                          type="number"
                          value={formData.shippingDefaults.weightG}
                          onChange={(e) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, weightG: e.target.value } })}
                        />
                      </div>
                      <div className="col-span-2 flex flex-col items-center gap-2">
                        <Label className="text-[10px]">Overwrite</Label>
                        <Select 
                          value={formData.shippingDefaults.overwriteWeightKg ? "yes" : "no"}
                          onValueChange={(v) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, overwriteWeightKg: v === "yes", overwriteWeightG: v === "yes" } })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-3 space-y-2">
                        <Label>Length (cm)</Label>
                        <Input 
                          type="number"
                          value={formData.shippingDefaults.length}
                          onChange={(e) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, length: e.target.value } })}
                        />
                      </div>
                      <div className="col-span-3 space-y-2">
                        <Label>Width (cm)</Label>
                        <Input 
                          type="number"
                          value={formData.shippingDefaults.width}
                          onChange={(e) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, width: e.target.value } })}
                        />
                      </div>
                      <div className="col-span-4 space-y-2">
                        <Label>Height (cm)</Label>
                        <Input 
                          type="number"
                          value={formData.shippingDefaults.height}
                          onChange={(e) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, height: e.target.value } })}
                        />
                      </div>
                      <div className="col-span-2 flex flex-col items-center gap-2">
                        <Label className="text-[10px]">Overwrite</Label>
                        <Select 
                          value={formData.shippingDefaults.overwriteLength ? "yes" : "no"}
                          onValueChange={(v) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, overwriteLength: v === "yes", overwriteWidth: v === "yes", overwriteHeight: v === "yes" } })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Billing Defaults */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Shield size={16} className="text-zinc-400" />
                    Billing Defaults
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-5 space-y-2">
                        <Label>Bill Shipping To</Label>
                        <Select 
                          value={formData.shippingDefaults.billShippingTo}
                          onValueChange={(v) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, billShippingTo: v } })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shipper">Shipper (Prepaid)</SelectItem>
                            <SelectItem value="recipient">Recipient (Collect)</SelectItem>
                            <SelectItem value="third_party">Third Party</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5 space-y-2">
                        <Label>Bill Duties To</Label>
                        <Select 
                          value={formData.shippingDefaults.billDutiesTo}
                          onValueChange={(v) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, billDutiesTo: v } })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shipper">Shipper (DDP)</SelectItem>
                            <SelectItem value="recipient">Recipient (DDU/DAP)</SelectItem>
                            <SelectItem value="third_party">Third Party</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex flex-col items-center gap-2">
                        <Label className="text-[10px]">Overwrite</Label>
                        <Select 
                          value={formData.shippingDefaults.overwriteBillShippingTo ? "yes" : "no"}
                          onValueChange={(v) => setFormData({ ...formData, shippingDefaults: { ...formData.shippingDefaults, overwriteBillShippingTo: v === "yes", overwriteBillDutiesTo: v === "yes" } })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Country-Specific Defaults */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                      <Globe size={16} className="text-zinc-400" />
                      Country-Specific Defaults
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2"
                      onClick={() => {
                        const country = prompt("Enter ISO Country Code (e.g. US, DE, FR):");
                        if (country && country.length === 2) {
                          const code = country.toUpperCase();
                          setFormData({
                            ...formData,
                            countryDefaults: {
                              ...formData.countryDefaults,
                              [code]: { ...formData.shippingDefaults }
                            }
                          });
                        }
                      }}
                    >
                      <Plus size={14} /> Add Country
                    </Button>
                  </div>
                  <div className="pl-6 border-l-2 border-zinc-100">
                    {Object.keys(formData.countryDefaults || {}).length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">No country-specific defaults set.</p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(formData.countryDefaults || {}).map(([code, defaults]) => {
                          const d = defaults as any;
                          return (
                            <Card key={code} className="border-zinc-200">
                              <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm">{COUNTRY_NAMES[code] || code} Defaults</CardTitle>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-red-500"
                                  onClick={() => {
                                    const newDefaults = { ...formData.countryDefaults };
                                    delete newDefaults[code];
                                    setFormData({ ...formData, countryDefaults: newDefaults });
                                  }}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </CardHeader>
                              <CardContent className="py-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Weight (kg/g)</Label>
                                    <div className="flex gap-1">
                                      <Input 
                                        className="h-7 text-xs" 
                                        placeholder="kg"
                                        value={d.weightKg}
                                        onChange={(e) => {
                                          setFormData({
                                            ...formData,
                                            countryDefaults: {
                                              ...formData.countryDefaults,
                                              [code]: { ...d, weightKg: e.target.value }
                                            }
                                          });
                                        }}
                                      />
                                      <Input 
                                        className="h-7 text-xs" 
                                        placeholder="g"
                                        value={d.weightG}
                                        onChange={(e) => {
                                          setFormData({
                                            ...formData,
                                            countryDefaults: {
                                              ...formData.countryDefaults,
                                              [code]: { ...d, weightG: e.target.value }
                                            }
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Dimensions (L/W/H)</Label>
                                    <div className="flex gap-1">
                                      <Input 
                                        className="h-7 text-xs" 
                                        placeholder="L"
                                        value={d.length}
                                        onChange={(e) => {
                                          setFormData({
                                            ...formData,
                                            countryDefaults: {
                                              ...formData.countryDefaults,
                                              [code]: { ...d, length: e.target.value }
                                            }
                                          });
                                        }}
                                      />
                                      <Input 
                                        className="h-7 text-xs" 
                                        placeholder="W"
                                        value={d.width}
                                        onChange={(e) => {
                                          setFormData({
                                            ...formData,
                                            countryDefaults: {
                                              ...formData.countryDefaults,
                                              [code]: { ...d, width: e.target.value }
                                            }
                                          });
                                        }}
                                      />
                                      <Input 
                                        className="h-7 text-xs" 
                                        placeholder="H"
                                        value={d.height}
                                        onChange={(e) => {
                                          setFormData({
                                            ...formData,
                                            countryDefaults: {
                                              ...formData.countryDefaults,
                                              [code]: { ...d, height: e.target.value }
                                            }
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              </Card>
            </section>

            {/* Magento Section */}
            <section id="magento" className="scroll-mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-zinc-200" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Magento Integration</h2>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                  <Globe size={20} /> Magento API
                </CardTitle>
                <CardDescription>Configure your Magento 2 REST API connection.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* API Credentials */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Lock size={16} className="text-zinc-400" />
                    API Credentials
                  </h3>
                  <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                    <div className="space-y-2">
                      <Label htmlFor="magento-url">Store Base URL</Label>
                      <Input 
                        id="magento-url" 
                        placeholder="https://yourstore.com" 
                        value={formData.magento.url}
                        onChange={(e) => setFormData({ ...formData, magento: { ...formData.magento, url: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="magento-token">Integration Access Token</Label>
                      <Input 
                        id="magento-token" 
                        autoComplete="off"
                        placeholder="Bearer Token" 
                        value={formData.magento.token}
                        onChange={(e) => setFormData({ ...formData, magento: { ...formData.magento, token: e.target.value } })}
                      />
                      <p className="text-xs text-zinc-500">Create this in System {'>'} Extensions {'>'} Integrations in your Magento Admin.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
              </Card>
            </section>

            {/* FedEx Section */}
            <section id="fedex" className="scroll-mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-zinc-200" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">FedEx Integration</h2>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Truck size={20} /> FedEx API
                    </CardTitle>
                    <CardDescription>FedEx REST API credentials.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fedex-enabled" className="text-xs">Enabled</Label>
                    <Select 
                      value={formData.fedex.enabled ? "yes" : "no"}
                      onValueChange={(v) => setFormData({ ...formData, fedex: { ...formData.fedex, enabled: v === "yes" } })}
                    >
                      <SelectTrigger id="fedex-enabled" className="w-[80px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Account Credentials */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                      <Lock size={16} className="text-zinc-400" />
                      Account Credentials
                    </h3>
                    <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sandbox Credentials</h4>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-sandbox-key">API Key</Label>
                            <Input 
                              id="fedex-sandbox-key" 
                              value={formData.fedex.sandboxApiKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, sandboxApiKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-sandbox-secret">Secret Key</Label>
                            <Input 
                              id="fedex-sandbox-secret" 
                              autoComplete="off"
                              value={formData.fedex.sandboxSecretKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, sandboxSecretKey: e.target.value } })}
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Production Credentials</h4>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-production-key">API Key</Label>
                            <Input 
                              id="fedex-production-key" 
                              value={formData.fedex.productionApiKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionApiKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-production-secret">Secret Key</Label>
                            <Input 
                              id="fedex-production-secret" 
                              autoComplete="off"
                              value={formData.fedex.productionSecretKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionSecretKey: e.target.value } })}
                            />
                          </div>
                        </div>
                      </div>
                      {formData.fedex.isSandbox ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="fedex-domestic-account">Sandbox Domestic Account Number</Label>
                              <Input 
                                id="fedex-domestic-account" 
                                value={formData.fedex.domesticAccountNumber}
                                onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, domesticAccountNumber: e.target.value } })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="fedex-global-account">Sandbox Global Account Number</Label>
                              <Input 
                                id="fedex-global-account" 
                                value={formData.fedex.globalAccountNumber}
                                onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, globalAccountNumber: e.target.value } })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-payment-account">Sandbox Payment Account Number (Payor)</Label>
                            <Input 
                              id="fedex-payment-account" 
                              placeholder="Used for shipping charges payment"
                              value={formData.fedex.paymentAccountNumber}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, paymentAccountNumber: e.target.value } })}
                            />
                            <p className="text-[10px] text-zinc-500">The account number that will be listed as the payor for shipping charges.</p>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <Label htmlFor="fedex-prod-account">Production Account Number</Label>
                          <Input 
                            id="fedex-prod-account" 
                            value={formData.fedex.productionAccountNumber}
                            onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionAccountNumber: e.target.value } })}
                          />
                          <p className="text-[10px] text-zinc-500">The account number that will be used for both shipping and payor identification.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Tracking API Credentials */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                      <Search size={16} className="text-zinc-400" />
                      Tracking API Credentials
                    </h3>
                    <p className="text-[10px] text-zinc-500 pl-6 border-l-2 border-zinc-100 italic">
                      Leave empty to use main Account Credentials above.
                    </p>
                    <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                      <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200 mb-4">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Tracking Environment</Label>
                          <p className="text-[10px] text-zinc-500">Enable sandbox mode specifically for tracking</p>
                        </div>
                        <Switch 
                          checked={formData.fedex.isTrackingSandbox}
                          onCheckedChange={(v) => setFormData({ ...formData, fedex: { ...formData.fedex, isTrackingSandbox: v } })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sandbox Tracking</h4>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-sandbox-key">API Key</Label>
                            <Input 
                              id="fedex-track-sandbox-key" 
                              value={formData.fedex.sandboxTrackingApiKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, sandboxTrackingApiKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-sandbox-secret">Secret Key</Label>
                            <Input 
                              id="fedex-track-sandbox-secret" 
                              autoComplete="off"
                              value={formData.fedex.sandboxTrackingSecretKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, sandboxTrackingSecretKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-sandbox-account">Account Number</Label>
                            <Input 
                              id="fedex-track-sandbox-account" 
                              value={formData.fedex.sandboxTrackingAccountNumber}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, sandboxTrackingAccountNumber: e.target.value } })}
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Production Tracking</h4>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-production-key">API Key</Label>
                            <Input 
                              id="fedex-track-production-key" 
                              value={formData.fedex.productionTrackingApiKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionTrackingApiKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-production-secret">Secret Key</Label>
                            <Input 
                              id="fedex-track-production-secret" 
                              autoComplete="off"
                              value={formData.fedex.productionTrackingSecretKey}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionTrackingSecretKey: e.target.value } })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fedex-track-production-account">Account Number</Label>
                            <Input 
                              id="fedex-track-production-account" 
                              value={formData.fedex.productionTrackingAccountNumber}
                              onChange={(e) => setFormData({ ...formData, fedex: { ...formData.fedex, productionTrackingAccountNumber: e.target.value } })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Service Preferences */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                      <SettingsIcon size={16} className="text-zinc-400" />
                      Service Preferences
                    </h3>
                    <div className="space-y-4 pl-6 border-l-2 border-zinc-100">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fedex-pickup">Pickup Type</Label>
                          <Select 
                            value={formData.general.fedexPickupType}
                            onValueChange={(v) => setFormData({ ...formData, general: { ...formData.general, fedexPickupType: v } })}
                          >
                            <SelectTrigger id="fedex-pickup">
                              <SelectValue placeholder="Select pickup type">
                                {FEDEX_PICKUP_LABELS[formData.general.fedexPickupType] || formData.general.fedexPickupType}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FEDEX_PICKUP_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fedex-env">Environment</Label>
                          <Select 
                            value={formData.fedex.isSandbox ? "sandbox" : "production"}
                            onValueChange={(v) => setFormData({ ...formData, fedex: { ...formData.fedex, isSandbox: v === "sandbox" } })}
                          >
                            <SelectTrigger id="fedex-env">
                              <SelectValue placeholder="Select environment" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                              <SelectItem value="production">Production (Live)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Security Section */}
            <section id="security" className="scroll-mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-zinc-200" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Security & Backup</h2>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield size={20} /> Security & Backup
                  </CardTitle>
                  <CardDescription>Export or import your encrypted credentials.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Export Settings & Tokens</Label>
                    <Button variant="outline" className="w-full gap-2" onClick={handleExport}>
                      <FileJson size={18} /> Download JSON Backup
                    </Button>
                    <p className="text-[10px] text-zinc-500">This file contains your encrypted credentials. Keep it safe.</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label htmlFor="import-file">Import from JSON Backup</Label>
                    <div className="flex flex-col gap-2">
                      <Input 
                        id="import-file"
                        type="file"
                        accept=".json"
                        onChange={handleFileImport}
                        className="text-xs"
                      />
                      <p className="text-[10px] text-zinc-500">Importing will overwrite your current settings.</p>
                    </div>
                  </div>

                  <AlertDialog open={!!pendingImportData} onOpenChange={(open) => !open && setPendingImportData(null)}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                          <Shield size={20} /> Confirm Import
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to import this backup? This will overwrite all your current settings and API tokens.
                          <br /><br />
                          You will need to use the master password that was active when this backup was created.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmImport} className="bg-amber-600 hover:bg-amber-700">
                          Yes, Import Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </section>

            {/* Navigation Guard Dialog */}
            <AlertDialog open={blocker.state === 'blocked'}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Shield className="text-amber-500" /> Unsaved Changes
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    You have unsaved changes in your settings. Are you sure you want to exit?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel 
                    onClick={() => blocker.reset?.()}
                    className="mt-0"
                    variant="outline"
                    size="default"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => blocker.proceed?.()}
                    variant="outline"
                    className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border-zinc-200"
                  >
                    Exit without saving
                  </AlertDialogAction>
                  <AlertDialogAction 
                    onClick={() => handleSave(true)}
                    variant="default"
                    className="bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    Save and exit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Dev Menu Section */}
            <section id="dev" className="scroll-mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-zinc-200" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Dev Menu</h2>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileJson size={20} /> Magento Order Inspector
                    </CardTitle>
                    <CardDescription>Pull raw order data from Magento to inspect all attributes and structures.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Enter Order ID (e.g. 000000123)" 
                        value={devOrderId}
                        onChange={(e) => setDevOrderId(e.target.value)}
                      />
                      <Button onClick={handleDevFetch} disabled={isDevLoading || !devOrderId}>
                        {isDevLoading ? <Loader2 className="animate-spin" size={18} /> : 'Fetch Raw Data'}
                      </Button>
                    </div>
                    
                    {devOrderData && (
                      <div className="space-y-4">
                        <div className="bg-zinc-950 rounded-lg p-4 overflow-auto max-h-[500px]">
                          <pre className="text-[10px] text-zinc-300 font-mono">
                            {JSON.stringify(devOrderData, null, 2)}
                          </pre>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => {
                          const blob = new Blob([JSON.stringify(devOrderData, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `order-${devOrderId}-raw.json`;
                          link.click();
                          link.click();
                        }}>Download JSON</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive size={20} /> Storage Overview
                    </CardTitle>
                    <CardDescription>View the total size of data saved in your browser's local storage.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">Calculated Usage</p>
                        <p className="text-xs text-zinc-500">Credentials, tracking history, and logs</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-mono font-bold text-zinc-900">{storageUsage}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">Total bytes processed</p>
                      </div>
                    </div>
                    
                    <div className="text-[10px] text-zinc-400 italic">
                      Note: This is an approximation of the memory footprint in your browser.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Help Section */}
            <section id="help" className="scroll-mt-6">
              <Card className="bg-zinc-900 text-white border-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Info size={20} /> Help Desk
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-4 opacity-90">
                  <p>
                    <strong>FedEx Credentials:</strong> Get them at the <a href="https://developer.fedex.com/" target="_blank" className="underline">FedEx Developer Portal</a>.
                  </p>
                  <p>
                    <strong>CORS Proxy:</strong> Since this app runs in your browser, some APIs might block requests. Using a proxy helps bypass these restrictions.
                  </p>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>

        {hasChanges && (
          <div className="fixed bottom-0 right-0 left-64 bg-white/95 backdrop-blur-md border-t border-zinc-200 p-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-50 animate-in slide-in-from-bottom duration-300">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <Info size={20} className="text-amber-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-zinc-900">Unsaved Changes</span>
                  <span className="text-[10px] text-zinc-500">You have modified the application configuration.</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setFormData(credentials);
                    toast.info("Changes discarded.");
                  }}
                  className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                >
                  Discard
                </Button>
                <Button 
                  onClick={() => handleSave(false)} 
                  disabled={isSaving}
                  className="bg-zinc-900 hover:bg-zinc-800 gap-2 px-8 shadow-md shadow-zinc-200"
                >
                  {isSaving ? <Loader2 className="animate-spin w-4 h-4" /> : <Save size={18} />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}
