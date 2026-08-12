import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { SawyerCredentials, AddressBookCustomer } from '@/src/hooks/use-sawyer-storage';
import { 
  Search, 
  Plus, 
  Upload, 
  Trash2, 
  User, 
  MapPin, 
  Building2, 
  Mail, 
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Download,
  Pencil,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { COUNTRY_NAMES } from '@/src/lib/countries';

export default function AddressBook({ 
  credentials, 
  onSave 
}: { 
  credentials: SawyerCredentials, 
  onSave: (data: SawyerCredentials) => Promise<void> 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmImportOpen, setIsConfirmImportOpen] = useState(false);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'update' | 'clear'>('update');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Edit Customer State
  const [editingCustomer, setEditingCustomer] = useState<AddressBookCustomer | null>(null);

  // New Customer State
  const [newCustomer, setNewCustomer] = useState<Partial<AddressBookCustomer>>({
    reference: '',
    fullname: '',
    company: '',
    email: '',
    telephone: '',
    street1: '',
    street2: '',
    street3: '',
    city: '',
    region: '',
    postcode: '',
    country: 'GB',
    residential: false
  });

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return credentials.addressBook.filter(c => 
      c.reference.toLowerCase().includes(query) ||
      c.fullname?.toLowerCase().includes(query) ||
      c.company?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query)
    ).sort((a, b) => a.reference.localeCompare(b.reference));
  }, [credentials.addressBook, searchQuery]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  // Reset page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleAddCustomer = async () => {
    if (!newCustomer.reference || !newCustomer.street1 || !newCustomer.city || !newCustomer.postcode) {
      toast.error("Please fill in reference, street, city and postcode.");
      return;
    }

    const customer: AddressBookCustomer = {
      ...newCustomer as AddressBookCustomer,
      id: crypto.randomUUID(),
    };

    const updatedBook = [...credentials.addressBook, customer];
    await onSave({ ...credentials, addressBook: updatedBook });
    setIsAddDialogOpen(false);
    setNewCustomer({
      reference: '',
      fullname: '',
      company: '',
      email: '',
      telephone: '',
      street1: '',
      street2: '',
      street3: '',
      city: '',
      region: '',
      postcode: '',
      country: 'GB',
      residential: false
    });
    toast.success("Customer added to address book.");
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer || !editingCustomer.reference || !editingCustomer.street1 || !editingCustomer.city || !editingCustomer.postcode) {
      toast.error("Please fill in reference, street, city and postcode.");
      return;
    }

    const updatedBook = credentials.addressBook.map(c => 
      c.id === editingCustomer.id ? editingCustomer : c
    );
    await onSave({ ...credentials, addressBook: updatedBook });
    setIsEditDialogOpen(false);
    setEditingCustomer(null);
    toast.success("Customer updated.");
  };

  const handleDeleteCustomer = async (id: string) => {
    const updatedBook = credentials.addressBook.filter(c => c.id !== id);
    await onSave({ ...credentials, addressBook: updatedBook });
    toast.success("Customer removed.");
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please select a file to import.");
      return;
    }

    setIsImportLoading(true);
    try {
      const text = await importFile.text();
      
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const rows = results.data as any[];
            
            if (rows.length === 0) {
              throw new Error("The file appears to be empty.");
            }

            // Normalise row keys to handle potential whitespace or BOM
            const imported: AddressBookCustomer[] = rows.map((rawRow: any) => {
              const row: any = {};
              Object.keys(rawRow).forEach(key => {
                const cleanKey = key.trim().replace(/^\uFEFF/, '');
                row[cleanKey] = typeof rawRow[key] === 'string' ? rawRow[key].trim() : rawRow[key];
              });

              return {
                id: crypto.randomUUID(),
                reference: row['Reference'] || '',
                company: row['Name'] || '',
                email: row['Email'] || '',
                telephone: row['Telephone Number'] || '',
                street1: row['Address - Address Line 1'] || '',
                street2: row['Address - Address Line 2'] || '',
                street3: row['Address - Address Line 3'] || '',
                city: row['Address - Address Line 4'] || '',
                region: row['Address - Address Line 5'] || '',
                postcode: row['Address - Post Code'] || '',
                country: row['Country - Country Name'] || 'GB',
                residential: row['Residential']?.toLowerCase() === 'yes' || row['Residential']?.toLowerCase() === 'true' || row['Is Residential']?.toLowerCase() === 'yes' || row['Is Residential']?.toLowerCase() === 'true' || false,
                fullname: row['Full Name'] || row['Name'] || ''
              };
            }).filter(c => c.reference && c.street1 && c.city && c.postcode);

            if (imported.length === 0) {
              throw new Error("No valid customer records found. Please check column headers and required fields.");
            }

            let finalBook: AddressBookCustomer[] = [];
            if (importMode === 'clear') {
              finalBook = imported;
            } else {
              const bookMap = new Map(credentials.addressBook.map(c => [c.reference, c]));
              imported.forEach(c => bookMap.set(c.reference, c));
              finalBook = Array.from(bookMap.values());
            }

            await onSave({ ...credentials, addressBook: finalBook });
            toast.success(`Imported ${imported.length} customers successfully.`);
            setImportFile(null);
            setIsConfirmImportOpen(false);
            const fileInput = document.getElementById('import-file') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
          } catch (e: any) {
            toast.error(`Import processing error: ${e.message}`);
          } finally {
            setIsImportLoading(false);
          }
        },
        error: (error) => {
          toast.error(`CSV Parsing error: ${error.message}`);
          setIsImportLoading(false);
        }
      });
    } catch (e: any) {
      toast.error(`File reading error: ${e.message}`);
      setIsImportLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-zinc-50/80 backdrop-blur-md z-10 py-4 -mt-4 border-b border-zinc-200 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Address Book</h1>
          <p className="text-zinc-500">Manage customers and shipping contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger 
              render={
                <Button 
                  variant="outline" 
                  disabled={credentials.addressBook.length === 0}
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2"
                >
                  <Trash2 size={18} />
                  Clear Book
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Address Book?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will PERMANENTLY delete all {credentials.addressBook.length} contacts in your address book. 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={async () => {
                    await onSave({ ...credentials, addressBook: [] });
                    toast.success("Address book cleared.");
                  }} 
                  className="bg-red-600 hover:bg-red-700 text-white border-none"
                >
                  Yes, Clear All Contacts
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger 
            render={
              <Button className="bg-zinc-900 hover:bg-zinc-800 gap-2 shadow-lg">
                <Plus size={18} />
                Add Customer
              </Button>
            }
          />
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>Create a new contact in your address book. Use the reference field to identify them easily.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ref">Exclusive Reference <span className="text-red-500">*</span></Label>
                <Input 
                  id="ref" 
                  placeholder="e.g. ABC001" 
                  value={newCustomer.reference}
                  onChange={(e) => setNewCustomer({ ...newCustomer, reference: e.target.value })}
                />
                <p className="text-[10px] text-zinc-500 italic">This reference is only used for your records in the address book.</p>
              </div>
              
              <div className="col-span-2 space-y-2">
                <Label htmlFor="fullname">Full Name</Label>
                <Input 
                  id="fullname" 
                  value={newCustomer.fullname}
                  onChange={(e) => setNewCustomer({ ...newCustomer, fullname: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="comp">Company</Label>
                <Input 
                  id="comp" 
                  value={newCustomer.company}
                  onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="addr1">Address Line 1<span className="text-red-500">*</span></Label>
                <Input 
                  id="addr1" 
                  value={newCustomer.street1}
                  onChange={(e) => setNewCustomer({ ...newCustomer, street1: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="addr2">Address Line 2</Label>
                <Input 
                  id="addr2" 
                  value={newCustomer.street2}
                  onChange={(e) => setNewCustomer({ ...newCustomer, street2: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="addr3">Address Line 3</Label>
                <Input 
                  id="addr3" 
                  value={newCustomer.street3}
                  onChange={(e) => setNewCustomer({ ...newCustomer, street3: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City <span className="text-red-500">*</span></Label>
                <Input 
                  id="city" 
                  value={newCustomer.city}
                  onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg">Region</Label>
                <Input 
                  id="reg" 
                  value={newCustomer.region}
                  onChange={(e) => setNewCustomer({ ...newCustomer, region: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post">Postcode<span className="text-red-500">*</span></Label>
                <Input 
                  id="post" 
                  value={newCustomer.postcode}
                  onChange={(e) => setNewCustomer({ ...newCustomer, postcode: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input 
                  id="phone" 
                  value={newCustomer.telephone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, telephone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select 
                  value={newCustomer.country} 
                  onValueChange={(v) => setNewCustomer({ ...newCustomer, country: v })}
                >
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                      <SelectItem key={code} value={code}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-8">
                <input 
                  type="checkbox" 
                  id="res"
                  checked={newCustomer.residential}
                  onChange={(e) => setNewCustomer({ ...newCustomer, residential: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 focus:ring-zinc-900"
                />
                <Label htmlFor="res">Residential Address</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCustomer} className="bg-zinc-900 hover:bg-zinc-800">Add to Book</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Results */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3 border-b border-zinc-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Saved Contacts</CardTitle>
                <CardDescription>{filteredCustomers.length} results found</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search contacts..."
                  className="pl-9 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredCustomers.length > 50 && (
                <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                  <div className="text-xs text-zinc-500">
                    Showing <span className="font-medium text-zinc-900">{((currentPage - 1) * 50) + 1}</span> to <span className="font-medium text-zinc-900">{Math.min(currentPage * 50, filteredCustomers.length)}</span> of <span className="font-medium text-zinc-900">{filteredCustomers.length}</span> results
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8" 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <div className="flex items-center px-4 text-xs font-medium">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8" 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
              {filteredCustomers.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                    <User size={24} />
                  </div>
                  <h3 className="font-semibold text-zinc-900">No contacts found</h3>
                  <p className="text-zinc-500 text-sm">Add a customer to the address book or import them from a CSV file.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-zinc-100">
                    {paginatedCustomers.map((customer) => (
                      <div key={customer.id} className="p-4 flex items-start justify-between group hover:bg-zinc-50 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-zinc-900">{customer.reference}</h4>
                            {customer.residential && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold rounded uppercase tracking-wider">Residential</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <User size={12} className="shrink-0" />
                              <span>{customer.fullname || 'No Name Set'}</span>
                            </div>
                            {customer.company && (
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <Building2 size={12} className="shrink-0" />
                                <span className="truncate">{customer.company}</span>
                              </div>
                            )}
                            <div className="flex items-start gap-2 text-xs text-zinc-500">
                              <MapPin size={12} className="mt-0.5 shrink-0" />
                              <span className="truncate">
                                {[customer.street1, customer.street2, customer.street3].filter(Boolean).join(', ')}, {customer.city}, {customer.postcode}, {customer.country}
                              </span>
                            </div>
                            {(customer.email || customer.telephone) && (
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                {customer.email ? <Mail size={12} /> : <Phone size={12} />}
                                <span>{customer.email || customer.telephone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-zinc-900"
                            onClick={() => {
                              setEditingCustomer(customer);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger 
                              render={
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-500">
                                  <Trash2 size={14} />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Customer?</AlertDialogTitle>
                                <AlertDialogDescription>Are you sure you want to delete "{customer.reference}"? This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id)} className="bg-red-600 hover:bg-red-700 text-white border-none">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-zinc-100 bg-zinc-50/50">
                      <p className="text-xs text-zinc-500">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length} results
                      </p>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8" 
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(prev => prev - 1)}
                        >
                          <ChevronLeft size={16} />
                        </Button>
                        <div className="flex items-center px-4 text-xs font-medium">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8" 
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(prev => prev + 1)}
                        >
                          <ChevronRight size={16} />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Import */}
        <div className="space-y-6">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-zinc-900" />
                <CardTitle className="text-lg">Bulk Import</CardTitle>
              </div>
              <CardDescription>Import your customer list from a CSV (UTF-8) file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* File Selector */}
              <div className="space-y-2">
                <Label htmlFor="import-file">Upload CSV File</Label>
                <div className="relative group">
                  <div className="absolute inset-0 border-2 border-dashed border-zinc-200 rounded-lg group-hover:border-zinc-400 transition-colors pointer-events-none" />
                  <Input 
                    id="import-file" 
                    type="file" 
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="opacity-0 w-full h-32 cursor-pointer z-10 relative"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pointer-events-none">
                    {importFile ? (
                      <>
                        <FileText size={24} className="text-zinc-900 mb-2" />
                        <span className="text-sm font-medium text-zinc-900 truncate max-w-full">
                          {importFile.name}
                        </span>
                        <span className="text-[10px] text-zinc-500">{(importFile.size / 1024).toFixed(2)} KB</span>
                      </>
                    ) : (
                      <>
                        <Download size={24} className="text-zinc-400 mb-2" />
                        <span className="text-sm text-zinc-500">Drag and drop or click to select CSV</span>
                        <span className="text-[10px] text-zinc-400 mt-1">Accepts UTF-8 CSV with required headers</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Import Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-zinc-50 cursor-pointer transition-all" onClick={() => setImportMode('update')}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${importMode === 'update' ? 'border-zinc-900' : 'border-zinc-300'}`}>
                      {importMode === 'update' && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-zinc-900">Add / Update</p>
                      <p className="text-[10px] text-zinc-500">Merge with existing contacts. Matches on reference.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-zinc-50 cursor-pointer transition-all" onClick={() => setImportMode('clear')}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${importMode === 'clear' ? 'border-zinc-900' : 'border-zinc-300'}`}>
                      {importMode === 'clear' && <div className="w-2 h-2 rounded-full bg-zinc-900" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-zinc-900">Clear Existing</p>
                      <p className="text-[10px] text-zinc-500 text-red-600 font-medium">Delete all current contacts first.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proceed Button with Confirmation */}
              <AlertDialog open={isConfirmImportOpen} onOpenChange={setIsConfirmImportOpen}>
                <AlertDialogTrigger 
                  render={
                    <Button 
                      className="w-full bg-zinc-900 hover:bg-zinc-800 gap-2"
                      disabled={!importFile || isImportLoading}
                      onClick={() => setIsConfirmImportOpen(true)}
                    >
                      {isImportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 size={18} />}
                      Proceed to Import
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertCircle size={20} className="text-zinc-900" />
                      Confirm Import
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {importMode === 'clear' 
                        ? "This will PERMANENTLY delete all your current address book contacts and replace them with the data from the selected file. Are you sure?" 
                        : "This will add new contacts and update existing ones from the selected file. Continue?"}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleImport} className="bg-zinc-900 hover:bg-zinc-800 text-white border-none">Yes, Import Contacts</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="bg-zinc-900 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText size={16} /> CSV Header Requirements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-[10px] bg-zinc-800 p-3 rounded-lg overflow-x-auto text-zinc-400 font-mono space-y-2">
                <p className="text-white border-b border-zinc-700 pb-1">Required Headings:</p>
                <p>Reference, Name, Email, Telephone Number, Address - Address Line 1, Address - Address Line 2, Address - Address Line 3, Address - Address Line 4, Address - Address Line 5, Address - Post Code, Country - Country Name, Id</p>
              </div>
              <ul className="mt-3 space-y-2 text-[10px] text-zinc-400 list-disc pl-4">
                <li>Ensure file is saved as <strong>CSV UTF-8</strong>.</li>
                <li><strong>Reference</strong> is used for matching during Add/Update.</li>
                <li><strong>Name</strong> is mapped to Company.</li>
                <li><strong>Line 4</strong> is City, <strong>Line 5</strong> is Region.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Update contact information for "{editingCustomer?.reference}".</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-ref">Exclusive Reference <span className="text-red-500">*</span></Label>
              <Input 
                id="edit-ref" 
                value={editingCustomer?.reference || ''}
                readOnly
                className="bg-zinc-50"
              />
              <p className="text-[10px] text-zinc-500 italic">References cannot be changed as they are used for matching during imports.</p>
            </div>
            
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-fullname">Full Name</Label>
              <Input 
                id="edit-fullname" 
                value={editingCustomer?.fullname || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, fullname: e.target.value } : null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-comp">Company</Label>
              <Input 
                id="edit-comp" 
                value={editingCustomer?.company || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, company: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input 
                id="edit-email" 
                type="email"
                value={editingCustomer?.email || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, email: e.target.value } : null)}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-addr1">Address Line 1<span className="text-red-500">*</span></Label>
              <Input 
                id="edit-addr1" 
                value={editingCustomer?.street1 || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, street1: e.target.value } : null)}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-addr2">Address Line 2</Label>
              <Input 
                id="edit-addr2" 
                value={editingCustomer?.street2 || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, street2: e.target.value } : null)}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-addr3">Address Line 3</Label>
              <Input 
                id="edit-addr3" 
                value={editingCustomer?.street3 || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, street3: e.target.value } : null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-city">City <span className="text-red-500">*</span></Label>
              <Input 
                id="edit-city" 
                value={editingCustomer?.city || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, city: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reg">Region</Label>
              <Input 
                id="edit-reg" 
                value={editingCustomer?.region || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, region: e.target.value } : null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-post">Postcode<span className="text-red-500">*</span></Label>
              <Input 
                id="edit-post" 
                value={editingCustomer?.postcode || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, postcode: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input 
                id="edit-phone" 
                value={editingCustomer?.telephone || ''}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, telephone: e.target.value } : null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-country">Country</Label>
              <Select 
                value={editingCustomer?.country || 'GB'} 
                onValueChange={(v) => setEditingCustomer(prev => prev ? { ...prev, country: v } : null)}
              >
                <SelectTrigger id="edit-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <SelectItem key={code} value={code}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-8">
              <input 
                type="checkbox" 
                id="edit-res"
                checked={editingCustomer?.residential || false}
                onChange={(e) => setEditingCustomer(prev => prev ? { ...prev, residential: e.target.checked } : null)}
                className="w-4 h-4 rounded border-zinc-300 focus:ring-zinc-900"
              />
              <Label htmlFor="edit-res">Residential Address</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateCustomer} className="bg-zinc-900 hover:bg-zinc-800">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
