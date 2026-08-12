import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Package, ArrowRight, Loader2, AlertCircle, X, Info, Globe, Truck, ShieldCheck } from 'lucide-react';
import { MagentoClient, MagentoOrder } from '@/src/lib/api-clients';
import { SawyerCredentials } from '@/src/hooks/use-sawyer-storage';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard({ credentials }: { credentials: SawyerCredentials }) {
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('sawyer_last_search') || '');
  const [orders, setOrders] = useState<MagentoOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('sawyer_last_search', searchQuery);
  }, [searchQuery]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.magento.url || !credentials.magento.token) {
      toast.error("Magento credentials not configured. Please go to Settings.");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const client = new MagentoClient(
        credentials.magento.url, 
        credentials.magento.token, 
        credentials.general.proxyUrl
      );
      const results = await client.searchOrders(searchQuery);
      setOrders(results);
      if (results.length === 0) {
        setShowHelp(true);
      }
    } catch (error: any) {
      console.error(error);
      const message = error.message || "Unknown error";
      toast.error(`Failed to fetch orders: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-zinc-900">Shipping Dashboard</h1>
        <p className="text-zinc-500">Search and import orders from your Magento store.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Import Orders</CardTitle>
          <CardDescription>Search by Order ID.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input
                placeholder="Order #"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button type="submit" disabled={isLoading} className="bg-zinc-900 hover:bg-zinc-800">
              {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Search Magento
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate('/order/manual')}
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              Manual Shipment
            </Button>
          </form>
        </CardContent>
      </Card>

      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.entity_id}>
                    <TableCell className="font-medium">{order.increment_id}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{order.customer_firstname} {order.customer_lastname}</p>
                        <p className="text-zinc-500 text-xs">{order.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {credentials.general.currency === 'GBP' ? '£' : credentials.general.currency === 'EUR' ? '€' : '$'}
                      {order.grand_total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => navigate(`/order/${order.entity_id}`, { state: { order } })}
                      >
                        Ship Order <ArrowRight size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && orders.length === 0 && hasSearched && (
        <div className="text-center py-12 bg-zinc-50 rounded-xl border-2 border-dashed border-zinc-200">
          <Search className="mx-auto w-12 h-12 text-zinc-300 mb-4" />
          <h3 className="text-lg font-medium text-zinc-900">No results found</h3>
          <p className="text-zinc-500 mb-6">We couldn't find any orders matching "{searchQuery}".</p>
          <Button variant="outline" onClick={() => setShowHelp(true)} className="gap-2">
            <Info size={16} /> How to search
          </Button>
        </div>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Search className="text-zinc-400" /> Search for an Order
            </DialogTitle>
            <DialogDescription>
              Use the search bar to import orders from Magento or create manual shipments.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex gap-3 items-start p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center shrink-0">
                  <Globe size={16} className="text-zinc-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Search & Import</h4>
                  <p className="text-xs text-zinc-500">Enter a Magento Order ID or Customer Email to pull full order details, items, and customs data.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center shrink-0">
                  <Package size={16} className="text-zinc-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Manual Shipments</h4>
                  <p className="text-xs text-zinc-500">No order in Magento? Use the "Manual Shipment" button to create a label from scratch.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center shrink-0">
                  <Truck size={16} className="text-zinc-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Live Carrier Rates</h4>
                  <p className="text-xs text-zinc-500">Get real-time shipping quotes and generate labels for FedEx in seconds.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} className="text-zinc-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900">Customs & NI Support</h4>
                  <p className="text-xs text-zinc-500">Automatic HTS/Commodity code resolution and seamless domestic shipping for Northern Ireland.</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowHelp(false)} className="w-full bg-zinc-900 hover:bg-zinc-800">
              Got it, let's ship!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(!credentials.magento.url || !credentials.magento.token) && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 items-start">
          <AlertCircle className="text-amber-600 w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-900">Configuration Required</h4>
            <p className="text-sm text-amber-700">
              You haven't set up your Magento API credentials yet. 
              Please head over to the <Link to="/settings" className="underline font-bold">Settings</Link> page to get started.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
