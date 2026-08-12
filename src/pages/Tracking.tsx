import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Truck, Search, ExternalLink, RotateCcw, ChevronLeft, ChevronRight, Loader2, Calendar, AlertCircle, MoreVertical, Trash2, Ban, FileText, MapPin, User, Package, CreditCard, Printer, Eye } from 'lucide-react';
import { SawyerCredentials, SawyerShipment } from '@/src/hooks/use-sawyer-storage';
import { FedExClient, MagentoClient } from '@/src/lib/api-clients';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Tracking({ credentials, onSave }: { credentials: SawyerCredentials, onSave: (creds: SawyerCredentials) => Promise<void> }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<SawyerShipment | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const PAGE_SIZE = 20;

  // Maintenance Settings
  const DATA_RETENTION_DAYS = 30;
  const ATTACHMENT_PURGE_HOURS = 48;

  // Generic maintenance task to keep local storage clean
  const performStorageMaintenance = () => {
    if (!credentials.shipments || credentials.shipments.length === 0) return;

    const attachmentLimit = new Date();
    attachmentLimit.setHours(attachmentLimit.getHours() - ATTACHMENT_PURGE_HOURS);

    const recordLimit = new Date();
    recordLimit.setDate(recordLimit.getDate() - DATA_RETENTION_DAYS);

    let hasChanges = false;
    
    // 1. Purge label data to save browser storage
    const optimizedShipments = credentials.shipments.map(s => {
      if (s.labelBase64 && s.shipDate) {
        const shipDate = new Date(s.shipDate);
        if (shipDate < attachmentLimit) {
          hasChanges = true;
          const { labelBase64, ...rest } = s;
          return { ...rest };
        }
      }
      return s;
    });

    // 2. Remove old records entirely
    const validShipments = optimizedShipments.filter(s => {
      const shipDate = new Date(s.shipDate);
      const isExpired = shipDate < recordLimit;
      if (isExpired) hasChanges = true;
      return !isExpired;
    });

    if (hasChanges) {
      console.log(`[Tracking] Maintenance complete. Cleaned up expired tracking data.`);
      onSave({ ...credentials, shipments: validShipments });
    }
  };

  useEffect(() => {
    performStorageMaintenance();
  }, []);

  const handleOpenDetails = (shipment: SawyerShipment) => {
    setSelectedShipment(shipment);
    setIsDetailsOpen(true);
  };

  const filteredShipments = useMemo(() => {
    const shipments = credentials.shipments || [];
    if (!searchQuery) return shipments;
    
    const query = searchQuery.toLowerCase();
    return shipments.filter(s => 
      s.orderIncrementId.toLowerCase().includes(query) ||
      s.trackingNumber.toLowerCase().includes(query) ||
      s.customerName.toLowerCase().includes(query) ||
      s.company.toLowerCase().includes(query) ||
      s.carrier.toLowerCase().includes(query) ||
      s.service.toLowerCase().includes(query)
    );
  }, [credentials.shipments, searchQuery]);

  const totalPages = Math.ceil(filteredShipments.length / PAGE_SIZE);
  const paginatedShipments = filteredShipments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const getTrackingUrl = (carrier: string, trackingNumber: string) => {
    return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  };

  const fetchStatus = async (shipment: SawyerShipment): Promise<{ status: string; hasError: boolean }> => {
    // If it's already VOIDED, don't ever overwrite it or check FedEx again
    if (shipment.status === 'VOIDED') {
      return { status: 'VOIDED', hasError: false };
    }
    
    try {
      let newStatus = shipment.status || 'Unknown';
      
      if (shipment.carrier === 'FedEx') {
        const isTrackingSandbox = credentials.fedex.isTrackingSandbox;
        const accountNumber = isTrackingSandbox
          ? (credentials.fedex.sandboxTrackingAccountNumber || credentials.fedex.accountNumber)
          : (credentials.fedex.productionTrackingAccountNumber || credentials.fedex.productionAccountNumber || credentials.fedex.accountNumber);

        const trackingApiKey = isTrackingSandbox 
          ? (credentials.fedex.sandboxTrackingApiKey || credentials.fedex.sandboxApiKey)
          : (credentials.fedex.productionTrackingApiKey || credentials.fedex.productionApiKey);
        
        const trackingSecretKey = isTrackingSandbox
          ? (credentials.fedex.sandboxTrackingSecretKey || credentials.fedex.sandboxSecretKey)
          : (credentials.fedex.productionTrackingSecretKey || credentials.fedex.productionSecretKey);

        const apiKey = trackingApiKey;
        const secretKey = trackingSecretKey;

        if (!apiKey || !secretKey) throw new Error('Missing FedEx credentials');

        const client = new FedExClient(
          apiKey,
          secretKey,
          accountNumber,
          isTrackingSandbox,
          credentials.general.proxyUrl
        );
        const data = await client.trackShipment(shipment.trackingNumber);
        newStatus = data?.output?.completeTrackResults?.[0]?.trackResults?.[0]?.latestStatusDetail?.description || 'Active';
      }
      return { status: newStatus, hasError: false };
    } catch (e) {
      console.error(`Failed to fetch status for ${shipment.trackingNumber}:`, e);
      return { status: shipment.status || 'Active', hasError: true };
    }
  };

  const updateShipmentStatus = async (shipment: SawyerShipment) => {
    // Don't update if voided
    if (shipment.status === 'VOIDED') return;
    
    setRefreshingIds(prev => new Set(prev).add(shipment.id));
    
    try {
      const result = await fetchStatus(shipment);
      
      const updatedShipments = credentials.shipments.map(s => 
        s.id === shipment.id 
          ? { ...s, status: result.status, hasError: result.hasError, lastUpdated: new Date().toISOString() } 
          : s
      );

      await onSave({
        ...credentials,
        shipments: updatedShipments
      });

      if (result.hasError) {
        toast.error(`Could not refresh tracking for ${shipment.trackingNumber}`);
      }
      
    } catch (e) {
      console.error(`Failed to refresh tracking for ${shipment.trackingNumber}:`, e);
    } finally {
      setRefreshingIds(prev => {
        const next = new Set(prev);
        next.delete(shipment.id);
        return next;
      });
    }
  };

  const deleteShipmentRecord = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tracking record? This will not cancel the actual shipment.')) return;
    
    try {
      const updatedShipments = credentials.shipments.filter(s => s.id !== id);
      await onSave({
        ...credentials,
        shipments: updatedShipments
      });
      toast.success("Record deleted successfully.");
    } catch (e) {
      toast.error("Failed to delete record.");
    }
  };

  const voidShipment = async (shipment: SawyerShipment) => {
    if (!confirm(`Are you sure you want to VOID/CANCEL shipment ${shipment.trackingNumber}? This action is permanent.`)) return;
    
    setIsProcessing(true);
    try {
      if (shipment.carrier === 'FedEx') {
        // Use SHIPPING credentials, not tracking ones
        const isSandbox = credentials.fedex.isSandbox;
        // Correctly determine which account number to use for voiding
        // Since Tracking doesn't always know if it was domestic/global easily without the order, 
        // we fallback to common names or legacy accountNumber
        const accountNumber = isSandbox
          ? (credentials.fedex.domesticAccountNumber || credentials.fedex.globalAccountNumber || credentials.fedex.accountNumber)
          : (credentials.fedex.productionAccountNumber || credentials.fedex.accountNumber);

        const apiKey = isSandbox 
          ? (credentials.fedex.sandboxApiKey || credentials.fedex.apiKey)
          : (credentials.fedex.productionApiKey || credentials.fedex.apiKey);
        
        const secretKey = isSandbox
          ? (credentials.fedex.sandboxSecretKey || credentials.fedex.secretKey)
          : (credentials.fedex.productionSecretKey || credentials.fedex.secretKey);

        if (!apiKey || !secretKey) throw new Error('Missing FedEx shipping credentials');

        const client = new FedExClient(
          apiKey,
          secretKey,
          accountNumber,
          isSandbox,
          credentials.general.proxyUrl
        );
        await client.cancelShipment(shipment.trackingNumber);
      }

      // 1.5. Remove from Magento if enabled and NOT sandbox
      const isSandbox = credentials.fedex.isSandbox;
      if (credentials.general.markAsShipped && shipment.orderIncrementId !== 'MANUAL' && !isSandbox) {
        try {
          console.log(`[Tracking] Attempting to remove shipment from Magento logs for ${shipment.orderIncrementId}...`);
          const magento = new MagentoClient(
            credentials.magento.url,
            credentials.magento.token,
            credentials.general.proxyUrl
          );

          // Find the order first to get the entity_id
          const orders = await magento.searchOrders(shipment.orderIncrementId);
          const order = orders.find(o => o.increment_id === shipment.orderIncrementId);

          if (order) {
            const magentoShipmentsList = await magento.getShipments(order.entity_id);
            console.log(`[Tracking] Found ${magentoShipmentsList.length} shipments in Magento for order ${order.entity_id}`);
            
            let matchingShipment = null;
            for (const sItem of magentoShipmentsList) {
              // Deep fetch the shipment to get tracks if not present in list
              try {
                const fullShipment = await magento.getShipment(sItem.entity_id);
                if (fullShipment.tracks?.some((t: any) => t.track_number === shipment.trackingNumber)) {
                  matchingShipment = fullShipment;
                  break;
                }
              } catch (e) {
                console.warn(`[Tracking] Failed to fetch deep info for shipment ${sItem.entity_id}`, e);
              }
            }

            if (matchingShipment) {
              console.log(`[Tracking] Found matching Magento shipment ${matchingShipment.entity_id}. Deleting tracks...`);
              // Even if we can't delete the shipment entity, we MUST delete the track
              if (matchingShipment.tracks) {
                for (const track of matchingShipment.tracks) {
                  if (track.track_number === shipment.trackingNumber) {
                    try {
                      await magento.deleteTrack(track.entity_id);
                      console.log(`[Tracking] Successfully deleted track ${track.entity_id} from Magento`);
                    } catch (trackErr) {
                       console.warn(`[Tracking] Failed to delete track ${track.entity_id}`, trackErr);
                    }
                  }
                }
              }

              // Try deleting the whole shipment record (often restricted, but we try anyway)
              try {
                await magento.deleteShipment(matchingShipment.entity_id);
                console.log(`[Tracking] Successfully deleted shipment record ${matchingShipment.entity_id}`);
              } catch (delError: any) {
                console.info(`[Tracking] Note: Could not delete shipment record ${matchingShipment.entity_id} (REST API often restricts this). Individual tracking was attempted separately.`);
              }
            } else {
              console.log(`[Tracking] No matching Magento shipment found for tracking ${shipment.trackingNumber}`);
            }
          }
        } catch (magentoErr) {
          console.error("[Tracking] Failed to sync void with Magento:", magentoErr);
          // We don't toast error here because the FedEx void was successful, Magento sync is secondary
        }
      }

      // If successful, update the status to Voided
      const updatedShipments = credentials.shipments.map(s => 
        s.id === shipment.id 
          ? { ...s, status: 'VOIDED', lastUpdated: new Date().toISOString() } 
          : s
      );

      await onSave({
        ...credentials,
        shipments: updatedShipments
      });

      toast.success(`Shipment ${shipment.trackingNumber} voided successfully.`);
      
    } catch (e: any) {
      console.error(`Failed to void shipment ${shipment.trackingNumber}:`, e);
      toast.error(`Void failed: ${e.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const refreshPageStatuses = async () => {
    if (isRefreshing) return;
    
    const shipmentsToRefresh = paginatedShipments.filter(s => s.status !== 'VOIDED');
    if (shipmentsToRefresh.length === 0) {
      toast.info("No active shipments to refresh on this page.");
      return;
    }

    setIsRefreshing(true);
    toast.info(`Refreshing ${shipmentsToRefresh.length} shipments sequentially...`);
    
    // Track which ones are currently refreshing for the UI
    setRefreshingIds(new Set(shipmentsToRefresh.map(s => s.id)));
    
    const results: Record<string, { status: string; hasError: boolean }> = {};
    
    try {
      // Process sequentially to be safe with rate limits and state
      for (const shipment of shipmentsToRefresh) {
        results[shipment.id] = await fetchStatus(shipment);
        // Small delay to prevent hammering proxy/APIs
        await new Promise(r => setTimeout(r, 100));
        
        // Update refreshing state as we go
        setRefreshingIds(prev => {
          const next = new Set(prev);
          next.delete(shipment.id);
          return next;
        });
      }

      // One big update at the end to prevent clobbering
      const now = new Date().toISOString();
      const updatedShipments = credentials.shipments.map(s => {
        const result = results[s.id];
        if (result) {
          return { 
            ...s, 
            status: result.status, 
            hasError: result.hasError, 
            lastUpdated: now 
          };
        }
        return s;
      });

      await onSave({
        ...credentials,
        shipments: updatedShipments
      });
      
      toast.success("Tracking statuses updated.");
    } catch (error) {
      console.error("[Tracking] Bulk refresh failed:", error);
      toast.error("An error occurred during bulk refresh.");
    } finally {
      setIsRefreshing(false);
      setRefreshingIds(new Set());
    }
  };

  // Initial refresh of current page on mount? Maybe not auto-refresh all to avoid rate limits
  // but let's do it if they haven't been updated recently and are NOT voided.
  useEffect(() => {
    const now = new Date();
    const needsRefresh = paginatedShipments.filter(s => {
      if (s.status === 'VOIDED') return false;
      if (!s.lastUpdated) return true;
      const last = new Date(s.lastUpdated);
      const diffMs = now.getTime() - last.getTime();
      return diffMs > 1000 * 60 * 30; // 30 minutes
    });

    if (needsRefresh.length > 0 && !isRefreshing) {
      // Don't auto-refresh automatically to be safe with rate limits, 
      // but maybe if only a few items
      if (needsRefresh.length <= 5) {
        needsRefresh.forEach(s => updateShipmentStatus(s));
      }
    }
  }, [currentPage]);

      {/* Auto-maintenance tasks are handled in the main maintenance effect */}

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Tracking</h1>
          <p className="text-zinc-500">Monitor shipments and pull live status updates.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={refreshPageStatuses}
            disabled={isRefreshing || paginatedShipments.length === 0}
          >
            {isRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Refresh Page Statuses
          </Button>
        </div>
      </header>

      <Card className="border-zinc-200">
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <Input
                placeholder="Search order #, tracking, name..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
              {filteredShipments.length} total shipments
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="w-[150px]">Date of Ship</TableHead>
                  <TableHead>Order / Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedShipments.length > 0 ? (
                  paginatedShipments.map((shipment) => (
                    <TableRow key={shipment.id} className="hover:bg-zinc-50/50 transition-colors group">
                      <TableCell className="font-mono text-xs text-zinc-500">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-zinc-400" />
                          {new Date(shipment.shipDate).toLocaleDateString([], { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-bold text-zinc-900 leading-none">#{shipment.orderIncrementId}</p>
                          <p className="text-xs text-zinc-500 font-medium">{shipment.customerName}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-zinc-600 font-medium">
                          {shipment.company || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[9px] font-black uppercase tracking-tighter h-4 px-1 bg-indigo-50 text-indigo-700 border-indigo-200`}>
                              {shipment.carrier}
                            </Badge>
                            <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-900 transition-colors">
                              {shipment.trackingNumber}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-tight font-medium">
                             {shipment.service}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={`shadow-none ${
                            shipment.status?.toLowerCase().includes('delivered') ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
                            shipment.status?.toLowerCase().includes('pick') || shipment.status?.toLowerCase().includes('in transit') ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100' :
                            'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                          }`}>
                            {refreshingIds.has(shipment.id) ? (
                              <Loader2 size={10} className="animate-spin mr-1" />
                            ) : null}
                            {shipment.status || 'Active'}
                          </Badge>
                          
                          {shipment.hasError && !refreshingIds.has(shipment.id) && (
                            <AlertCircle size={14} className="text-red-500" title="Last update attempt failed" />
                          )}

                          {shipment.lastUpdated && !refreshingIds.has(shipment.id) && (
                            <button 
                              onClick={() => updateShipmentStatus(shipment)}
                              className={`w-5 h-5 flex items-center justify-center transition-colors ${shipment.hasError ? 'text-red-400 hover:text-red-600' : 'text-zinc-400 hover:text-zinc-900'}`}
                              title={shipment.hasError ? `Update failed. Last checked: ${new Date(shipment.lastUpdated).toLocaleTimeString()}` : `Last updated: ${new Date(shipment.lastUpdated).toLocaleTimeString()}`}
                            >
                              <RotateCcw size={10} className={shipment.hasError ? "animate-pulse" : ""} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 gap-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                            onClick={() => window.open(getTrackingUrl(shipment.carrier, shipment.trackingNumber), '_blank')}
                          >
                            Go to tracking
                            <ExternalLink size={12} />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem 
                                className="gap-2 cursor-pointer font-bold"
                                onClick={() => handleOpenDetails(shipment)}
                              >
                                <Eye size={14} />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="gap-2 cursor-pointer"
                                onClick={() => updateShipmentStatus(shipment)}
                                disabled={refreshingIds.has(shipment.id)}
                              >
                                <RotateCcw size={14} className={refreshingIds.has(shipment.id) ? "animate-spin" : ""} />
                                Refresh Status
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="gap-2 text-red-600 focus:text-red-600 cursor-pointer"
                                onClick={() => voidShipment(shipment)}
                                disabled={isProcessing || shipment.status === 'VOIDED'}
                              >
                                <Ban size={14} />
                                Void Shipment
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="gap-2 text-red-600 focus:text-red-600 cursor-pointer"
                                onClick={() => deleteShipmentRecord(shipment.id)}
                              >
                                <Trash2 size={14} />
                                Delete Record
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                         <div className="p-4 bg-zinc-50 rounded-full">
                           <Truck className="w-8 h-8 text-zinc-300" />
                         </div>
                         <div className="space-y-1">
                           <p className="font-bold text-zinc-900">No shipments found</p>
                           <p className="text-sm text-zinc-500">Created labels will appear here for tracking.</p>
                         </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                >
                  <ChevronLeft size={14} />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  Next
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-zinc-50/50">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="text-zinc-400" />
                  Order Details
                </DialogTitle>
                <p className="text-sm text-zinc-500">
                  Shipment information for #{selectedShipment?.orderIncrementId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={
                  selectedShipment?.status?.toLowerCase().includes('delivered') ? 'bg-green-100 text-green-700 border-green-200' :
                  selectedShipment?.status?.toLowerCase().includes('voided') ? 'bg-red-100 text-red-700 border-red-200' :
                  'bg-blue-100 text-blue-700 border-blue-200'
                }>
                  {selectedShipment?.status || 'Active'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              {/* Top Banner - Carrier & Tracking */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-100 items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-indigo-100`}>
                    <Truck className={'text-indigo-700'} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Carrier & Tracking</p>
                    <p className="font-bold text-zinc-900">{selectedShipment?.carrier} - {selectedShipment?.trackingNumber}</p>
                    <p className="text-xs text-zinc-500">{selectedShipment?.service}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-2">
                   <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-9 gap-2"
                    onClick={() => window.open(getTrackingUrl(selectedShipment?.carrier || '', selectedShipment?.trackingNumber || ''), '_blank')}
                   >
                     <Search size={14} />
                     Track Live
                   </Button>
                   {selectedShipment?.labelBase64 && (
                     <Button 
                        variant="default" 
                        size="sm" 
                        className="h-9 gap-2 bg-zinc-900"
                        onClick={() => {
                          const b64 = selectedShipment.labelBase64!;
                          const type = credentials.general.labelFormat === 'ZPL' ? 'text/plain' : 'application/pdf';
                          const binStr = atob(b64);
                          const len = binStr.length;
                          const arr = new Uint8Array(len);
                          for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
                          const blob = new Blob([arr], { type });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                        }}
                      >
                       <Printer size={14} />
                       View Label
                     </Button>
                   )}
                   {!selectedShipment?.labelBase64 && selectedShipment?.shipDate && (
                     <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 border border-zinc-200 text-[10px] font-medium text-zinc-500 italic">
                       <AlertCircle size={10} />
                       Label purged ({ATTACHMENT_PURGE_HOURS}h limit)
                     </div>
                   )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Customer Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-900 uppercase tracking-tight">
                    <User size={16} className="text-zinc-400" />
                    Recipient
                  </div>
                  <div className="space-y-1.5 pl-6 border-l-2 border-zinc-100">
                    <p className="font-bold text-zinc-900">{selectedShipment?.customerName}</p>
                    {selectedShipment?.company && <p className="text-sm text-zinc-600">{selectedShipment.company}</p>}
                    {selectedShipment?.address && (
                      <div className="space-y-0.5 pt-1">
                        {selectedShipment.address.street.map((line, i) => (
                           <p key={i} className="text-sm text-zinc-500">{line}</p>
                        ))}
                        <p className="text-sm text-zinc-500">
                          {selectedShipment.address.city}, {selectedShipment.address.region} {selectedShipment.address.postcode}
                        </p>
                        <p className="text-sm text-zinc-500">{selectedShipment.address.country}</p>
                      </div>
                    )}
                    {(selectedShipment?.address?.telephone || selectedShipment?.address?.email) && (
                      <div className="pt-2 flex flex-col gap-1">
                        {selectedShipment.address.telephone && <p className="text-xs text-zinc-400">T: {selectedShipment.address.telephone}</p>}
                        {selectedShipment.address.email && <p className="text-xs text-zinc-400 font-medium italic underline decoration-zinc-200">E: {selectedShipment.address.email}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Billing Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-900 uppercase tracking-tight">
                    <CreditCard size={16} className="text-zinc-400" />
                    Billing & Charges
                  </div>
                  <div className="space-y-3 pl-6 border-l-2 border-zinc-100">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-zinc-400">Shipping Costs</p>
                      <p className="text-sm font-bold text-zinc-900 capitalize">
                        {selectedShipment?.billing?.shipping || 'Shipper'}
                        {selectedShipment?.billing?.shippingAccountNumber && (
                          <span className="text-zinc-400 font-mono text-xs ml-2">({selectedShipment.billing.shippingAccountNumber})</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-zinc-400">Duties & Taxes</p>
                      <p className="text-sm font-bold text-zinc-900 capitalize">
                        {selectedShipment?.billing?.duties || 'Shipper'}
                        {selectedShipment?.billing?.dutiesAccountNumber && (
                          <span className="text-zinc-400 font-mono text-xs ml-2">({selectedShipment.billing.dutiesAccountNumber})</span>
                        )}
                      </p>
                    </div>
                    {selectedShipment?.shipDate && (
                      <div>
                        <p className="text-[10px] uppercase font-bold text-zinc-400">Shipment Date</p>
                        <p className="text-sm font-bold text-zinc-900 italic">
                          {new Date(selectedShipment.shipDate).toLocaleDateString(undefined, { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Items & Packages */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-900 uppercase tracking-tight">
                    <Package size={16} className="text-zinc-400" />
                    Items & Packages
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Items list */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-zinc-400">Shipment Contents</p>
                    <div className="space-y-2">
                      {selectedShipment?.items && selectedShipment.items.length > 0 ? (
                        selectedShipment.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-white shadow-sm hover:border-zinc-300 transition-colors">
                            <div className="space-y-0.5">
                              <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{item.sku}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-zinc-900">x{item.qty}</p>
                              <p className="text-[10px] text-zinc-400">{credentials.general.currency} {item.price.toFixed(2)}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-500 italic pl-2 border-l-2 border-zinc-100">No items listed for this shipment.</p>
                      )}
                    </div>
                  </div>

                  {/* Packages info */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-zinc-400">Package Details</p>
                    <div className="space-y-2">
                       {selectedShipment?.packages && selectedShipment.packages.length > 0 ? (
                          selectedShipment.packages.map((pkg, idx) => (
                            <div key={idx} className="p-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 flex items-center gap-4">
                              <div className="w-8 h-8 rounded bg-white border flex items-center justify-center text-xs font-bold text-zinc-400">
                                {idx + 1}
                              </div>
                              <div className="grid grid-cols-2 gap-x-8 gap-y-1 flex-1">
                                <div>
                                  <p className="text-[9px] uppercase font-bold text-zinc-400">Weight</p>
                                  <p className="text-xs font-bold text-zinc-900">{pkg.weight} KG</p>
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase font-bold text-zinc-400">Dimensions</p>
                                  <p className="text-xs font-bold text-zinc-900">{pkg.length} x {pkg.width} x {pkg.height} CM</p>
                                </div>
                              </div>
                            </div>
                          ))
                       ) : (
                         <p className="text-sm text-zinc-500 italic pl-2 border-l-2 border-zinc-100">No package dimensions recorded.</p>
                       )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <div className="p-6 border-t bg-zinc-50/50 flex justify-end">
            <Button onClick={() => setIsDetailsOpen(false)} variant="outline">Close Details</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
