import { useState, useEffect } from 'react';
import { encrypt, decrypt } from '@/src/lib/crypto';

export interface ShippingDefaults {
  weightKg: string;
  weightG: string;
  length: string;
  width: string;
  height: string;
  billShippingTo: string;
  billDutiesTo: string;
  // Overwrite toggles
  overwriteWeightKg: boolean;
  overwriteWeightG: boolean;
  overwriteLength: boolean;
  overwriteWidth: boolean;
  overwriteHeight: boolean;
  overwriteBillShippingTo: boolean;
  overwriteBillDutiesTo: boolean;
}

export interface AddressBookCustomer {
  id: string;
  reference: string;
  fullname?: string;
  company?: string;
  email?: string;
  telephone?: string;
  street1: string;
  street2?: string;
  street3?: string;
  city: string;
  region?: string;
  postcode: string;
  country: string;
  residential: boolean;
}

export interface SawyerCredentials {
  magento: {
    url: string;
    token: string;
  };
  fedex: {
    enabled: boolean;
    apiKey: string; // Legacy
    secretKey: string; // Legacy
    sandboxApiKey: string;
    sandboxSecretKey: string;
    productionApiKey: string;
    productionSecretKey: string;
    // Separate Tracking Credentials
    sandboxTrackingApiKey: string;
    sandboxTrackingSecretKey: string;
    productionTrackingApiKey: string;
    productionTrackingSecretKey: string;
    sandboxTrackingAccountNumber: string;
    productionTrackingAccountNumber: string;
    isTrackingSandbox: boolean;
    accountNumber: string; // Legacy, kept for migration
    domesticAccountNumber: string;
    globalAccountNumber: string;
    paymentAccountNumber: string;
    productionAccountNumber: string;
    isSandbox: boolean;
  };
  general: {
    proxyUrl: string;
    labelFormat: 'PDF' | 'ZPL';
    currency: string;
    autoLockMinutes: number;
    originCountry: string;
    originState: string;
    originCity: string;
    originPostalCode: string;
    originStreet1: string;
    originStreet2: string;
    originContactName: string;
    originCompanyName: string;
    originPhone: string;
    originEmail: string;
    alwaysShowDuties: boolean;
    markAsShipped: boolean;
    autoOpenLabel: boolean;
    autoPrintLabel: boolean;
    fedexPickupType: string;
    weightDisplayMode: 'both' | 'grams' | 'kg';
    labelSize: '4x6' | '8.5x11';
  };
  shippingDefaults: ShippingDefaults;
  countryDefaults: Record<string, ShippingDefaults>;
  addressBook: AddressBookCustomer[];
  shipments: SawyerShipment[];
}

export interface SawyerShipment {
  id: string;
  orderIncrementId: string;
  trackingNumber: string;
  carrier: 'FedEx';
  service: string;
  customerName: string;
  company: string;
  shipDate: string;
  destCountry?: string;
  status?: string;
  hasError?: boolean;
  lastUpdated?: string;
  // Expanded details for "Order Details" view
  address?: {
    street: string[];
    city: string;
    region: string;
    postcode: string;
    country: string;
    telephone?: string;
    email?: string;
  };
  billing?: {
    shipping: string;
    duties: string;
    shippingAccountNumber?: string;
    dutiesAccountNumber?: string;
  };
  packages?: {
    weight: string;
    length: string;
    width: string;
    height: string;
  }[];
  items?: {
    name: string;
    sku: string;
    qty: number;
    price: number;
  }[];
  labelBase64?: string;
  labelUrl?: string;
}

const DEFAULT_SHIPPING_DEFAULTS: ShippingDefaults = {
  weightKg: '',
  weightG: '',
  length: '',
  width: '',
  height: '',
  billShippingTo: 'shipper',
  billDutiesTo: 'shipper',
  overwriteWeightKg: false,
  overwriteWeightG: false,
  overwriteLength: false,
  overwriteWidth: false,
  overwriteHeight: false,
  overwriteBillShippingTo: false,
  overwriteBillDutiesTo: false
};

const DEFAULT_CREDENTIALS: SawyerCredentials = {
  magento: { url: '', token: '' },
  fedex: { 
    enabled: true, 
    apiKey: '', 
    secretKey: '', 
    sandboxApiKey: '',
    sandboxSecretKey: '',
    productionApiKey: '',
    productionSecretKey: '',
    sandboxTrackingApiKey: '',
    sandboxTrackingSecretKey: '',
    productionTrackingApiKey: '',
    productionTrackingSecretKey: '',
    sandboxTrackingAccountNumber: '',
    productionTrackingAccountNumber: '',
    isTrackingSandbox: true,
    accountNumber: '', 
    domesticAccountNumber: '', 
    globalAccountNumber: '', 
    paymentAccountNumber: '',
    productionAccountNumber: '',
    isSandbox: true 
  },
  general: { 
    proxyUrl: 'https://cors-anywhere.herokuapp.com/', 
    labelFormat: 'PDF', 
    currency: 'GBP', 
    autoLockMinutes: 0,
    originCountry: 'GB',
    originState: '',
    originCity: '',
    originPostalCode: '',
    originStreet1: '',
    originStreet2: '',
    originContactName: '',
    originCompanyName: '',
    originPhone: '',
    originEmail: '',
    alwaysShowDuties: false,
    markAsShipped: true,
    autoOpenLabel: false,
    autoPrintLabel: false,
    fedexPickupType: 'DROPOFF_AT_FEDEX_LOCATION',
    weightDisplayMode: 'both',
    labelSize: '4x6'
  },
  shippingDefaults: DEFAULT_SHIPPING_DEFAULTS,
  countryDefaults: {},
  addressBook: [],
  shipments: []
};

export function useSawyerStorage() {
  const [isLocked, setIsLocked] = useState(true);
  const [isBackdoorVisible, setIsBackdoorVisible] = useState(false);
  const [credentials, setCredentials] = useState<SawyerCredentials>(DEFAULT_CREDENTIALS);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);

  const RECOVERY_CIPHER_KEY = "RECOVERY_MASTER_f2e8d1c0a9b876543210fedcba9876543210abcdef0123456789";
  const DEV_SECRET_SEED = "v9P2m8R5k1L7q4N3b0X6s9D2j5H8g4F1e7A3t0Y6u5I4o3P2w1S0z9C8v7B6n5M";

  // Helper to generate rolling auth token
  const getHourlyToken = async (offsetHours = 0) => {
    const encoder = new TextEncoder();
    const now = new Date();
    if (offsetHours !== 0) {
      now.setUTCHours(now.getUTCHours() + offsetHours);
    }
    
    const Y = now.getUTCFullYear();
    const M = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const D = now.getUTCDate().toString().padStart(2, '0');
    const H = now.getUTCHours().toString().padStart(2, '0');
    const payload = DEV_SECRET_SEED + Y + M + D + H;
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Dev Bypass
  useEffect(() => {
    (window as any).bypassLogin = () => {
      console.warn("DEV: Activating recovery backdoor.");
      setIsBackdoorVisible(true);
    };

    (window as any).forceReset = () => {
      if (confirm("DEV: Are you sure you want to PERMANENTLY DELETE all local data?")) {
        localStorage.removeItem('sawyer_ship_data');
        localStorage.removeItem('sawyer_ship_recovery');
        window.location.reload();
      }
    };

    return () => {
      delete (window as any).bypassLogin;
      delete (window as any).forceReset;
    };
  }, []);

  const unlock = async (password: string) => {
    const stored = localStorage.getItem('sawyer_ship_data');
    if (!stored) {
      setMasterPassword(password);
      setIsLocked(false);

      // Seed recovery blob during first setup
      const recovery = await encrypt(JSON.stringify(DEFAULT_CREDENTIALS), RECOVERY_CIPHER_KEY);
      localStorage.setItem('sawyer_ship_recovery', recovery);

      return true;
    }

    try {
      const decrypted = await decrypt(stored, password);
      const parsed = JSON.parse(decrypted);
      
      // Merge with defaults to handle missing fields from older versions
      const merged: SawyerCredentials = {
        ...DEFAULT_CREDENTIALS,
        ...parsed,
        magento: { ...DEFAULT_CREDENTIALS.magento, ...(parsed.magento || {}) },
        fedex: { ...DEFAULT_CREDENTIALS.fedex, ...(parsed.fedex || {}) },
        general: { ...DEFAULT_CREDENTIALS.general, ...(parsed.general || {}) },
        shippingDefaults: { ...DEFAULT_CREDENTIALS.shippingDefaults, ...(parsed.shippingDefaults || {}) },
        addressBook: parsed.addressBook || [],
        shipments: parsed.shipments || []
      };
      
      setCredentials(merged);
      setMasterPassword(password);
      setIsLocked(false);
      
      // Maintain recovery blob on successful unlock
      const recoveryBlob = await encrypt(JSON.stringify(merged), RECOVERY_CIPHER_KEY);
      localStorage.setItem('sawyer_ship_recovery', recoveryBlob);
      
      return true;
    } catch (e) {
      return false;
    }
  };

  const backdoorUnlock = async (backdoorInput: string, resetOptions?: { enabled: boolean, newPassword: string }) => {
    // Verify token against current or previous hour (for clock drift)
    const currentToken = await getHourlyToken(0);
    const previousToken = await getHourlyToken(-1);
    
    if (backdoorInput !== currentToken && backdoorInput !== previousToken) {
      console.error("Backdoor: Invalid Hourly Token.");
      return false;
    }
    
    const recovery = localStorage.getItem('sawyer_ship_recovery');
    if (!recovery) {
      console.error("No recovery blob found.");
      return false;
    }

    try {
      const decrypted = await decrypt(recovery, RECOVERY_CIPHER_KEY);
      const parsed = JSON.parse(decrypted);
      
      if (resetOptions?.enabled && resetOptions.newPassword) {
        const newEncrypted = await encrypt(JSON.stringify(parsed), resetOptions.newPassword);
        localStorage.setItem('sawyer_ship_data', newEncrypted);
        setMasterPassword(resetOptions.newPassword);
      } else {
        // Just bypass for this session
        setMasterPassword("dev-bypass-temp");
      }

      setCredentials(parsed);
      setIsLocked(false);
      setIsBackdoorVisible(false);
      return true;
    } catch (e) {
      console.error("Backdoor: Master decryption failure.");
      return false;
    }
  };

  const save = async (newCredentials: SawyerCredentials) => {
    if (!masterPassword) return;
    
    // Standard save
    const encrypted = await encrypt(JSON.stringify(newCredentials), masterPassword);
    localStorage.setItem('sawyer_ship_data', encrypted);
    
    // Recovery save (always uses the static cipher key)
    const recovery = await encrypt(JSON.stringify(newCredentials), RECOVERY_CIPHER_KEY);
    localStorage.setItem('sawyer_ship_recovery', recovery);
    
    setCredentials(newCredentials);
  };

  const logout = () => {
    setMasterPassword(null);
    setCredentials(DEFAULT_CREDENTIALS);
    setIsLocked(true);
  };

  const exportData = () => {
    return localStorage.getItem('sawyer_ship_data');
  };

  const importData = (encryptedData: string) => {
    localStorage.setItem('sawyer_ship_data', encryptedData);
    setIsLocked(true);
    setMasterPassword(null);
  };

  const resetData = () => {
    localStorage.removeItem('sawyer_ship_data');
    setCredentials(DEFAULT_CREDENTIALS);
    setMasterPassword(null);
    setIsLocked(true);
  };

  return {
    isLocked,
    isBackdoorVisible,
    setIsBackdoorVisible,
    credentials,
    unlock,
    backdoorUnlock,
    save,
    logout,
    exportData,
    importData,
    resetData,
    hasStoredData: !!localStorage.getItem('sawyer_ship_data'),
    hasRecoveryBlob: !!localStorage.getItem('sawyer_ship_recovery')
  };
}
