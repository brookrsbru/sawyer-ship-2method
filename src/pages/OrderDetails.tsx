import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Truck, MapPin, User, ArrowLeft, Loader2, Printer, CheckCircle2, Pencil, X, RotateCcw, Search, Book, ArrowRight, ChevronLeft, ChevronRight, Box, Trash2, Copy, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MagentoOrder, FedExClient, MagentoClient } from '@/src/lib/api-clients';
import { SawyerCredentials, AddressBookCustomer, SawyerShipment } from '@/src/hooks/use-sawyer-storage';
import { PDFDocument } from 'pdf-lib';
import { COUNTRY_NAMES, getCountryCode } from '@/src/lib/countries';
import { normalizeRegion } from '@/src/lib/regions';
import { toast } from 'sonner';

interface Parcel {
  id: string;
  weightKg: string;
  weightG: string;
  weight: string;
  length: string;
  width: string;
  height: string;
}

export default function OrderDetails({ credentials, onSave }: { credentials: SawyerCredentials, onSave: (creds: SawyerCredentials) => Promise<void> }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const createBlankOrder = (): MagentoOrder => ({
    entity_id: 0,
    increment_id: 'MANUAL',
    customer_email: '',
    customer_firstname: '',
    customer_lastname: '',
    grand_total: 0,
    status: 'manual',
    created_at: new Date().toISOString(),
    shipping_address: {
      firstname: '',
      lastname: '',
      company: '',
      street: ['', '', ''],
      city: '',
      region: '',
      postcode: '',
      country_id: 'GB',
      telephone: '',
      is_residential: false
    },
    items: []
  });

  const [order, setOrder] = useState<MagentoOrder | null>(() => {
    if (id === 'manual') return createBlankOrder();
    return location.state?.order || null;
  });
  const [productDetails, setProductDetails] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attributeOptions, setAttributeOptions] = useState<Record<string, any[]>>({});
  
  // Refs to track what has been fetched or applied to prevent overwriting local edits
  const fetchedOrderIdRef = React.useRef<string | null>(null);
  const fetchedProductsForIdRef = React.useRef<string | null>(null);
  const defaultsAppliedForRef = React.useRef<{id: string, country: string} | null>(null);

  // Package details
  const [weight, setWeight] = useState('1.0');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  
  // Multiple parcels state
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [isParcelModalOpen, setIsParcelModalOpen] = useState(false);
  
  const [rates, setRates] = useState<any[]>([]);
  const [isRating, setIsRating] = useState(false);
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [isShipping, setIsShipping] = useState(false);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isLabelViewerOpen, setIsLabelViewerOpen] = useState(false);
  const [fullNameInput, setFullNameInput] = useState("");
  const [addressBookSync, setAddressBookSync] = useState(false);
  const [addressBookRef, setAddressBookRef] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [addressPage, setAddressPage] = useState(1);
  const ADDRESSES_PER_PAGE = 10;

  // Address Validation State
  const [isFedExValid, setIsFedExValid] = useState<'none' | 'loading' | 'valid' | 'invalid'>('none');
  const [isValidatingFedEx, setIsValidatingFedEx] = useState(false);
  const [recommendedResidential, setRecommendedResidential] = useState<boolean | null>(null);

  // Weight fields
  const [weightKg, setWeightKg] = useState('');
  const [weightG, setWeightG] = useState('');
  const [billShippingTo, setBillShippingTo] = useState('shipper');
  const [billDutiesTo, setBillDutiesTo] = useState('shipper');
  const [shipAccountNumber, setShipAccountNumber] = useState('');
  const [dutyAccountNumber, setDutyAccountNumber] = useState('');

  const getCarrierCountryCode = (code: string | undefined) => {
    const isoCode = getCountryCode(code);
    return isoCode === 'XI' ? 'GB' : isoCode;
  };

  const getCarrierRegion = (region: string | undefined, countryCode: string | undefined) => {
    const isoCountry = getCarrierCountryCode(countryCode);
    if (isoCountry === 'GB' || isoCountry === 'XI') return undefined;
    return normalizeRegion(region || '', isoCountry);
  };

  const getCarrierStreetLines = (street: (string | undefined)[] | undefined, region: string | undefined): string[] => {
    const lines = [...(street || ['', '', ''])];
    if (!lines[2] && region) {
      lines[2] = region;
    }
    return lines.filter(Boolean);
  };

  useEffect(() => {
    if (order && !fullNameInput) {
      setFullNameInput(`${order.customer_firstname} ${order.customer_lastname}`.trim());
    }
  }, [order, fullNameInput]);

  useEffect(() => {
    if (order && order.items && order.items.length > 0) {
      const fetchOptions = async () => {
        try {
          const client = new MagentoClient(
            credentials.magento.url,
            credentials.magento.token,
            credentials.general.proxyUrl
          );
          // Fetch options for attributes that might be dropdowns
          const codes = ['commodity_code', 'harmonized_system_code'];
          const optionsMap: Record<string, any[]> = {};
          
          for (const code of codes) {
            const options = await client.getAttributeOptions(code);
            optionsMap[code] = options;
          }
          
          setAttributeOptions(optionsMap);
        } catch (e) {
          console.error("Failed to fetch attribute options:", e);
        }
      };
      fetchOptions();
    }
  }, [order?.increment_id]);

  // Apply defaults
  useEffect(() => {
    if (order && credentials.shippingDefaults) {
      const destCountry = order.shipping_address?.country_id;
      const orderId = String(order.entity_id || order.increment_id);
      
      // Check if we already applied defaults for this order and country
      if (defaultsAppliedForRef.current?.id === orderId && 
          defaultsAppliedForRef.current?.country === destCountry) {
        return;
      }

      console.log(`[OrderDetails] Applying shipping defaults for ${destCountry}`);
      const countryDefaults = credentials.countryDefaults?.[destCountry || ''];
      const defaults = countryDefaults || credentials.shippingDefaults;
      
      // Check if we should apply based on per-field overwrite or if empty
      const applyWeightKg = defaults.overwriteWeightKg || !weightKg;
      const applyWeightG = defaults.overwriteWeightG || !weightG;
      const applyLength = defaults.overwriteLength || !length;
      const applyWidth = defaults.overwriteWidth || !width;
      const applyHeight = defaults.overwriteHeight || !height;
      const applyBillShip = defaults.overwriteBillShippingTo || !billShippingTo;
      const applyBillDuty = defaults.overwriteBillDutiesTo || !billDutiesTo;

      if (applyWeightKg && defaults.weightKg) setWeightKg(defaults.weightKg);
      if (applyWeightG && defaults.weightG) setWeightG(defaults.weightG);
      if (applyLength && defaults.length) setLength(defaults.length);
      if (applyWidth && defaults.width) setWidth(defaults.width);
      if (applyHeight && defaults.height) setHeight(defaults.height);
      if (applyBillShip && defaults.billShippingTo) setBillShippingTo(defaults.billShippingTo);
      if (applyBillDuty && defaults.billDutiesTo) setBillDutiesTo(defaults.billDutiesTo);

      // Mark as applied
      defaultsAppliedForRef.current = { id: orderId, country: destCountry || '' };
    }
  }, [order?.entity_id, order?.increment_id, order?.shipping_address?.country_id, credentials.shippingDefaults, credentials.countryDefaults]);

  // Editing state
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isManualReady, setIsManualReady] = useState(false);

  // Sync weight when Kg or G changes
  useEffect(() => {
    const kg = parseFloat(weightKg) || 0;
    const g = parseFloat(weightG) || 0;
    const totalKg = kg + (g / 1000);
    setWeight(totalKg.toString());
  }, [weightKg, weightG]);

  const handleWeightKgChange = (val: string) => {
    setWeightKg(val);
  };

  const handleWeightKgBlur = () => {
    const mode = credentials.general.weightDisplayMode || 'both';
    const num = parseFloat(weightKg);
    if (!isNaN(num) && mode === 'both') {
      const kg = Math.floor(num);
      const remainder = num - kg;
      if (remainder > 0) {
        setWeightKg(kg.toString());
        setWeightG((Math.round(remainder * 1000)).toString());
      }
    }
  };

  const handleWeightGChange = (val: string) => {
    setWeightG(val);
  };

  const handleSelectAddress = (customer: any) => {
    if (!order) return;
    const parts = customer.fullname.trim().split(' ');
    const first = parts[0] || '';
    const last = parts.slice(1).join(' ') || '';
    
    setFullNameInput(customer.fullname);
    setAddressBookRef(customer.reference || '');
    setOrder({
      ...order,
      customer_email: customer.email || '',
      customer_firstname: first,
      customer_lastname: last,
      shipping_address: {
        ...order.shipping_address!,
        firstname: first,
        lastname: last,
        company: customer.company || '',
        street: [customer.street1 || '', customer.street2 || '', customer.street3 || ''],
        city: customer.city || '',
        region: customer.region || '',
        postcode: customer.postcode || '',
        country_id: getCountryCode(customer.country),
        telephone: customer.telephone || '',
        is_residential: !!customer.residential
      }
    });
    toast.success(`Loaded address`);
  };

  const handleWeightGBlur = () => {
    const mode = credentials.general.weightDisplayMode || 'both';
    const num = parseFloat(weightG);
    if (!isNaN(num) && num >= 1000 && mode === 'both') {
      const extraKg = Math.floor(num / 1000);
      const remainingG = num % 1000;
      setWeightKg(extraKg.toString());
      setWeightG(isNaN(remainingG) ? '0' : Math.round(remainingG).toString());
    }
  };

  const handleValidateAddress = async () => {
    if (!order?.shipping_address || !credentials.fedex.enabled) return;
    
    setIsValidatingFedEx(true);
    setIsFedExValid('loading');
    
    try {
      const isDomestic = order.shipping_address.country_id === credentials.general.originCountry;
        const accountNumber = credentials.fedex.isSandbox
        ? (isDomestic ? (credentials.fedex.domesticAccountNumber || credentials.fedex.accountNumber) : (credentials.fedex.globalAccountNumber || credentials.fedex.accountNumber))
        : (credentials.fedex.productionAccountNumber || credentials.fedex.accountNumber);

      const fedex = new FedExClient(
        credentials.fedex.isSandbox ? credentials.fedex.sandboxApiKey : credentials.fedex.productionApiKey,
        credentials.fedex.isSandbox ? credentials.fedex.sandboxSecretKey : credentials.fedex.productionSecretKey,
        accountNumber,
        credentials.fedex.isSandbox,
        credentials.general.proxyUrl
      );

      const params = {
        addressesToValidate: [
          {
            address: {
              streetLines: getCarrierStreetLines(order.shipping_address.street, order.shipping_address.region),
              city: order.shipping_address.city,
              stateOrProvinceCode: getCarrierRegion(order.shipping_address.region, order.shipping_address.country_id),
              postalCode: order.shipping_address.postcode,
              countryCode: getCarrierCountryCode(order.shipping_address.country_id)
            }
          }
        ]
      };

      const result = await fedex.validateAddress(params);
      const addressResult = result?.output?.resolvedAddresses?.[0];
      
      if (addressResult && addressResult.classification !== 'UNDETERMINED' && !addressResult.attributes?.Resolved) {
         // Some rudimentary check or based on state
      }

      // FedEx resolve API returns results. If it found a match, it's usually valid.
      // Typical check is addressResult.attributes.Resolved === "true" or similar.
      // Let's check status.
      const isValid = addressResult && (addressResult.customerMessage?.toLowerCase().includes('success') || (addressResult.attributes && Object.keys(addressResult.attributes).length > 0));
      
      // More specifically, if addressResult.attributes.Resolved is true or similar.
      // For now, let's look at alerts.
      const hasAlerts = addressResult?.alerts?.some((a: any) => a.alertType === 'FAILURE' || a.alertType === 'ERROR');
      
      if (addressResult && !hasAlerts) {
        setIsFedExValid('valid');
        const isResidential = addressResult.classification === 'RESIDENTIAL';
        setRecommendedResidential(isResidential);
        if (order) {
          setOrder(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              shipping_address: {
                ...prev.shipping_address,
                is_residential: isResidential
              }
            };
          });
        }
      } else {
        setIsFedExValid('invalid');
      }
    } catch (e) {
      console.error("[FedEx Address Validation] Error:", e);
      setIsFedExValid('invalid');
    } finally {
      setIsValidatingFedEx(false);
    }
  };

  // Trigger validation when relevant address fields change
  useEffect(() => {
    if (order?.shipping_address) {
      const addr = order.shipping_address;
      if (addr.street.some(s => s.length > 5) && addr.city && addr.postcode && addr.country_id) {
        const timer = setTimeout(() => {
          handleValidateAddress();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [
    order?.shipping_address?.street,
    order?.shipping_address?.city,
    order?.shipping_address?.region,
    order?.shipping_address?.postcode,
    order?.shipping_address?.country_id
  ]);

  const handleContinueToShipping = async () => {
    if (id === 'manual' && addressBookSync && addressBookRef.trim()) {
      try {
        const addr = order!.shipping_address!;
        const newEntry: AddressBookCustomer = {
          id: '', // Will be set/replaced
          reference: addressBookRef.trim().toUpperCase(),
          fullname: fullNameInput,
          company: addr.company,
          email: order!.customer_email,
          telephone: addr.telephone,
          street1: addr.street[0] || '',
          street2: addr.street[1] || '',
          street3: addr.street[2] || '',
          city: addr.city,
          region: addr.region,
          postcode: addr.postcode,
          country: addr.country_id,
          residential: !!addr.is_residential
        };

        const existingIdx = credentials.addressBook.findIndex(
          a => a.reference.toUpperCase() === newEntry.reference
        );

        let updatedBook = [...credentials.addressBook];
        if (existingIdx !== -1) {
          newEntry.id = updatedBook[existingIdx].id;
          updatedBook[existingIdx] = newEntry;
          toast.success(`Updated address book entry: ${newEntry.reference}`);
        } else {
          newEntry.id = crypto.randomUUID();
          updatedBook.push(newEntry);
          toast.success(`Added to address book: ${newEntry.reference}`);
        }

        await onSave({
          ...credentials,
          addressBook: updatedBook
        });
      } catch (e) {
        console.error("Failed to update address book:", e);
        toast.error("Failed to update address book");
      }
    }
    setIsManualReady(true);
  };

  const ValidationIcon = ({ status }: { status: 'none' | 'loading' | 'valid' | 'invalid' }) => {
    if (status === 'loading') return <Loader2 className="animate-spin w-4 h-4 text-zinc-400" />;
    if (status === 'valid') return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (status === 'invalid') return <X className="w-4 h-4 text-red-600" />;
    return <span className="text-zinc-400 font-bold">-</span>;
  };

  const clearPackageDetails = () => {
    setWeightKg('');
    setWeightG('');
    setLength('');
    setWidth('');
    setHeight('');
  };

  useEffect(() => {
    // Only fetch if we don't have an order AND we haven't already fetched it for this session/ID
    if (!id || id === 'manual' || order || fetchedOrderIdRef.current === id) return;
    if (!credentials.magento.url || !credentials.magento.token) return;
    
    const fetchOrder = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(`[OrderDetails] Fetching order ${id} from Magento...`);
        const client = new MagentoClient(
          credentials.magento.url,
          credentials.magento.token,
          credentials.general.proxyUrl
        );
        const fetchedOrder = await client.getOrder(id);
        console.log(`[OrderDetails] Order fetched successfully`);
        
        fetchedOrderIdRef.current = id;
        setOrder(fetchedOrder);
      } catch (e: any) {
        console.error(`[OrderDetails] Error fetching order:`, e);
        setError(e.message || "Failed to load order details.");
        toast.error("Failed to load order from Magento.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [id, order, credentials.magento.url, credentials.magento.token, credentials.general.proxyUrl]);

  useEffect(() => {
    // Only fetch product info if we have an order, it's not manual, 
    // and we haven't already fetched for this order ID
    if (!order || id === 'manual' || fetchedProductsForIdRef.current === String(order.entity_id)) return;
    
    // If order already has product details (from search or getOrder), use them and mark as fetched
    if (order.product_details && Object.keys(order.product_details).length > 0) {
      console.log(`[OrderDetails] Using pre-loaded product details`);
      setProductDetails(order.product_details);
      fetchedProductsForIdRef.current = String(order.entity_id);
      return;
    }

    // If we already have some product details and the SKUs match, don't re-fetch
    // This handles cases where state might be updated by address edits
    const currentSkus = order.items.map(i => i.sku).sort().join(',');
    const existingSkus = Object.keys(productDetails).sort().join(',');
    if (existingSkus === currentSkus && existingSkus.length > 0) {
      fetchedProductsForIdRef.current = String(order.entity_id);
      return;
    }

    if (!credentials.magento.url || !credentials.magento.token) return;
    
    const fetchProductInfo = async () => {
      console.log(`[OrderDetails] Fetching product details for ${order.items.length} items`);
      setIsFetchingProducts(true);
      const client = new MagentoClient(
        credentials.magento.url,
        credentials.magento.token,
        credentials.general.proxyUrl
      );

      const details: Record<string, any> = {};
      try {
        const skus = order.items.map(item => item.sku);
        const products = await client.getProducts(skus);
        
        products.forEach(product => {
          details[product.sku] = product;
        });

        console.log(`[OrderDetails] Loaded details for ${products.length} products`);
        fetchedProductsForIdRef.current = String(order.entity_id);
        setProductDetails(details);
      } catch (e) {
        console.error("[OrderDetails] Failed to fetch product details:", e);
      } finally {
        setIsFetchingProducts(false);
      }
    };

    fetchProductInfo();
  }, [order, id, credentials.magento.url, credentials.magento.token, credentials.general.proxyUrl, productDetails]);

  // Manual Rate Creation Helper
  const handleParcelOptionsOpen = () => {
    // If no parcels yet, initialize with current single-package data
    if (parcels.length === 0) {
      setParcels([{
        id: crypto.randomUUID(),
        weightKg: weightKg,
        weightG: weightG,
        weight: weight,
        length: length,
        width: width,
        height: height
      }]);
    }
    setIsParcelModalOpen(true);
  };

  const handleAddParcel = () => {
    setParcels(prev => [...prev, {
      id: crypto.randomUUID(),
      weightKg: '1',
      weightG: '0',
      weight: '1.0',
      length: '',
      width: '',
      height: ''
    }]);
  };

  const handleDuplicateParcel = (parcel: Parcel) => {
    setParcels(prev => {
      const idx = prev.findIndex(p => p.id === parcel.id);
      const newParcel = { ...parcel, id: crypto.randomUUID() };
      const next = [...prev];
      next.splice(idx + 1, 0, newParcel);
      return next;
    });
  };

  const handleDeleteParcel = (id: string) => {
    setParcels(prev => prev.filter(p => p.id !== id));
  };

  const updateParcel = (id: string, field: keyof Parcel, value: string) => {
    setParcels(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        // Recalculate total weight if Kg or G changed
        if (field === 'weightKg' || field === 'weightG') {
          const kg = parseFloat(updated.weightKg) || 0;
          const g = parseFloat(updated.weightG) || 0;
          updated.weight = (kg + (g / 1000)).toFixed(3);
        }
        return updated;
      }
      return p;
    }));
  };

  const handleParcelWeightBlur = (id: string, field: 'weightKg' | 'weightG') => {
    setParcels(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p };
        const mode = credentials.general.weightDisplayMode || 'both';
        
        if (field === 'weightKg') {
          const num = parseFloat(updated.weightKg);
          if (!isNaN(num) && mode === 'both') {
            const kg = Math.floor(num);
            const remainder = num - kg;
            if (remainder > 0) {
              updated.weightKg = kg.toString();
              updated.weightG = (Math.round(remainder * 1000)).toString();
            }
          }
        } else if (field === 'weightG') {
          const num = parseFloat(updated.weightG);
          if (!isNaN(num) && num >= 1000 && mode === 'both') {
            const extraKg = Math.floor(num / 1000);
            const remainingG = num % 1000;
            updated.weightKg = ( (parseFloat(updated.weightKg) || 0) + extraKg ).toString();
            updated.weightG = isNaN(remainingG) ? '0' : Math.round(remainingG).toString();
          }
        }
        
        // Final recalculate total weight
        const kgVal = parseFloat(updated.weightKg) || 0;
        const gVal = parseFloat(updated.weightG) || 0;
        updated.weight = (kgVal + (gVal / 1000)).toFixed(3);
        
        return updated;
      }
      return p;
    }));
  };

  const handleParcelModalClose = (open: boolean) => {
    if (!open) {
      // Apply synchronization logic when closing
      if (parcels.length === 0) {
        setWeightKg('');
        setWeightG('');
        setWeight('0');
        setLength('');
        setWidth('');
        setHeight('');
      } else if (parcels.length === 1) {
        const p = parcels[0];
        setWeight(p.weight);
        setWeightKg(p.weightKg);
        setWeightG(p.weightG);
        setLength(p.length);
        setWidth(p.width);
        setHeight(p.height);
      } else {
        // Multi-parcel
        const totalWeight = parcels.reduce((sum, p) => sum + (parseFloat(p.weight) || 0), 0);
        setWeight(totalWeight.toFixed(3));
        setWeightKg(Math.floor(totalWeight).toString());
        setWeightG(Math.round((totalWeight % 1) * 1000).toString());
      }
    }
    setIsParcelModalOpen(open);
  };

  const fetchRates = async () => {
    if (!order) return;

    // Validation
    const errors = [];
    if (!order.customer_firstname && !order.customer_lastname) errors.push("Customer Name");
    if (!order.shipping_address?.street?.[0]) errors.push("Address Line 1");
    if (!order.shipping_address?.city) errors.push("City");
    if (!order.shipping_address?.postcode) errors.push("Postcode");
    if (!order.shipping_address?.country_id) errors.push("Country");
    
    // Check if we have parcels defined in "Package Options"
    const hasParcels = parcels.length > 0;
    
    if (hasParcels) {
      // Validate each parcel
      const invalidParcels = parcels.filter(p => 
        !(parseFloat(p.weight) > 0) || 
        !(parseFloat(p.length) > 0) || 
        !(parseFloat(p.width) > 0) || 
        !(parseFloat(p.height) > 0)
      );
      if (invalidParcels.length > 0) {
        errors.push("All packages in Package Options must have Weight and Dimensions");
      }
    } else {
      // Standard single package validation
      const hasWeight = (weightKg && parseFloat(weightKg) > 0) || (weightG && parseFloat(weightG) > 0);
      if (!hasWeight) errors.push("Weight (KG or Grams)");
      
      if (!length || parseFloat(length) <= 0) errors.push("Length");
      if (!width || parseFloat(width) <= 0) errors.push("Width");
      if (!height || parseFloat(height) <= 0) errors.push("Height");
    }

    if (errors.length > 0) {
      toast.error("Missing required fields", {
        description: `Please fill in: ${errors.join(", ")}`
      });
      return;
    }

    console.log(`[OrderDetails] Fetching live rates...`);
    setIsRating(true);
    setRates([]);
    
    try {
      const allRates: any[] = [];
      const weightVal = parseFloat(weight) || 0.1;
      
      const pacakgeConfigs = parcels.length > 0 ? parcels : [{
        id: 'default',
        weight: weight,
        length: length,
        width: width,
        height: height
      }];

      console.log(`[OrderDetails] Rating with ${pacakgeConfigs.length} parcels`);

      // 1. Removed UPS Integration

      // 2. Fetch FedEx Rates if credentials exist and enabled
      const hasFedexCreds = credentials.fedex.isSandbox 
        ? (credentials.fedex.sandboxApiKey && credentials.fedex.sandboxSecretKey) 
        : (credentials.fedex.productionApiKey && credentials.fedex.productionSecretKey);

      if (credentials.fedex.enabled && hasFedexCreds) {
        try {
          const destCountry = order.shipping_address.country_id;
          const isDomestic = destCountry === credentials.general.originCountry || 
                            (credentials.general.originCountry === 'GB' && destCountry === 'XI') ||
                            (credentials.general.originCountry === 'XI' && destCountry === 'GB');
          const accountNumber = credentials.fedex.isSandbox
            ? (isDomestic ? (credentials.fedex.domesticAccountNumber || credentials.fedex.accountNumber) : (credentials.fedex.globalAccountNumber || credentials.fedex.accountNumber))
            : (credentials.fedex.productionAccountNumber || credentials.fedex.accountNumber);
          
          const payorAccountNumber = credentials.fedex.isSandbox
            ? (credentials.fedex.paymentAccountNumber || accountNumber)
            : (credentials.fedex.productionAccountNumber || accountNumber);
          
          console.log(`[OrderDetails] Calling FedEx API (${isDomestic ? 'Domestic' : 'Global'})...`);
          const fedex = new FedExClient(
            credentials.fedex.isSandbox ? credentials.fedex.sandboxApiKey : credentials.fedex.productionApiKey,
            credentials.fedex.isSandbox ? credentials.fedex.sandboxSecretKey : credentials.fedex.productionSecretKey,
            accountNumber,
            credentials.fedex.isSandbox,
            credentials.general.proxyUrl
          );

          const isInternational = credentials.general.originCountry !== order.shipping_address.country_id;

          const fedexParams: any = {
            accountNumber: { value: payorAccountNumber },
            requestedShipment: {
              rateRequestType: ["ACCOUNT", "LIST"],
              carrierCodes: ["FDXE", "FDXG"],
              preferredCurrency: credentials.general.currency || "GBP",
              shipper: {
                address: {
                  streetLines: getCarrierStreetLines([credentials.general.originStreet1, credentials.general.originStreet2], credentials.general.originState),
                  city: credentials.general.originCity,
                  stateOrProvinceCode: getCarrierRegion(credentials.general.originState, credentials.general.originCountry),
                  postalCode: credentials.general.originPostalCode,
                  countryCode: getCarrierCountryCode(credentials.general.originCountry)
                },
                contact: {
                  personName: credentials.general.originContactName,
                  emailAddress: credentials.general.originEmail,
                  phoneNumber: credentials.general.originPhone,
                  companyName: credentials.general.originCompanyName
                }
              },
              recipient: {
                address: {
                  streetLines: getCarrierStreetLines(order.shipping_address.street, order.shipping_address.region),
                  city: order.shipping_address.city,
                  stateOrProvinceCode: getCarrierRegion(order.shipping_address.region, order.shipping_address.country_id),
                  postalCode: order.shipping_address.postcode,
                  countryCode: getCarrierCountryCode(order.shipping_address.country_id),
                  residential: !!order.shipping_address.is_residential
                },
                contact: {
                  personName: `${order.shipping_address.firstname} ${order.shipping_address.lastname}`,
                  emailAddress: order.customer_email,
                  phoneNumber: order.shipping_address.telephone,
                  companyName: order.shipping_address.company || ''
                }
              },
              pickupType: credentials.general.fedexPickupType || "DROPOFF_AT_FEDEX_LOCATION",
              packagingType: "YOUR_PACKAGING",
              shippingChargesPayment: {
                paymentType: "SENDER",
                payor: {
                  responsibleParty: {
                    accountNumber: { value: payorAccountNumber }
                  }
                }
              },
              requestedPackageLineItems: pacakgeConfigs.map(p => ({
                weight: { units: "KG", value: parseFloat(p.weight) || 0.1 },
                dimensions: { 
                  length: Math.max(1, parseFloat(p.length) || 1), 
                  width: Math.max(1, parseFloat(p.width) || 1), 
                  height: Math.max(1, parseFloat(p.height) || 1), 
                  units: "CM" 
                }
              }))
            }
          };

          if (isInternational) {
            const totalBaseValue = (order.items || []).reduce((sum, item) => sum + (item.price * item.qty_ordered), 0);
            const commodities = order.items.length > 0 
              ? order.items.map(item => {
                  const product = productDetails[item.sku];
                  const getAttr = (code: string) => {
                    const attr = product?.custom_attributes?.find((a: any) => a.attribute_code === code);
                    let val = attr?.value;
                    if (val === undefined && code === 'commodity_code') {
                      const htsAttr = product?.custom_attributes?.find((a: any) => 
                        ['hts_code', 'ts_hts_code', 'ts_commodity_code', 'hs_code', 'commodity_code', 'harmonized_system_code', 'hsc'].includes(a.attribute_code)
                      );
                      val = htsAttr?.value;
                    }
                    return val || '';
                  };
                  return {
                    description: item.name,
                    countryOfManufacture: getCarrierCountryCode(getAttr('country_of_manufacture') || credentials.general.originCountry),
                    harmonizedCode: getAttr('commodity_code'),
                    quantity: item.qty_ordered,
                    quantityUnits: "PCS",
                    unitPrice: {
                      amount: item.price,
                      currency: credentials.general.currency || "GBP"
                    },
                    customsValue: {
                      amount: item.price * item.qty_ordered,
                      currency: credentials.general.currency || "GBP"
                    },
                    weight: {
                      units: "KG",
                      value: item.weight || 0.1
                    }
                  };
                })
              : [{
                  description: "Shipping Package",
                  countryOfManufacture: getCarrierCountryCode(credentials.general.originCountry),
                  quantity: 1,
                  quantityUnits: "PCS",
                  unitPrice: {
                    amount: 1,
                    currency: credentials.general.currency || "GBP"
                  },
                  customsValue: {
                    amount: 1,
                    currency: credentials.general.currency || "GBP"
                  },
                  weight: {
                    units: "KG",
                    value: weightVal
                  }
                }];

            fedexParams.requestedShipment.customsClearanceDetail = {
              dutiesPayment: {
                paymentType: "SENDER",
                payor: {
                  responsibleParty: {
                    accountNumber: { value: payorAccountNumber }
                  }
                }
              },
              totalCustomsValue: {
                amount: totalBaseValue,
                currency: credentials.general.currency || "GBP"
              },
              commodities
            };
          }

          console.log("[FedExClient] Fetching rates", fedexParams);
          const fedexData = await fedex.getRates(fedexParams);
          
          if (fedexData?.errors && fedexData.errors.length > 0) {
            fedexData.errors.forEach((err: any) => {
              let description = err.message || "Service type not allowed or invalid package combination.";
              
              if (err.code === 'ACCOUNT.NUMBER.MISMATCH' || err.code === 'RATE.ACCOUNTNUMBER.MISMATCH') {
                const attemptedAccount = credentials.fedex.paymentAccountNumber || accountNumber;
                description = `Account Mismatch: The API Key (starting with ${credentials.fedex.apiKey.substring(0, 4)}) is not authorized for account ${attemptedAccount}. Please ensure your 'Domestic/Global Account Number' matches the one in your FedEx Developer Portal for this API Key.`;
              }

              toast.error(`FedEx Error: ${err.code}`, {
                description: description,
                duration: 10000,
              });
            });
          }

          if (fedexData?.output?.rateReplyDetails) {
            // Filter for UK/EU region services
            const allowedServices = [
              'FEDEX_INTERNATIONAL_PRIORITY_EXPRESS',
              'INTERNATIONAL_PRIORITY_FREIGHT',
              'FEDEX_INTERNATIONAL_PRIORITY',
              'FEDEX_INTERNATIONAL_CONNECT_PLUS',
              'INTERNATIONAL_ECONOMY',
              'INTERNATIONAL_ECONOMY_FREIGHT',
              'FEDEX_INTERNATIONAL_DEFERRED_FREIGHT',
              'INTERNATIONAL_FIRST',
              'INTERNATIONAL_PRIORITY_DISTRIBUTION',
              'INTERNATIONAL_DISTRIBUTION_FREIGHT',
              'INTERNATIONAL_ECONOMY_DISTRIBUTION',
              'FEDEX_REGIONAL_ECONOMY',
              'FEDEX_REGIONAL_ECONOMY_FREIGHT',
              'PRIORITY_OVERNIGHT',
              'FEDEX_FIRST',
              'FEDEX_PRIORITY_EXPRESS',
              'FEDEX_PRIORITY',
              'FEDEX_PRIORITY_EXPRESS_FREIGHT',
              'FEDEX_PRIORITY_FREIGHT',
              'FEDEX_ECONOMY_SELECT'
            ];
            
            fedexData.output.rateReplyDetails.forEach((r: any) => {
              const serviceCode = r.serviceType;
              const isAllowed = allowedServices.some(s => serviceCode.includes(s));
              
              if (isAllowed) {
                // Try to extract delivery date
                let deliveryInfo = 'Live Rate';
                const commitDate = r.commit?.dateDetail?.dayFormat;
                if (commitDate) {
                  try {
                    const date = new Date(commitDate);
                    const now = new Date();
                    const tomorrow = new Date();
                    tomorrow.setDate(now.getDate() + 1);
                    
                    if (date.toDateString() === tomorrow.toDateString()) {
                      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      deliveryInfo = `Tomorrow at ${time}`;
                    } else if (date.toDateString() === now.toDateString()) {
                      deliveryInfo = 'Today';
                    } else {
                      deliveryInfo = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                    }
                  } catch (e) {
                    deliveryInfo = commitDate;
                  }
                }

                allRates.push({
                  id: `fedex-${r.serviceType}`,
                  carrier: 'FedEx',
                  service: r.serviceName || r.serviceType,
                  price: r.ratedShipmentDetails?.[0]?.totalNetCharge || 0,
                  delivery: deliveryInfo
                });
              }
            });
          }
        } catch (e) {
          console.error("FedEx Rate Error:", e);
        }
      }

      // Update rates state
      setRates(allRates.sort((a, b) => a.price - b.price));
      
      if (allRates.length > 0) {
        toast.success("Fetched live rates from carriers.");
      } else {
        toast.error("No live rates returned from carriers.");
      }
    } catch (error) {
      toast.error("Failed to fetch rates. Check carrier credentials.");
    } finally {
      setIsRating(false);
    }
  };

  const handleCreateLabel = async () => {
    if (!selectedRate || !order) return;

    // Check address line lengths
    const street = order.shipping_address?.street || [];
    const tooLong = street.some(line => line.length > 35);
    if (tooLong) {
      const confirm = window.confirm("Warning: One or more address lines exceed 35 characters. This may cause issues with the carrier. Do you want to continue?");
      if (!confirm) return;
    }

    console.log(`[OrderDetails] Creating label for ${selectedRate.carrier} ${selectedRate.service}`);
    setIsShipping(true);
    
    try {
      let tracking = "";
      let labelBase64 = "";
      let labelUrl = ""; // Local variable to track URL before state update
      let labelType = "application/pdf";

      const weightVal = parseFloat(weight) || 0.1;
      const pacakgeConfigs = parcels.length > 0 ? parcels : [{
        id: 'default',
        weight: weight,
        length: length,
        width: width,
        height: height
      }];
      const isDomestic = order.shipping_address?.country_id === credentials.general.originCountry || 
                        (credentials.general.originCountry === 'GB' && order.shipping_address?.country_id === 'XI') ||
                        (credentials.general.originCountry === 'XI' && order.shipping_address?.country_id === 'GB');

      if (selectedRate.carrier === 'FedEx') {
        const accountNumber = credentials.fedex.isSandbox
          ? (isDomestic ? (credentials.fedex.domesticAccountNumber || credentials.fedex.accountNumber) : (credentials.fedex.globalAccountNumber || credentials.fedex.accountNumber))
          : (credentials.fedex.productionAccountNumber || credentials.fedex.accountNumber);
        
        const payorAccountNumber = credentials.fedex.isSandbox
          ? (credentials.fedex.paymentAccountNumber || accountNumber)
          : (credentials.fedex.productionAccountNumber || accountNumber);

        const fedex = new FedExClient(
          credentials.fedex.isSandbox ? credentials.fedex.sandboxApiKey : credentials.fedex.productionApiKey,
          credentials.fedex.isSandbox ? credentials.fedex.sandboxSecretKey : credentials.fedex.productionSecretKey,
          accountNumber,
          credentials.fedex.isSandbox,
          credentials.general.proxyUrl
        );

        const referenceId = order.increment_id?.trim();
        const shouldSendReference = referenceId && referenceId !== 'MANUAL';

        const fedexParams: any = {
          labelResponseOptions: "LABEL",
          accountNumber: { value: payorAccountNumber },
          requestedShipment: {
            shipper: {
              contact: {
                personName: credentials.general.originContactName,
                phoneNumber: credentials.general.originPhone,
                companyName: credentials.general.originCompanyName
              },
              address: {
                streetLines: getCarrierStreetLines([credentials.general.originStreet1, credentials.general.originStreet2], credentials.general.originState),
                city: credentials.general.originCity,
                stateOrProvinceCode: getCarrierRegion(credentials.general.originState, credentials.general.originCountry),
                postalCode: credentials.general.originPostalCode,
                countryCode: getCarrierCountryCode(credentials.general.originCountry)
              }
            },
            recipients: [{
              contact: {
                personName: `${order.shipping_address?.firstname} ${order.shipping_address?.lastname}`,
                phoneNumber: order.shipping_address?.telephone,
                companyName: order.shipping_address?.company
              },
              address: {
                streetLines: getCarrierStreetLines(order.shipping_address?.street, order.shipping_address?.region),
                city: order.shipping_address?.city,
                stateOrProvinceCode: getCarrierRegion(order.shipping_address?.region, order.shipping_address?.country_id),
                postalCode: order.shipping_address?.postcode,
                countryCode: getCarrierCountryCode(order.shipping_address?.country_id),
                residential: !!order.shipping_address?.is_residential
              }
            }],
            shipDatestamp: new Date().toISOString().split('T')[0],
            serviceType: selectedRate.id.replace('fedex-', ''),
            packagingType: "YOUR_PACKAGING",
            pickupType: credentials.general.fedexPickupType || "USE_SCHEDULED_PICKUP",
            shippingChargesPayment: {
              paymentType: "SENDER",
              payor: {
                responsibleParty: {
                  accountNumber: { value: payorAccountNumber }
                }
              }
            },
            labelSpecification: {
              labelFormatType: "COMMON2D",
              imageType: credentials.general.labelFormat === 'ZPL' ? 'ZPLII' : (credentials.general.labelFormat || "PDF"),
              labelStockType: credentials.general.labelSize === '8.5x11' ? "PAPER_LETTER" : "STOCK_4X6",
              labelPrintingOrientation: "TOP_EDGE_OF_TEXT_FIRST",
              labelRotation: "NONE"
            },
            requestedPackageLineItems: pacakgeConfigs.map((p, idx) => ({
              weight: { units: "KG", value: parseFloat(p.weight) || 0.1 },
              dimensions: { 
                length: Math.max(1, parseFloat(p.length) || 1), 
                width: Math.max(1, parseFloat(p.width) || 1), 
                height: Math.max(1, parseFloat(p.height) || 1), 
                units: "CM" 
              },
              ...(shouldSendReference && idx === 0 ? {
                customerReferences: [{ customerReferenceType: "CUSTOMER_REFERENCE", value: referenceId }]
              } : {})
            }))
          }
        };

        // Add International Customs if needed
        if (!isDomestic) {
          const totalBaseValue = (order.items || []).reduce((sum, item) => sum + (item.price * item.qty_ordered), 0);
          fedexParams.requestedShipment.customsClearanceDetail = {
            dutiesPayment: {
              paymentType: billDutiesTo === 'recipient' ? "RECIPIENT" : "SENDER",
              payor: {
                responsibleParty: {
                  accountNumber: { value: payorAccountNumber }
                }
              }
            },
            totalCustomsValue: {
              amount: totalBaseValue,
              currency: credentials.general.currency || "GBP"
            },
            commodities: order.items.map(item => {
              const product = productDetails[item.sku];
              const getAttr = (code: string) => {
                const attr = product?.custom_attributes?.find((a: any) => a.attribute_code === code);
                let val = attr?.value;
                if (val === undefined && code === 'commodity_code') {
                  const htsAttr = product?.custom_attributes?.find((a: any) => 
                    ['hts_code', 'ts_hts_code', 'ts_commodity_code', 'hs_code', 'commodity_code', 'harmonized_system_code', 'hsc'].includes(a.attribute_code)
                  );
                  val = htsAttr?.value;
                }
                return val || '';
              };
              
              return {
                description: item.name,
                countryOfManufacture: getCarrierCountryCode(getAttr('country_of_manufacture') || credentials.general.originCountry),
                harmonizedCode: getAttr('commodity_code'),
                quantity: item.qty_ordered,
                quantityUnits: "PCS",
                unitPrice: { amount: item.price, currency: credentials.general.currency || "GBP" },
                customsValue: { amount: item.price * item.qty_ordered, currency: credentials.general.currency || "GBP" },
                weight: { units: "KG", value: item.weight || 0.1 }
              };
            })
          };
        }

        console.log("[FedExClient] Creating shipment", fedexParams);
        const fedexData = await fedex.createShipment(fedexParams);
        labelType = credentials.general.labelFormat === 'ZPL' ? 'text/plain' : 'application/pdf';
        
        if (fedexData.output?.transactionShipments?.[0]) {
          const ship = fedexData.output.transactionShipments[0];
          tracking = ship.masterTrackingNumber;
          
          const pieceLabels: string[] = [];
          const pieceUrls: string[] = [];
          
          if (ship.pieceResponses) {
            ship.pieceResponses.forEach((pr: any) => {
              if (pr.packageDocuments) {
                pr.packageDocuments.forEach((doc: any) => {
                  if (doc.encodedLabel) pieceLabels.push(doc.encodedLabel);
                  else if (doc.url) pieceUrls.push(doc.url);
                });
              }
            });
          }

          if (pieceLabels.length === 0 && pieceUrls.length === 0 && ship.shipmentDocuments) {
             ship.shipmentDocuments.forEach((doc: any) => {
               if (doc.encodedLabel) pieceLabels.push(doc.encodedLabel);
               else if (doc.url) pieceUrls.push(doc.url);
             });
          }

          if (pieceLabels.length > 0) {
            if (pieceLabels.length > 1 && credentials.general.labelFormat !== 'ZPL') {
              console.log(`[OrderDetails] Merging ${pieceLabels.length} FedEx labels...`);
              const mergedPdf = await PDFDocument.create();
              for (const b64 of pieceLabels) {
                const pdfBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                const doc = await PDFDocument.load(pdfBytes);
                const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
              }
              const mergedPdfBytes = await mergedPdf.save();
              const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
              labelUrl = URL.createObjectURL(blob);
              setLabelUrl(labelUrl);
            } else if (credentials.general.labelFormat === 'ZPL') {
              const decoded = pieceLabels.map((l: any) => atob(l)).join('\n');
              const blob = new Blob([decoded], { type: 'text/plain' });
              labelUrl = URL.createObjectURL(blob);
              setLabelUrl(labelUrl);
            } else {
              labelBase64 = pieceLabels[0];
            }
          } else if (pieceUrls.length > 0) {
            labelUrl = pieceUrls[0]; // For now still take first if URL, but we should ideally fetch all
            setLabelUrl(labelUrl);
          }
        } else {
          const error = fedexData.errors?.[0] || { message: "FedEx Shipment Failed" };
          throw new Error(error.message);
        }
      }

      if (tracking) {
        setTrackingNumber(tracking);
        
        // Helper to convert base64 to blob
        const b64ToBlob = (b64: string, type: string) => {
          const binStr = atob(b64);
          const len = binStr.length;
          const arr = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            arr[i] = binStr.charCodeAt(i);
          }
          return new Blob([arr], { type });
        };

        if (labelBase64) {
          try {
            console.log(`[OrderDetails] Creating blob from base64 label (${labelType})`);
            const blob = b64ToBlob(labelBase64, labelType);
            setLabelUrl(URL.createObjectURL(blob));
          } catch (e) {
            console.error("[OrderDetails] Error creating label blob:", e);
            toast.error("Label generated but failed to display. You can still find it in your carrier portal.");
          }
        } else if (labelUrl) {
          // If we only have a URL and it's FedEx (which often blocks iframes), try to fetch it via proxy
          if (selectedRate.carrier === 'FedEx') {
            try {
              console.log(`[OrderDetails] Fetching FedEx label via proxy: ${labelUrl}`);
              const cleanProxyUrl = credentials.general.proxyUrl ? (credentials.general.proxyUrl.endsWith('/') ? credentials.general.proxyUrl : `${credentials.general.proxyUrl}/`) : '';
              const response = await fetch(`${cleanProxyUrl}${labelUrl}`);
              if (response.ok) {
                const blob = await response.blob();
                // Ensure the blob has the correct type
                const typedBlob = new Blob([blob], { type: labelType });
                setLabelUrl(URL.createObjectURL(typedBlob));
                console.log(`[OrderDetails] FedEx label fetched and blob created`);
              }
            } catch (e) {
              console.error("[OrderDetails] Failed to fetch FedEx label via proxy:", e);
              // Fallback to the original URL (though it might be blocked by X-Frame-Options)
            }
          }
        }

        // 2. Update Magento Shipment Status (if enabled)
        const isSandbox = credentials.fedex.isSandbox;

        if (credentials.general.markAsShipped && id !== 'manual' && !isSandbox) {
          try {
            console.log(`[OrderDetails] Updating Magento shipment status...`);
            const client = new MagentoClient(
              credentials.magento.url,
              credentials.magento.token,
              credentials.general.proxyUrl
            );

            // "Smart Replace": if order is already complete, it means there is an existing shipment.
            // We should ideally just add the new track to an existing shipment if we can't create a new one.
            const carrierTitle = 'Federal Express';
            const carrierCode = selectedRate.carrier.toLowerCase();
            const trackObj = {
              track_number: tracking,
              title: carrierTitle,
              carrier_code: carrierCode
            };

            let shipmentCreated = false;

            if (order.status !== 'complete') {
              console.log(`[OrderDetails] Order is not yet complete, creating new shipment...`);
              try {
                await client.createShipment(order.entity_id, [trackObj]);
                shipmentCreated = true;
              } catch (createErr: any) {
                console.warn(`[OrderDetails] Initial createShipment failed:`, createErr);
                // Fallthrough to existing shipment check if it failed with "no products"
              }
            }

            if (!shipmentCreated) {
              console.log(`[OrderDetails] Searching for existing shipments to add track...`);
              try {
                const existingShipments = await client.getShipments(order.entity_id);
                if (existingShipments && existingShipments.length > 0) {
                  // Sort by ID descending to get the most recent one
                  const sorted = [...existingShipments].sort((a, b) => b.entity_id - a.entity_id);
                  const lastShipment = sorted[0];
                  
                  console.log(`[OrderDetails] Adding track to existing shipment ${lastShipment.entity_id}`);
                  await client.addTrack(lastShipment.entity_id, trackObj);
                  shipmentCreated = true;

                  // Clean up OLD tracks from this shipment if they were for the same carrier
                  // This is optional but helps with the "Smart Replace" feel
                  try {
                    const fullShipment = await client.getShipment(lastShipment.entity_id);
                    if (fullShipment.tracks && fullShipment.tracks.length > 1) {
                      for (const t of fullShipment.tracks) {
                        if (t.track_number !== tracking && t.carrier_code === carrierCode) {
                          console.log(`[OrderDetails] Cleaning up old track ${t.track_number} from shipment ${lastShipment.entity_id}`);
                          await client.deleteTrack(t.entity_id);
                        }
                      }
                    }
                  } catch (cleanupErr) {
                    console.warn(`[OrderDetails] Failed to cleanup old tracks:`, cleanupErr);
                  }
                } else if (order.status === 'complete') {
                   throw new Error("Order is complete but no shipment entities were found in Magento to attach tracking to.");
                } else {
                   // If not complete and create failed, throw the original error
                   throw new Error("Failed to create shipment and no existing shipments found.");
                }
              } catch (fallbackErr: any) {
                console.error(`[OrderDetails] Magento fallback failed:`, fallbackErr);
                throw fallbackErr;
              }
            }
            console.log(`[OrderDetails] Magento updated successfully`);
          } catch (magentoError: any) {
            console.error(`[OrderDetails] Magento update failed:`, magentoError);
            toast.warning("Label created, but failed to update Magento status. You may need to mark it as shipped manually.", {
              description: magentoError.message,
              duration: 8000
            });
          }
        }
        
        toast.success(`Label created! Tracking: ${tracking}${isSandbox ? ' (SANDBOX)' : ''}`);

        // 3. Save to local shipments for Tracking page
        if (!isSandbox) {
          try {
            const newShipment: SawyerShipment = {
              id: `${tracking}-${Date.now()}`,
              orderIncrementId: order.increment_id || 'MANUAL',
              trackingNumber: tracking,
              carrier: 'FedEx',
              service: selectedRate.service,
              customerName: `${order.shipping_address?.firstname} ${order.shipping_address?.lastname}`,
              company: order.shipping_address?.company || '',
              shipDate: new Date().toISOString(),
              destCountry: order.shipping_address?.country_id,
              status: 'Label Created',
              lastUpdated: new Date().toISOString(),
              address: {
                street: order.shipping_address?.street || [],
                city: order.shipping_address?.city || '',
                region: order.shipping_address?.region || '',
                postcode: order.shipping_address?.postcode || '',
                country: order.shipping_address?.country_id || '',
                telephone: order.shipping_address?.telephone,
                email: order.customer_email
              },
              billing: {
                shipping: billShippingTo,
                duties: billDutiesTo,
                shippingAccountNumber: billShippingTo !== 'shipper' ? shipAccountNumber : undefined,
                dutiesAccountNumber: billDutiesTo !== 'shipper' ? dutyAccountNumber : undefined
              },
              packages: pacakgeConfigs.map(p => ({
                weight: p.weight,
                length: p.length,
                width: p.width,
                height: p.height
              })),
              items: order.items.map(item => ({
                name: item.name,
                sku: item.sku,
                qty: item.qty_ordered,
                price: item.price
              })),
              labelBase64: labelBase64 || undefined
            };

            const updatedShipments = [newShipment, ...(credentials.shipments || [])];
            await onSave({
              ...credentials,
              shipments: updatedShipments
            });
            console.log(`[OrderDetails] Shipment saved to local storage`);
          } catch (saveError) {
            console.error(`[OrderDetails] Failed to save shipment to local storage:`, saveError);
          }
        } else {
          console.log(`[OrderDetails] Sandbox label created - skipped saving to tracking list`);
        }

        // Auto-open label viewer if enabled
        if (credentials.general.autoOpenLabel) {
          setIsLabelViewerOpen(true);
        }
      }
    } catch (error: any) {
      console.error(`[OrderDetails] Error in handleCreateLabel:`, error);
      toast.error(error.message || "Failed to create label. Check carrier logs.");
    } finally {
      setIsShipping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
        <p className="text-zinc-500">Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="p-3 bg-red-50 rounded-full">
          <Package className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900">Order Not Found</h2>
        <p className="text-zinc-500 max-w-md text-center">{error || "We couldn't find the order you're looking for."}</p>
        <Button onClick={() => navigate('/')} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  const isManual = id === 'manual';
  if (isManual && !isManualReady) {
    const isComplete = !!(
      (order.customer_firstname || order.customer_lastname) && 
      order.shipping_address?.street?.[0] && 
      order.shipping_address?.city && 
      order.shipping_address?.postcode
    );

    const filteredAddressBook = (credentials.addressBook || []).filter(c => 
      c.fullname.toLowerCase().includes(addressSearch.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(addressSearch.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(addressSearch.toLowerCase())) ||
      (c.postcode && c.postcode.toLowerCase().includes(addressSearch.toLowerCase())) ||
      (c.reference && c.reference.toLowerCase().includes(addressSearch.toLowerCase()))
    );

    const addressTotalPages = Math.ceil(filteredAddressBook.length / ADDRESSES_PER_PAGE);
    const paginatedAddresses = filteredAddressBook.slice(
      (addressPage - 1) * ADDRESSES_PER_PAGE,
      addressPage * ADDRESSES_PER_PAGE
    );

    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <div className="flex items-baseline gap-1">
              <h1 className="text-4xl font-bold text-zinc-900 whitespace-nowrap">Shipment #</h1>
              <input 
                value={order?.increment_id === 'MANUAL' ? '' : order?.increment_id} 
                onChange={(e) => setOrder({...order!, increment_id: e.target.value.toUpperCase()})}
                className="text-4xl font-bold text-zinc-900 bg-transparent border-none p-0 focus:outline-none w-full max-w-[500px] placeholder:text-zinc-200"
                placeholder="MANUAL"
              />
            </div>
            <p className="text-zinc-500">Please provide the recipient's information to continue.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Left Column: Manual Form */}
          <Card>
            <CardHeader>
              <CardTitle>Customer & Shipping Information</CardTitle>
              <CardDescription>All fields marked with * are required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Full Name <span className="text-red-500">*</span></Label>
                <Input 
                  value={fullNameInput || ''} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setFullNameInput(val);
                    const parts = val.trim().split(' ');
                    const first = parts[0] || '';
                    const last = parts.slice(1).join(' ') || '';
                    setOrder({
                      ...order!, 
                      customer_firstname: first,
                      customer_lastname: last,
                      shipping_address: { ...order!.shipping_address!, firstname: first, lastname: last }
                    });
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    value={order!.customer_email || ''} 
                    onChange={(e) => setOrder({...order!, customer_email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telephone</Label>
                  <Input 
                    value={order!.shipping_address?.telephone || ''} 
                    onChange={(e) => setOrder({
                      ...order!, 
                      shipping_address: { ...order!.shipping_address!, telephone: e.target.value }
                    })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input 
                  value={order!.shipping_address?.company || ''} 
                  onChange={(e) => setOrder({
                    ...order!, 
                    shipping_address: { ...order!.shipping_address!, company: e.target.value }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex justify-between">
                  Address Line 1 <span className="text-red-500">*</span>
                  {(order!.shipping_address?.street?.[0]?.length || 0) > 35 && (
                    <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                  )}
                </Label>
                <Input 
                  value={order!.shipping_address?.street?.[0] || ''} 
                  onChange={(e) => {
                    const street = [...(order!.shipping_address?.street || [])];
                    street[0] = e.target.value;
                    setOrder({ ...order!, shipping_address: { ...order!.shipping_address!, street } });
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    Address Line 2
                    {(order!.shipping_address?.street?.[1]?.length || 0) > 35 && (
                      <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                    )}
                  </Label>
                  <Input 
                    value={order!.shipping_address?.street?.[1] || ''} 
                    onChange={(e) => {
                      const street = [...(order!.shipping_address?.street || [])];
                      street[1] = e.target.value;
                      setOrder({ ...order!, shipping_address: { ...order!.shipping_address!, street } });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    Address Line 3
                    {(order!.shipping_address?.street?.[2]?.length || 0) > 35 && (
                      <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                    )}
                  </Label>
                  <Input 
                    value={order!.shipping_address?.street?.[2] || ''} 
                    onChange={(e) => {
                      const street = [...(order!.shipping_address?.street || [])];
                      street[2] = e.target.value;
                      setOrder({ ...order!, shipping_address: { ...order!.shipping_address!, street } });
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City <span className="text-red-500">*</span></Label>
                  <Input 
                    value={order!.shipping_address?.city || ''} 
                    onChange={(e) => setOrder({
                      ...order!, 
                      shipping_address: { ...order!.shipping_address!, city: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input 
                    value={order!.shipping_address?.region || ''} 
                    onChange={(e) => setOrder({
                      ...order!, 
                      shipping_address: { ...order!.shipping_address!, region: e.target.value }
                    })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Postcode <span className="text-red-500">*</span></Label>
                  <Input 
                    value={order!.shipping_address?.postcode || ''} 
                    onChange={(e) => setOrder({
                      ...order!, 
                      shipping_address: { ...order!.shipping_address!, postcode: e.target.value }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country <span className="text-red-500">*</span></Label>
                  <Select 
                    value={order!.shipping_address?.country_id}
                    onValueChange={(v) => setOrder({
                      ...order!,
                      shipping_address: { ...order!.shipping_address!, country_id: v }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country">
                        {COUNTRY_NAMES[order!.shipping_address?.country_id || ''] || order!.shipping_address?.country_id}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                        <SelectItem key={code} value={code}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {id === 'manual' && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="address-book-sync" 
                      checked={addressBookSync} 
                      onCheckedChange={setAddressBookSync}
                    />
                    <Label htmlFor="address-book-sync" className="text-sm font-medium cursor-pointer">
                      Add/Update Address Book
                    </Label>
                  </div>
                  
                  {addressBookSync && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Label className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Address Book Reference</Label>
                      <Input 
                        value={addressBookRef}
                        onChange={(e) => setAddressBookRef(e.target.value.toUpperCase())}
                        className="uppercase font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 p-4 bg-zinc-50 border rounded-lg items-center h-[58px]">
                <div className="flex-1 flex items-center relative">
                  <Button
                    type="button"
                    variant={order!.shipping_address?.is_residential ? "default" : "outline"}
                    size="sm"
                    className={`h-7 w-full text-[9px] font-bold uppercase tracking-wider transition-all rounded-md ${
                      order!.shipping_address?.is_residential 
                        ? "bg-zinc-900 text-white shadow-inner" 
                        : "bg-white text-zinc-500 border-zinc-200"
                    }`}
                    onClick={() => setOrder({
                      ...order!,
                      shipping_address: { ...order!.shipping_address!, is_residential: !order!.shipping_address?.is_residential }
                    })}
                  >
                    {order!.shipping_address?.is_residential ? 'Residential' : 'Business'}
                  </Button>
                  {recommendedResidential !== null && order!.shipping_address?.is_residential !== recommendedResidential && (
                    <div className="absolute top-[110%] left-0 right-0 flex justify-center">
                      <p className="text-[9px] text-zinc-400 whitespace-nowrap italic leading-none">
                        Changed From Suggested
                      </p>
                    </div>
                  )}
                </div>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-600">Address Validation</span>
                  <div className="w-6 h-6 flex items-center justify-center border rounded bg-white">
                    <ValidationIcon status={isFedExValid} />
                  </div>
                </div>
              </div>

              <Button 
                className="w-full bg-zinc-900 hover:bg-zinc-800" 
                disabled={!isComplete}
                onClick={handleContinueToShipping}
              >
                Continue to Shipping
              </Button>
            </CardContent>
          </Card>

          {/* Right Column: Address Book Autofill */}
          <Card className="flex flex-col shadow-sm border-zinc-200 h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Book className="w-5 h-5 text-zinc-400" />
                Address Book
              </CardTitle>
              <CardDescription>Click to fill form.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                  <Input 
                     placeholder="Search name, code..." 
                     className="pl-10 h-10 border-zinc-200 focus:ring-zinc-900 bg-zinc-50/50"
                     value={addressSearch}
                     onChange={(e) => {
                        setAddressSearch(e.target.value);
                        setAddressPage(1);
                     }}
                  />
               </div>
               
               <div className="border rounded-xl divide-y overflow-hidden bg-white">
                  {paginatedAddresses.length > 0 ? (
                    paginatedAddresses.map(customer => (
                      <button
                        key={customer.id}
                        onClick={() => handleSelectAddress(customer)}
                        className="w-full text-left p-4 hover:bg-zinc-50 transition-all flex items-center justify-between group relative"
                      >
                        <div className="space-y-2 pr-4 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {customer.company && (
                                <p className="font-black text-zinc-900 text-sm leading-none truncate mb-1">
                                  {customer.company}
                                </p>
                              )}
                              <p className="font-bold text-zinc-500 text-xs leading-none truncate">
                                {customer.fullname}
                              </p>
                            </div>
                            {customer.reference && (
                              <div className="flex items-center gap-2 shrink-0">
                                {customer.residential && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold rounded uppercase tracking-wider border border-blue-100 italic">Resi</span>
                                )}
                                <div className="px-2 py-1 bg-zinc-900 text-white rounded text-[10px] font-black tracking-tighter border border-zinc-800 shadow-sm leading-none">
                                  {customer.reference}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-1 bg-zinc-50/50 p-2 rounded-lg border border-zinc-100">
                            <div className="flex items-start gap-2">
                               <MapPin size={14} className="mt-0.5 text-zinc-400 shrink-0" />
                               <div className="min-w-0 flex-1 space-y-0.5">
                                  <p className="text-[12px] text-zinc-600 font-bold truncate leading-tight font-mono">{customer.street1}</p>
                                  {customer.street2 && <p className="text-[11px] text-zinc-500 truncate leading-tight">{customer.street2}</p>}
                                  {customer.street3 && <p className="text-[11px] text-zinc-500 truncate leading-tight">{customer.street3}</p>}
                                  <p className="text-[11px] text-zinc-400 font-bold truncate leading-tight mt-1 uppercase tracking-tight">
                                     {customer.city}{customer.region ? `, ${customer.region}` : ''} {customer.postcode}
                                  </p>
                               </div>
                            </div>
                          </div>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 group-hover:bg-zinc-900 transition-all">
                          <ArrowRight size={12} className="text-zinc-400 group-hover:text-white" />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 space-y-3">
                      <div className="p-3 rounded-full bg-zinc-50 border border-zinc-100">
                        <Search className="w-5 h-5 opacity-40" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-300">No matches</p>
                      </div>
                    </div>
                  )}
               </div>

               {addressTotalPages > 1 && (
                 <div className="flex items-center justify-between pt-2">
                   <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                     Page {addressPage} / {addressTotalPages}
                   </div>
                   <div className="flex items-center gap-1">
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-7 w-7" 
                        disabled={addressPage === 1}
                        onClick={() => setAddressPage(p => p - 1)}
                     >
                       <ChevronLeft size={14} />
                     </Button>
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-7 w-7" 
                        disabled={addressPage === addressTotalPages}
                        onClick={() => setAddressPage(p => p + 1)}
                     >
                       <ChevronRight size={14} />
                     </Button>
                   </div>
                 </div>
               )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft size={20} />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-zinc-900">
                  {id === 'manual' ? (order.increment_id && order.increment_id !== 'MANUAL' ? `Shipment #${order.increment_id}` : 'Manual Shipment') : `Order #${order.increment_id}`}
                </h1>
                <p className="text-zinc-500">
                  {id === 'manual' ? 'Create a shipment manually' : 'Imported from Magento'}
                </p>
              </div>
            </div>
            <Badge className="bg-zinc-900 text-white px-3 py-1 text-sm">
              {id === 'manual' ? 'Draft' : order.status}
            </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Order Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <User size={20} /> Customer & Shipping
              </CardTitle>
              <Dialog open={isEditingCustomer} onOpenChange={setIsEditingCustomer}>
                <DialogTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Pencil size={16} />
                    </Button>
                  }
                />
                <DialogContent className="max-w-[630px]">
                  <DialogHeader>
                    <DialogTitle>Edit Customer & Shipping Info</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Full Name <span className="text-red-500">*</span></Label>
                      <Input 
                        value={fullNameInput} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setFullNameInput(val);
                          const parts = val.trim().split(' ');
                          const first = parts[0] || '';
                          const last = parts.slice(1).join(' ') || '';
                          setOrder(prev => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              customer_firstname: first, 
                              customer_lastname: last,
                              shipping_address: {
                                ...prev.shipping_address!,
                                firstname: first,
                                lastname: last
                              }
                            };
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input 
                        value={order.shipping_address?.company || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setOrder(prev => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              shipping_address: {
                                ...prev.shipping_address!,
                                company: val
                              }
                            };
                          });
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input 
                          value={order.customer_email} 
                          onChange={(e) => {
                          const val = e.target.value;
                          setOrder(prev => {
                            if (!prev) return prev;
                            return { ...prev, customer_email: val };
                          });
                        }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Telephone</Label>
                        <Input 
                          value={order.shipping_address?.telephone || ''} 
                          onChange={(e) => setOrder({
                            ...order, 
                            shipping_address: { ...order.shipping_address!, telephone: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex justify-between">
                        Address Line 1 <span className="text-red-500">*</span>
                        {(order.shipping_address?.street?.[0]?.length || 0) > 35 && (
                          <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                        )}
                      </Label>
                      <Input 
                        value={order.shipping_address?.street?.[0] || ''} 
                        onChange={(e) => {
                          const street = [...(order.shipping_address?.street || [])];
                          street[0] = e.target.value;
                          setOrder({ ...order, shipping_address: { ...order.shipping_address!, street } });
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex justify-between">
                          Address Line 2
                          {(order.shipping_address?.street?.[1]?.length || 0) > 35 && (
                            <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                          )}
                        </Label>
                        <Input 
                          value={order.shipping_address?.street?.[1] || ''} 
                          onChange={(e) => {
                            const street = [...(order.shipping_address?.street || [])];
                            street[1] = e.target.value;
                            setOrder({ ...order, shipping_address: { ...order.shipping_address!, street } });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex justify-between">
                          Address Line 3
                          {(order.shipping_address?.street?.[2]?.length || 0) > 35 && (
                            <span className="text-[10px] text-red-500 font-bold">EXCEEDS 35 CHARS</span>
                          )}
                        </Label>
                        <Input 
                          value={order.shipping_address?.street?.[2] || ''} 
                          onChange={(e) => {
                            const street = [...(order.shipping_address?.street || [])];
                            street[2] = e.target.value;
                            setOrder({ ...order, shipping_address: { ...order.shipping_address!, street } });
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>City <span className="text-red-500">*</span></Label>
                        <Input 
                          value={order.shipping_address?.city || ''} 
                          onChange={(e) => setOrder({
                            ...order, 
                            shipping_address: { ...order.shipping_address!, city: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Region</Label>
                        <Input 
                          value={order.shipping_address?.region || ''} 
                          onChange={(e) => setOrder({
                            ...order, 
                            shipping_address: { ...order.shipping_address!, region: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Postcode <span className="text-red-500">*</span></Label>
                        <Input 
                          value={order.shipping_address?.postcode || ''} 
                          onChange={(e) => setOrder({
                            ...order, 
                            shipping_address: { ...order.shipping_address!, postcode: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Country <span className="text-red-500">*</span></Label>
                        <Select 
                          value={order.shipping_address?.country_id}
                          onValueChange={(v) => setOrder({
                            ...order,
                            shipping_address: { ...order.shipping_address!, country_id: v }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select country">
                              {COUNTRY_NAMES[order.shipping_address?.country_id || ''] || order.shipping_address?.country_id}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                              <SelectItem key={code} value={code}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-4 p-4 bg-zinc-50 border rounded-lg mt-4 items-center h-[58px]">
                      <div className="flex-1 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={order.shipping_address?.is_residential ? "default" : "outline"}
                          size="sm"
                          className={`h-7 w-full text-[9px] font-bold uppercase tracking-wider transition-all rounded-md ${
                            order.shipping_address?.is_residential 
                              ? "bg-zinc-900 text-white shadow-inner" 
                              : "bg-white text-zinc-500 border-zinc-200"
                          }`}
                          onClick={() => setOrder({
                            ...order,
                            shipping_address: { ...order.shipping_address!, is_residential: !order.shipping_address?.is_residential }
                          })}
                        >
                          {order.shipping_address?.is_residential ? 'Residential' : 'Business'}
                        </Button>
                      </div>
                      <Separator orientation="vertical" className="h-6" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-600">Address Validation</span>
                        <div className="w-6 h-6 flex items-center justify-center border rounded bg-white">
                          <ValidationIcon status={isFedExValid} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => setIsEditingCustomer(false)}>Done</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Customer</p>
                <p className="font-bold text-lg">{order.customer_firstname} {order.customer_lastname}</p>
                {order.shipping_address?.company && <p className="text-zinc-700 font-medium">{order.shipping_address.company}</p>}
                <p className="text-zinc-600">{order.customer_email}</p>
                <p className="text-zinc-600">{order.shipping_address?.telephone || 'No phone number'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Shipping Address</p>
                <p className="font-bold text-lg">{order.shipping_address?.street?.join(', ') || 'No street address'}</p>
                <p className="text-zinc-600">
                  {order.shipping_address?.city}, {order.shipping_address?.region} {order.shipping_address?.postcode}
                </p>
                <p className="text-zinc-600">
                  {COUNTRY_NAMES[order.shipping_address?.country_id || ''] || order.shipping_address?.country_id}
                </p>
              </div>

              <div className="col-span-2 flex gap-4 p-4 bg-zinc-50 border rounded-lg items-center h-[58px]">
                <div className="flex-1 flex items-center gap-2">
                  <Button
                    type="button"
                    variant={order.shipping_address?.is_residential ? "default" : "outline"}
                    size="sm"
                    className={`h-7 w-full text-[9px] font-bold uppercase tracking-wider transition-all rounded-md ${
                      order.shipping_address?.is_residential 
                        ? "bg-zinc-900 text-white shadow-inner" 
                        : "bg-white text-zinc-500 border-zinc-200"
                    }`}
                    onClick={() => setOrder({
                      ...order,
                      shipping_address: { ...order.shipping_address!, is_residential: !order.shipping_address?.is_residential }
                    })}
                  >
                    {order.shipping_address?.is_residential ? 'Residential' : 'Business'}
                  </Button>
                </div>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-600">Address Validation</span>
                  <div className="w-6 h-6 flex items-center justify-center border rounded bg-white">
                    <ValidationIcon status={isFedExValid} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package size={20} /> Order Items
              </CardTitle>
              {id === 'manual' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const newItem = {
                      name: 'Manual Item',
                      sku: `MAN-${Date.now()}`,
                      qty_ordered: 1,
                      price: 0,
                      weight: 0.1
                    };
                    setOrder({ ...order, items: [...order.items, newItem] });
                  }}
                >
                  Add Item
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-left">Customs</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const currencySymbol = credentials.general.currency === 'GBP' ? '£' : credentials.general.currency === 'EUR' ? '€' : '$';
                    const items = order.items || [];
                    const orderTotal = items.reduce((sum, item) => sum + (item.price * item.qty_ordered), 0);
                    
                    return (
                      <>
                        {items.map((item, idx) => {
                          const product = productDetails[item.sku];
                    
                    // Helper to get attribute value or label
                    const getAttr = (code: string) => {
                      if (!product) return 'N/A';
                      
                      // Try custom_attributes first
                      const attr = product.custom_attributes?.find((a: any) => a.attribute_code === code);
                      let val = attr?.value;
                      
                      // Fallback for HTS/Commodity codes
                      if (val === undefined && code === 'commodity_code') {
                        const htsAttr = product.custom_attributes?.find((a: any) => 
                          ['hts_code', 'ts_hts_code', 'ts_commodity_code', 'hs_code', 'commodity_code', 'harmonized_system_code'].includes(a.attribute_code)
                        );
                        val = htsAttr?.value;
                      }
                      
                      // Fallback to top-level property
                      if (val === undefined && product[code] !== undefined) {
                        val = product[code];
                      }
                      
                      if (val === undefined || val === null) return 'N/A';
                      
                      // If it's a dropdown/select, try to find the label
                      const options = attributeOptions[code] || [];
                      if (options.length > 0) {
                        const option = options.find(o => String(o.value) === String(val));
                        if (option && option.label) {
                          return option.label;
                        }
                      }
                      
                      // If it's a country code, try to map to full name
                      if (code === 'country_of_manufacture' && String(val).length === 2) {
                        return COUNTRY_NAMES[String(val)] || String(val);
                      }
                      
                      return String(val);
                    };

                    const htsCode = getAttr('commodity_code');
                    const hscCode = getAttr('harmonized_system_code');
                    const coo = getAttr('country_of_manufacture');
                    const itemTotal = item.price * item.qty_ordered;

                    const truncatedName = item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name;

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          <div title={item.name}>
                            <p>{truncatedName}</p>
                            <p className="text-zinc-500 font-mono text-[10px]">{item.sku}</p>
                            <p className="text-zinc-400 text-[9px] mt-1">Weight: {product?.weight || item.weight || '0.00'} kg</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.qty_ordered}</TableCell>
                        <TableCell className="text-left">
                          <div className="text-xs">
                            <p><span className="text-zinc-400">HTS:</span> {htsCode}</p>
                            {hscCode !== 'N/A' && <p><span className="text-zinc-400">HSC:</span> {hscCode}</p>}
                            <p><span className="text-zinc-400">COO:</span> {coo}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {currencySymbol}{item.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {currencySymbol}{itemTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Dialog open={editingItem?.sku === item.sku} onOpenChange={(open) => !open && setEditingItem(null)}>
                            <DialogTrigger
                              render={
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingItem(item)}>
                                  <Pencil size={14} />
                                </Button>
                              }
                            />
                            <DialogContent className="max-w-[630px]">
                              <DialogHeader>
                                <DialogTitle>Edit Item: {item.name}</DialogTitle>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                  <Label>Item Name</Label>
                                  <Input 
                                    value={item.name} 
                                    onChange={(e) => {
                                      const newItems = [...order.items];
                                      newItems[idx] = { ...item, name: e.target.value };
                                      setOrder({ ...order, items: newItems });
                                    }}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Price</Label>
                                    <Input 
                                      type="number"
                                      value={item.price} 
                                      onChange={(e) => {
                                        const newItems = [...order.items];
                                        newItems[idx] = { ...item, price: parseFloat(e.target.value) || 0 };
                                        setOrder({ ...order, items: newItems });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Quantity</Label>
                                    <Input 
                                      type="number"
                                      value={item.qty_ordered} 
                                      onChange={(e) => {
                                        const newItems = [...order.items];
                                        newItems[idx] = { ...item, qty_ordered: parseFloat(e.target.value) || 0 };
                                        setOrder({ ...order, items: newItems });
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Commodity Code</Label>
                                    <Input 
                                      value={htsCode} 
                                      onChange={(e) => {
                                        const newProductDetails = { ...productDetails };
                                        const product = { ...newProductDetails[item.sku] };
                                        if (!product.sku) product.sku = item.sku;
                                        const attrs = [...(product.custom_attributes || [])];
                                        
                                        // Find any existing HTS-related attribute
                                        const htsCodes = ['commodity_code', 'hts_code', 'ts_hts_code', 'ts_commodity_code', 'hs_code'];
                                        const htsIdx = attrs.findIndex(a => htsCodes.includes(a.attribute_code));
                                        
                                        if (htsIdx > -1) {
                                          attrs[htsIdx] = { ...attrs[htsIdx], value: e.target.value };
                                        } else {
                                          attrs.push({ attribute_code: 'commodity_code', value: e.target.value });
                                        }
                                        
                                        product.custom_attributes = attrs;
                                        newProductDetails[item.sku] = product;
                                        setProductDetails(newProductDetails);
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>HSC</Label>
                                    <Input 
                                      value={hscCode} 
                                      onChange={(e) => {
                                        const newProductDetails = { ...productDetails };
                                        const product = { ...newProductDetails[item.sku] };
                                        if (!product.sku) product.sku = item.sku;
                                        const attrs = [...(product.custom_attributes || [])];
                                        const hscIdx = attrs.findIndex(a => a.attribute_code === 'harmonized_system_code');
                                        if (hscIdx > -1) attrs[hscIdx] = { ...attrs[hscIdx], value: e.target.value };
                                        else attrs.push({ attribute_code: 'harmonized_system_code', value: e.target.value });
                                        product.custom_attributes = attrs;
                                        newProductDetails[item.sku] = product;
                                        setProductDetails(newProductDetails);
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Country of Origin</Label>
                                  <Input 
                                    value={coo} 
                                    onChange={(e) => {
                                      const newProductDetails = { ...productDetails };
                                      const product = { ...newProductDetails[item.sku] };
                                      if (!product.sku) product.sku = item.sku;
                                      const attrs = [...(product.custom_attributes || [])];
                                      const cooIdx = attrs.findIndex(a => a.attribute_code === 'country_of_manufacture');
                                      if (cooIdx > -1) attrs[cooIdx] = { ...attrs[cooIdx], value: e.target.value };
                                      else attrs.push({ attribute_code: 'country_of_manufacture', value: e.target.value });
                                      product.custom_attributes = attrs;
                                      newProductDetails[item.sku] = product;
                                      setProductDetails(newProductDetails);
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Weight (kg)</Label>
                                  <Input 
                                    type="number"
                                    step="0.01"
                                    value={product?.weight || item.weight || ''} 
                                    onChange={(e) => {
                                      const newWeight = parseFloat(e.target.value) || 0;
                                      const newProductDetails = { ...productDetails };
                                      const product = { ...newProductDetails[item.sku] };
                                      if (!product.sku) product.sku = item.sku;
                                      product.weight = newWeight;
                                      newProductDetails[item.sku] = product;
                                      setProductDetails(newProductDetails);
                                      
                                      // Also update the item weight in the order if it's a manual order or for consistency
                                      const newItems = [...order.items];
                                      newItems[idx] = { ...item, weight: newWeight };
                                      setOrder({ ...order, items: newItems });
                                    }}
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button onClick={() => setEditingItem(null)}>Done</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          {id === 'manual' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" 
                              onClick={() => {
                                const newItems = order.items.filter((_, i) => i !== idx);
                                setOrder({ ...order, items: newItems });
                              }}
                            >
                              <X size={14} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-zinc-50/50">
                    <TableCell colSpan={4} className="text-right font-medium text-zinc-500 py-4">
                      Order Total
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg text-zinc-900 py-4">
                      {credentials.general.currency === 'GBP' ? '£' : credentials.general.currency === 'EUR' ? '€' : '$'}{(order.items || []).reduce((sum, item) => sum + (item.price * item.qty_ordered), 0).toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              );
            })()}
          </TableBody>
              </Table>
              {isFetchingProducts && (
                <div className="flex items-center justify-center py-4 text-zinc-500 text-sm gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  Fetching product customs data...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Shipping Console */}
        <div className="space-y-6">
          <Card className="overflow-hidden border-zinc-200 p-0 gap-0">
            <div className="bg-zinc-900 p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <Truck size={18} /> Shipping Console
              </h3>
              <p className="text-xs text-zinc-400">Configure package and fetch rates</p>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase text-zinc-500">Weight <span className="text-red-500">*</span></Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-[10px] gap-1" 
                      disabled={parcels.length > 1}
                      onClick={() => { setWeightKg(''); setWeightG(''); }}
                    >
                      <RotateCcw size={10} /> Clear Weight
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {(credentials.general.weightDisplayMode === 'both' || credentials.general.weightDisplayMode === 'kg') && (
                      <div className="space-y-2">
                        <Label htmlFor="weightKg">Kilograms</Label>
                        <Input 
                          id="weightKg" 
                          type="number" 
                          step="0.1"
                          placeholder="0"
                          value={weightKg} 
                          disabled={parcels.length > 1}
                          onChange={(e) => handleWeightKgChange(e.target.value)}
                          onBlur={handleWeightKgBlur}
                          className={parcels.length > 1 ? "bg-zinc-50 font-bold" : ""}
                        />
                      </div>
                    )}
                    {(credentials.general.weightDisplayMode === 'both' || credentials.general.weightDisplayMode === 'grams') && (
                      <div className="space-y-2">
                        <Label htmlFor="weightG">Grams</Label>
                        <Input 
                          id="weightG" 
                          type="number" 
                          placeholder="0"
                          value={weightG} 
                          disabled={parcels.length > 1}
                          onChange={(e) => handleWeightGChange(e.target.value)}
                          onBlur={handleWeightGBlur}
                          className={parcels.length > 1 ? "bg-zinc-50 font-bold" : ""}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {parcels.length <= 1 && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase text-zinc-500">Dimensions (cm) <span className="text-red-500">*</span></Label>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setLength(''); setWidth(''); setHeight(''); }}>
                          <RotateCcw size={10} /> Clear Dims
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="length">Length</Label>
                          <Input 
                            id="length" 
                            type="number" 
                            placeholder="0"
                            value={length} 
                            onChange={(e) => setLength(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="width">Width</Label>
                          <Input 
                            id="width" 
                            type="number" 
                            placeholder="0"
                            value={width} 
                            onChange={(e) => setWidth(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="height">Height</Label>
                          <Input 
                            id="height" 
                            type="number" 
                            placeholder="0"
                            value={height} 
                            onChange={(e) => setHeight(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Parcel Options Button */}
                <div className="w-full space-y-3 flex flex-col items-stretch">
                  <Dialog open={isParcelModalOpen} onOpenChange={handleParcelModalClose}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={`w-full flex flex-col h-auto min-h-[32px] py-1 px-3 gap-1 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all ${parcels.length > 1 ? "bg-zinc-50 border-zinc-900 border-2" : ""}`}
                        onClick={handleParcelOptionsOpen}
                      >
                        <div className="flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider w-full">
                          <Box size={14} className={parcels.length > 1 ? "text-zinc-900" : "text-zinc-400"} />
                          {parcels.length > 1 ? `${parcels.length} Parcels Configured` : "Parcel Options"}
                        </div>
                        
                        {parcels.length > 1 && (
                          <div className="w-full space-y-1 mt-1">
                            {parcels.slice(0, 3).map((p, i) => (
                              <div key={p.id} className="flex justify-between items-center text-[10px] text-zinc-500 bg-white/50 px-3 py-1 rounded border border-zinc-100 w-full">
                                <span className="font-bold whitespace-nowrap">Parcel {i + 1}</span>
                                <span className="whitespace-nowrap">{p.weight}kg • {p.length}x{p.width}x{p.height}cm</span>
                              </div>
                            ))}
                            {parcels.length > 3 && (
                              <p className="text-[9px] text-zinc-400 text-center italic">+{parcels.length - 3} more parcels</p>
                            )}
                          </div>
                        )}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[800px] max-h-[80vh] flex flex-col p-0">
                      <DialogHeader className="p-6 border-b">
                        <DialogTitle className="flex items-center gap-2">
                          <Box className="w-5 h-5" /> Parcel Manager
                        </DialogTitle>
                        <DialogDescription>
                          Manage dimensions and weight for each parcel in this shipment.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {parcels.map((parcel, index) => (
                            <div key={parcel.id} className="relative overflow-hidden border border-zinc-200 rounded-xl bg-white flex flex-col">
                              <div className="p-3 bg-zinc-50 border-b flex flex-row items-center justify-between space-y-0">
                                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Parcel {index + 1}</span>
                                <div className="flex items-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-zinc-400 hover:text-zinc-900"
                                    onClick={() => handleDuplicateParcel(parcel)}
                                    title="Duplicate"
                                  >
                                    <Copy size={12} />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleDeleteParcel(parcel.id)}
                                    title="Delete"
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </div>
                              </div>
                              <div className="p-4 space-y-4">
                                <div className="space-y-1.5">
                                  <Label className="text-[10px] font-bold uppercase text-zinc-500">Weight</Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(credentials.general.weightDisplayMode === 'both' || credentials.general.weightDisplayMode === 'kg') && (
                                      <div className="space-y-1">
                                        <Label className="text-[9px] text-zinc-400">Kilograms</Label>
                                        <Input 
                                          type="number" 
                                          step="0.1"
                                          placeholder="0"
                                          value={parcel.weightKg} 
                                          onChange={(e) => updateParcel(parcel.id, 'weightKg', e.target.value)}
                                          onBlur={() => handleParcelWeightBlur(parcel.id, 'weightKg')}
                                          className="h-8 text-xs font-bold"
                                        />
                                      </div>
                                    )}
                                    {(credentials.general.weightDisplayMode === 'both' || credentials.general.weightDisplayMode === 'grams') && (
                                      <div className="space-y-1">
                                        <Label className="text-[9px] text-zinc-400">Grams</Label>
                                        <Input 
                                          type="number" 
                                          placeholder="0"
                                          value={parcel.weightG} 
                                          onChange={(e) => updateParcel(parcel.id, 'weightG', e.target.value)}
                                          onBlur={() => handleParcelWeightBlur(parcel.id, 'weightG')}
                                          className="h-8 text-xs font-bold"
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-zinc-400 italic">Total: {parcel.weight}kg</p>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[10px] font-bold uppercase text-zinc-500">Dimensions (cm)</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="space-y-1">
                                      <Label className="text-[9px] text-zinc-400">Length</Label>
                                      <Input 
                                        type="number" 
                                        value={parcel.length} 
                                        onChange={(e) => updateParcel(parcel.id, 'length', e.target.value)}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[9px] text-zinc-400">Width</Label>
                                      <Input 
                                        type="number" 
                                        value={parcel.width} 
                                        onChange={(e) => updateParcel(parcel.id, 'width', e.target.value)}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[9px] text-zinc-400">Height</Label>
                                      <Input 
                                        type="number" 
                                        value={parcel.height} 
                                        onChange={(e) => updateParcel(parcel.id, 'height', e.target.value)}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          <Button 
                            variant="outline" 
                            className="h-full min-h-[160px] border-dashed border-2 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 flex flex-col gap-2 rounded-xl group transition-all"
                            onClick={handleAddParcel}
                          >
                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-900 group-hover:scale-110 transition-all">
                              <Plus className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-bold text-zinc-600 group-hover:text-zinc-900 transition-colors">Add Another Parcel</p>
                              <p className="text-xs text-zinc-400">Expand this shipment</p>
                            </div>
                          </Button>
                        </div>
                      </div>
                      
                      <DialogFooter className="p-6 border-t bg-zinc-50 space-x-2 m-0">
                        <Button 
                          variant="ghost" 
                          onClick={() => {
                            // If they clear everything, we handle it on close logic, 
                            // but maybe they want to cancel? 
                            // Actually the user wants it to apply on exit.
                            setIsParcelModalOpen(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          className="bg-zinc-900"
                          onClick={() => handleParcelModalClose(false)}
                        >
                          Save Parcels
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label className="text-xs font-bold uppercase text-zinc-500">Billing Options</Label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>Bill Shipping Charges To</Label>
                      <Select value={billShippingTo} onValueChange={setBillShippingTo}>
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Select billing">
                            {billShippingTo === 'shipper' ? 'Shipper' : billShippingTo === 'recipient' ? 'Recipient' : 'Third Party'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="shipper">Shipper</SelectItem>
                          <SelectItem value="recipient">Recipient</SelectItem>
                          <SelectItem value="third_party">Third Party</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {billShippingTo !== 'shipper' && (
                      <div className="space-y-2">
                        <Label>Shipping Account Number</Label>
                        <Input 
                          value={shipAccountNumber} 
                          onChange={(e) => setShipAccountNumber(e.target.value)} 
                          placeholder="Enter account number"
                          className="text-xs h-8"
                        />
                      </div>
                    )}
                    {(credentials.general.alwaysShowDuties || credentials.general.originCountry !== order.shipping_address?.country_id) && (
                      <>
                        <div className="space-y-2">
                          <Label>Bill Duties/Taxes To</Label>
                          <Select value={billDutiesTo} onValueChange={setBillDutiesTo}>
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue placeholder="Select billing">
                                {billDutiesTo === 'shipper' ? 'Shipper (DDP)' : billDutiesTo === 'recipient' ? 'Recipient (DAP)' : 'Third Party'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="shipper">Shipper (DDP)</SelectItem>
                              <SelectItem value="recipient">Recipient (DAP)</SelectItem>
                              <SelectItem value="third_party">Third Party</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {billDutiesTo !== 'shipper' && (
                          <div className="space-y-2">
                            <Label>Duties Account Number</Label>
                            <Input 
                              value={dutyAccountNumber} 
                              onChange={(e) => setDutyAccountNumber(e.target.value)} 
                              placeholder="Enter account number"
                              className="text-xs h-8"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Button 
                className="w-full bg-zinc-900 hover:bg-zinc-800" 
                onClick={fetchRates}
                disabled={isRating}
              >
                {isRating ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
                Get Live Rates
              </Button>

              <div className="space-y-4">
                {selectedRate && !labelUrl && (
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={isShipping}
                    onClick={handleCreateLabel}
                  >
                    {isShipping ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Create Label
                  </Button>
                )}

                {labelUrl && (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm space-y-2">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-bold">
                          {credentials.general.markAsShipped && id !== 'manual' 
                            ? "Label generated & Magento Updated!" 
                            : "Label generated successfully!"}
                        </span>
                      </div>
                      {trackingNumber && (
                        <div className="pl-8 font-mono text-xs">
                          Tracking: {trackingNumber}
                        </div>
                      )}
                    </div>
                    <Dialog open={isLabelViewerOpen} onOpenChange={setIsLabelViewerOpen}>
                      <DialogTrigger
                        render={
                          <Button variant="outline" className="w-full gap-2">
                            <Printer size={18} /> View & Print Label
                          </Button>
                        }
                      />
                      <DialogContent className="max-w-[630px] w-full h-[95vh] flex flex-col p-0 overflow-hidden">
                        <DialogHeader className="p-4 border-b">
                          <DialogTitle className="flex items-center gap-2">
                            <Printer className="w-5 h-5" /> Shipping Label Viewer
                          </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 bg-zinc-100 relative">
                          {credentials.general.labelFormat === 'PDF' ? (
                            <iframe 
                              src={`${labelUrl}#toolbar=1&navpanes=0&scrollbar=1&view=Fit`} 
                              className="w-full h-full border-none"
                              title="Shipping Label"
                              onLoad={(e) => {
                                if (credentials.general.autoPrintLabel) {
                                  const iframe = e.currentTarget;
                                  if (iframe && iframe.contentWindow) {
                                    try {
                                      iframe.contentWindow.print();
                                    } catch (err) {
                                      console.error("[OrderDetails] Auto-print failed:", err);
                                    }
                                  }
                                }
                              }}
                            />
                          ) : (
                            <div className="p-8 flex items-center justify-center h-full">
                              <div className="bg-white p-6 rounded-lg shadow-sm border max-w-md w-full text-center space-y-4">
                                <Package className="w-12 h-12 mx-auto text-zinc-400" />
                                <h3 className="font-bold text-lg">ZPL Label Generated</h3>
                                <p className="text-sm text-zinc-500">
                                  ZPL labels are raw printer commands and cannot be previewed directly in the browser. 
                                  Please use a ZPL-compatible printer or utility to print this label.
                                </p>
                                <Button variant="outline" className="w-full" onClick={() => window.open(labelUrl!, '_blank')}>
                                  Download ZPL File
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <DialogFooter className="m-0 py-6 px-8 border-t bg-zinc-50 flex flex-row justify-center sm:justify-center items-center gap-0">
                          {credentials.general.labelFormat === 'PDF' && (
                            <Button size="lg" className="px-8 shadow-sm" onClick={() => {
                              const iframe = document.querySelector('iframe[title="Shipping Label"]') as HTMLIFrameElement;
                              if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.print();
                              }
                            }}>
                              Print Label
                            </Button>
                          )}
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>

              {rates.length > 0 && !labelUrl && !isShipping && (
                <div className="space-y-3">
                  <Separator />
                  <p className="text-xs font-bold uppercase text-zinc-500 tracking-widest">Available Services</p>
                  <div className="space-y-2">
                    {rates.map((rate) => (
                      <div 
                        key={rate.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedRate?.id === rate.id 
                            ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" 
                            : "border-zinc-200 hover:border-zinc-400"
                        }`}
                        onClick={() => setSelectedRate(rate)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-sm">
                              {rate.service.toLowerCase().startsWith(rate.carrier.toLowerCase()) 
                                ? rate.service 
                                : `${rate.carrier} ${rate.service}`}
                            </p>
                            <p className="text-xs text-zinc-500">{rate.delivery}</p>
                          </div>
                          <p className="font-bold text-zinc-900">
                            {credentials.general.currency === 'GBP' ? '£' : credentials.general.currency === 'EUR' ? '€' : '$'}
                            {rate.price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
