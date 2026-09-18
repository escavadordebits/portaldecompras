/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Search, 
  Plus, 
  LogOut, 
  User, 
  Package, 
  Truck, 
  CheckCircle,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Menu,
  X,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  RotateCw,
  FileText,
  Settings,
  Paperclip,
  ClipboardList,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  CheckSquare,
  ShieldCheck,
  Zap,
  Globe,
  Edit,
  Trash2,
  Building,
  Users,
  DollarSign,
  Activity,
  Briefcase,
  Calculator,
  FileSpreadsheet,
  Ruler,
  Layers,
  Printer
} from 'lucide-react';
import { BidComparativeView } from './components/BidComparativeView';
import { MeasurementsSummaryModal } from './components/MeasurementsSummaryModal';
import { DocumentAttachmentsSection } from './components/DocumentAttachmentsSection';
import { SalesOrderPrintModal } from './components/SalesOrderPrintModal';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut 
} from 'firebase/auth';
import { sapService, normalizeSapCompany } from './services/sapService';
import { calculatePersonnelCost } from './utils/costCalculations';
import { SAP_CONFIG } from './config/sapConfig';
import UserManagementView from './components/UserManagementView';
import { APP_VERSION_TAG } from './config/version';
import { Button } from '@/components/ui/button';

// Enhanced Logo Component using Icons
const Logo = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg" | "xl", className?: string }) => {
  const iconSize = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-10 h-10"
  }[size];
  
  const containerSize = {
    sm: "p-1",
    md: "p-1.5",
    lg: "p-2",
    xl: "p-3"
  }[size];

  return (
    <div className={`inline-flex items-center justify-center bg-evo-teal text-white rounded-md shadow-sm ${containerSize} ${className}`}>
      <ShieldCheck className={iconSize} />
    </div>
  );
};
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

type View = 'dashboard' | 'create-order' | 'list-orders' | 'create-request' | 'list-requests' | 'create-quotation' | 'list-quotations' | 'bid-map' | 'approvals' | 'create-down-payment' | 'list-down-payments' | 'quality' | 'maintenance' | 'costs' | 'calibration' | 'quotation-portal' | 'users' | 'sales-orders';

function SupplierPortalView({ docEntry }: { docEntry: number }) {
  const [quotation, setQuotation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    fetchQuotation();
  }, [docEntry]);

  const fetchQuotation = async () => {
    try {
      const data = await sapService.getPurchaseQuotation(docEntry);
      setQuotation(data);
      setLines(data.DocumentLines.map((l: any) => ({
        LineNum: l.LineNum,
        ItemCode: l.ItemCode,
        ItemDescription: l.ItemDescription,
        Quantity: l.Quantity,
        UnitPrice: l.UnitPrice || 0,
        RequiredDate: l.RequiredDate ? l.RequiredDate.split('T')[0] : '',
      })));
    } catch (error) {
      toast.error('Erro ao carregar oferta.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const updateData = {
        Comments: `${notes}\nTerms: ${paymentTerms}`,
        DocumentLines: lines.map(l => ({
          LineNum: l.LineNum,
          UnitPrice: l.UnitPrice,
          RequiredDate: l.RequiredDate
        }))
      };
      await sapService.updatePurchaseQuotation(docEntry, updateData);
      toast.success('Oferta de compra atualizada com sucesso!');
      setQuotation(null); // Clear to show success state
    } catch (error) {
      toast.error('Erro ao enviar proposta comercial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen bg-evo-bg"><Loader2 className="animate-spin text-evo-teal w-12 h-12" /></div>;
  
  if (!quotation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-evo-bg p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center space-y-6">
          <div className="bg-white p-2 rounded shadow-xl inline-block mb-4">
             <Logo size="lg" />
          </div>
          <h2 className="text-3xl font-black text-evo-dark uppercase tracking-tight">Proposta Recebida</h2>
          <p className="text-gray-500 font-medium">Sua proposta comercial foi registrada com segurança no nosso sistema. Entraremos em contato em breve.</p>
          <Button onClick={() => window.close()} className="evo-button-primary w-full">Fechar Portal</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-evo-bg font-sans">
      <header className="bg-evo-dark text-white p-6 shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Logo size="md" className="bg-white text-evo-teal" />
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-evo-teal">PORTAL DO FORNECEDOR</h1>
              <p className="text-[10px] uppercase font-bold tracking-[0.3em] opacity-40">Proposta Comercial para Oferta #{docEntry}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Empresa Requisitante</p>
            <p className="text-sm font-bold text-white">QUALITECH INSPEÇÕES</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-10 space-y-10 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="evo-card border-none col-span-2">
            <CardHeader className="bg-evo-bg/50 border-b border-evo-bg p-8">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-evo-dark flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-evo-teal" /> Itens Requisitados
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-evo-bg/20">
                  <TableRow className="border-evo-bg hover:bg-transparent">
                    <TableHead className="text-[10px] font-black uppercase tracking-tight px-8 py-4">Produto / Descrição</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-tight text-center">Qtd</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-tight w-40">Preço Unitário (R$)</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-tight w-48">Previsão Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={idx} className="border-evo-bg transition-opacity">
                      <TableCell className="px-8 py-6">
                        <p className="text-[11px] font-black uppercase text-evo-dark">{line.ItemDescription}</p>
                        <p className="text-[9px] font-bold text-evo-teal uppercase tracking-widest">{line.ItemCode}</p>
                      </TableCell>
                      <TableCell className="text-center font-black text-xs text-evo-dark">{line.Quantity}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          value={line.UnitPrice} 
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].UnitPrice = parseFloat(e.target.value);
                            setLines(newLines);
                          }}
                          className="rounded-none h-10 border-evo-bg bg-white focus:ring-1 focus:ring-evo-teal font-bold text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="date"
                          value={line.RequiredDate}
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].RequiredDate = e.target.value;
                            setLines(newLines);
                          }}
                          className="rounded-none h-10 border-evo-bg bg-white font-bold text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-8">
            <Card className="evo-card border-none bg-evo-dark text-white p-8">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-6 text-white/40">Condições Comerciais</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Formas de Pagamento</Label>
                  <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                    <SelectTrigger className="bg-white/5 border-white/10 rounded-none h-12 text-xs font-bold ring-offset-evo-dark focus:ring-evo-teal">
                      <SelectValue placeholder="Selecione prazo..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-evo-bg font-sans">
                      <SelectItem value="avista" className="text-xs uppercase font-bold">À Vista</SelectItem>
                      <SelectItem value="15d" className="text-xs uppercase font-bold">15 Dias</SelectItem>
                      <SelectItem value="30d" className="text-xs uppercase font-bold">30 Dias</SelectItem>
                      <SelectItem value="28/56" className="text-xs uppercase font-bold">28/56 Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Observações Gerais</Label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full h-32 bg-white/5 border border-white/10 p-4 text-xs font-medium rounded-none focus:ring-1 focus:ring-evo-teal focus:outline-none transition-all placeholder:text-white/20"
                    placeholder="Informações sobre frete, impostos ou validade da proposta..."
                  />
                </div>
              </div>
            </Card>

            <div className="bg-evo-bg/40 p-6 border border-dashed border-evo-bg text-center space-y-4">
              <p className="text-[10px] font-bold text-evo-dark opacity-40 uppercase tracking-widest">Resumo Financeiro</p>
              <h4 className="text-3xl font-black text-evo-dark">
                R$ {lines.reduce((sum, l) => sum + (l.UnitPrice * l.Quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h4>
              <p className="text-[9px] font-black text-evo-teal uppercase tracking-widest">Total Líquido da Proposta</p>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-evo-bg p-6 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <div className="max-w-7xl mx-auto flex justify-end">
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || lines.some(l => l.UnitPrice <= 0)}
            className="evo-button-primary h-14 px-16 group shadow-xl"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin w-5 h-5" />
            ) : (
              <>
                <span className="flex items-center gap-3">
                  ENVIAR PROPOSTA COMERCIAL <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SAPConfig {
  url: string;
  user: string;
  password?: string;
  modules?: Record<string, boolean>;
}

export default function App() {
  const [fbUser, fbLoading] = useAuthState(auth);
  const [localSessionUser, setLocalSessionUser] = useState<any>(() => {
    try {
      // Clear any legacy localStorage user to prevent unauthorized auto-login across browser restarts
      localStorage.removeItem('sap_portal_active_user');
      const saved = sessionStorage.getItem('sap_portal_active_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const activeAuthUser = fbUser || localSessionUser;

  const [isSAPLoggedIn, setIsSAPLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [sapUser, setSapUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [portalDocEntry, setPortalDocEntry] = useState<number | null>(null);

  // Inactivity auto-logout (15 minutes of inactivity)
  useEffect(() => {
    if (!activeAuthUser && !isSAPLoggedIn) return;

    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
    let inactivityTimer: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        toast.error('Sessão encerrada por inatividade. Por motivos de segurança, realize o login novamente.', { duration: 7000 });
        handleLogout();
      }, INACTIVITY_LIMIT_MS);
    };

    const trackedEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    trackedEvents.forEach(evt => window.addEventListener(evt, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      trackedEvents.forEach(evt => window.removeEventListener(evt, resetInactivityTimer));
    };
  }, [activeAuthUser, isSAPLoggedIn]);

  // Auth & Sync Logic
  useEffect(() => {
    if (fbUser) {
      syncUserProfile(fbUser);
    } else if (localSessionUser) {
      setUserProfile(localSessionUser);
      if (localSessionUser.sapEmail || localSessionUser.email) {
        setSapUser({
          name: localSessionUser.name || localSessionUser.sapEmail || (localSessionUser.email || '').split('@')[0],
          email: localSessionUser.sapEmail || localSessionUser.email
        });
        setIsSAPLoggedIn(true);
      }
    } else if (!fbLoading) {
      setIsSAPLoggedIn(false);
      setUserProfile(null);
      setSapUser(null);
    }
  }, [fbUser, fbLoading, localSessionUser]);

  const syncUserProfile = async (user: any) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      let profileData: any;
      const normalizedEmail = (user.email || '').toLowerCase().trim();
      const isAdminEmail = normalizedEmail === 'sap.qualitech@qualitechirm.com' || normalizedEmail === 'sapemailb1@gmail.com';

      if (!userSnap.exists()) {
        // Look for existing user profile registered by email (e.g. from Excel load or admin setup)
        const usersCol = collection(db, 'users');
        const qEmail = query(usersCol, where('email', '==', user.email));
        const emailSnap = await getDocs(qEmail);

        if (!emailSnap.empty) {
          const matchedDoc = emailSnap.docs[0];
          const matchedData = matchedDoc.data();

          profileData = {
            ...matchedData,
            uid: user.uid,
            email: user.email,
            role: isAdminEmail ? 'admin' : (matchedData.role || 'user'),
            status: isAdminEmail ? 'approved' : (matchedData.status || 'approved'),
            updatedAt: serverTimestamp()
          };

          await setDoc(userRef, profileData, { merge: true });

          // If the placeholder document had a different key (like email-slug), clean it up
          if (matchedDoc.id !== user.uid) {
            try {
              await deleteDoc(doc(db, 'users', matchedDoc.id));
            } catch (err) {
              console.warn('Old placeholder cleanup skipped:', err);
            }
          }
        } else {
          profileData = {
            uid: user.uid,
            email: user.email,
            role: isAdminEmail ? 'admin' : 'user',
            status: isAdminEmail ? 'approved' : 'pending',
            createdAt: serverTimestamp(),
            sapEmail: isAdminEmail ? 'manager' : '',
            sapCompany: 'SBO_QUALITECH',
            modules: {
              procurement: true,
              salesOrders: true,
              quotations: true,
              negotiations: true,
              approvals: true,
              quality: true,
              maintenance: true,
              calibration: true,
              costs: true
            }
          };
          await setDoc(userRef, profileData);
        }
      } else {
        profileData = userSnap.data();
        if (isAdminEmail && (profileData.role !== 'admin' || profileData.status !== 'approved')) {
          profileData.role = 'admin';
          profileData.status = 'approved';
          await updateDoc(userRef, { role: 'admin', status: 'approved' });
        }
      }
      
      // Auto-heal legacy database name in profile if stored as SBO_QUALITECH or empty
      const normalizedCompany = normalizeSapCompany(profileData.sapCompany);
      if (profileData.sapCompany !== normalizedCompany) {
        profileData.sapCompany = normalizedCompany;
        try {
          await updateDoc(userRef, { sapCompany: normalizedCompany });
        } catch (healErr) {
          console.warn('Profile company auto-heal skipped:', healErr);
        }
      }

      setUserProfile(profileData);
      sessionStorage.setItem('sap_portal_active_user', JSON.stringify(profileData));
      if (profileData.sapCompany) {
        sessionStorage.setItem('sap_portal_company', profileData.sapCompany);
        localStorage.setItem('sap_portal_company', profileData.sapCompany);
      }

      // If approved, set logged in user and ensure SAP session is active
      if (profileData.status === 'approved') {
        setIsSAPLoggedIn(true);
        setSapUser({
          name: profileData.name || (profileData.email || '').split('@')[0],
          email: profileData.sapEmail || profileData.email
        });
        if (profileData.sapEmail && profileData.sapCompany) {
          handleSAPVerification(profileData.sapEmail, profileData.sapCompany);
        }
      }
    } catch (error) {
      console.error('Error syncing profile:', error);
      toast.error('Erro ao sincronizar perfil de usuário.');
    }
  };

  const handleSAPVerification = async (email: string, company: string) => {
    setIsLoading(true);
    try {
      const normalizedCompany = normalizeSapCompany(company);
      const result = await sapService.login(email.trim(), normalizedCompany);
      if (result.success) {
        setSapUser(result.user);
        setIsSAPLoggedIn(true);
      }
    } catch (error: any) {
      console.error('SAP verification failed:', error);
      const isHtml = typeof error.response?.data === 'string' && (error.response.data.includes('<!DOCTYPE') || error.response.data.includes('<html'));
      let errorMessage = error.response?.data?.error;
      let errorDetails = error.response?.data?.details;

      if (!errorMessage) {
        if (error.response?.status === 404 || isHtml) {
          errorMessage = 'Serviço Backend Indisponível (404)';
          errorDetails = 'O endpoint da API /api/login não foi encontrado. Se estiver no Netlify, confirme a publicação das Netlify Functions.';
        } else {
          errorMessage = 'Erro de autenticação';
          errorDetails = error.message || 'Verifique seus dados e tente novamente.';
        }
      }
      const sapRaw = isHtml ? undefined : error.response?.data?.sapRaw;
      const targetDB = error.response?.data?.targetDB;

      toast.error(
        <div className="flex flex-col gap-1 max-w-xs">
          <p className="font-bold text-[10px] uppercase tracking-wider text-red-500">{errorMessage}</p>
          <p className="text-[9px] opacity-80 leading-tight">{errorDetails}</p>
          {targetDB && <p className="text-[8px] font-mono opacity-60">DB: {targetDB}</p>}
          {sapRaw && (
            <div className="mt-2 p-1 bg-black/5 rounded font-mono text-[8px] break-all overflow-hidden max-h-24 overflow-y-auto">
              DEBUG_INFO: {typeof sapRaw === 'string' ? sapRaw : JSON.stringify(sapRaw)}
            </div>
          )}
        </div>,
        { duration: 10000 }
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Detect Portal Route on Mount
  useEffect(() => {
    const defaultComp = 'SBO_QUALITECH';
    const storedComp = localStorage.getItem('sap_portal_company');
    if (!storedComp || storedComp === 'SBO_QUALITECH_QAS' || storedComp === 'QUALITECH' || storedComp === 'SBO_QUALITECH_' || storedComp === 'SBO_QUALITECH_IRML') {
      localStorage.setItem('sap_portal_company', defaultComp);
    }
    const sessionComp = sessionStorage.getItem('sap_portal_company');
    if (!sessionComp || sessionComp === 'SBO_QUALITECH_QAS' || sessionComp === 'QUALITECH' || sessionComp === 'SBO_QUALITECH_' || sessionComp === 'SBO_QUALITECH_IRML') {
      sessionStorage.setItem('sap_portal_company', defaultComp);
    }

    const handleProfileUpdate = (e: any) => {
      if (e.detail) {
        setUserProfile(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('sap_user_profile_updated', handleProfileUpdate);

    const params = new URLSearchParams(window.location.search);
    const portal = params.get('portal');
    const id = params.get('id');
    
    if (portal === 'quotation' && id) {
      setPortalDocEntry(parseInt(id));
      setCurrentView('quotation-portal');
      setIsSAPLoggedIn(true); // Bypass main login for the public portal
    }

    return () => window.removeEventListener('sap_user_profile_updated', handleProfileUpdate);
  }, []);
  const [selectedOrderEntry, setSelectedOrderEntry] = useState<number | null>(null);
  const [selectedRequestEntry, setSelectedRequestEntry] = useState<number | null>(null);
  const [selectedQuotationEntry, setSelectedQuotationEntry] = useState<number | null>(null);
  const [selectedDownPaymentEntry, setSelectedDownPaymentEntry] = useState<number | null>(null);
  const [selectedApprovalCode, setSelectedApprovalCode] = useState<number | null>(null);
  const [isMeasurementsModalOpen, setIsMeasurementsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Login State
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCompany, setLoginCompany] = useState('SBO_QUALITECH');

  // SAP Config State
  const [sapConfig, setSapConfig] = useState<SAPConfig>(() => {
    const saved = localStorage.getItem('sap_portal_config');
    let config = saved ? JSON.parse(saved) : { 
      url: 'https://piqualithse.b1cloud.com.br:50000/b1s/v1', 
      user: 'B1i', 
      password: '1234',
      modules: {}
    };
    
    // Ensure default system credentials if empty
    if (!config.user) config.user = 'B1i';
    if (!config.password) config.password = '1234';
    if (!config.url) config.url = 'https://piqualithse.b1cloud.com.br:50000/b1s/v1';

    // Default modules with migration logic
    const defaultModules: Record<string, boolean> = {
      procurement: true,
      quality: true,
      maintenance: true,
      calibration: true,
      costs: true,
      quotations: true,
      salesOrders: true,
      approvals: true
    };

    // Ensure modules object exists
    if (!config.modules) config.modules = {};
    
    // Merge: keep user choices but ensure new keys (like approvals) are true by default
    const mergedModules = { ...defaultModules };
    Object.keys(config.modules).forEach(key => {
      mergedModules[key] = config.modules[key];
    });
    
    config.modules = mergedModules;
    return config;
  });

  const [isTestingSAP, setIsTestingSAP] = useState(false);
  const [sapTestResult, setSapTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const handleTestSAPConnection = async () => {
    setIsTestingSAP(true);
    setSapTestResult(null);
    try {
      const res = await sapService.testConnection({
        companyDB: loginCompany || userProfile?.sapCompany || 'SBO_QUALITECH',
        user: sapConfig.user || 'B1i',
        password: sapConfig.password || '1234',
        url: sapConfig.url
      });
      setSapTestResult(res);
      toast.success('Conexão com SAP Service Layer validada com sucesso!');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Falha ao testar conexão.';
      setSapTestResult({
        success: false,
        message: errorMsg,
        details: err.response?.data?.details
      });
      toast.error(errorMsg);
    } finally {
      setIsTestingSAP(false);
    }
  };
  // User active modules permission logic (userProfile module configuration takes priority)
  const activeModules = {
    procurement: userProfile?.modules?.procurement ?? sapConfig.modules?.procurement ?? true,
    salesOrders: userProfile?.modules?.salesOrders ?? sapConfig.modules?.salesOrders ?? true,
    quotations: userProfile?.modules?.quotations ?? sapConfig.modules?.quotations ?? true,
    negotiations: userProfile?.modules?.negotiations ?? sapConfig.modules?.negotiations ?? (userProfile?.modules?.quotations ?? true),
    approvals: userProfile?.modules?.approvals ?? sapConfig.modules?.approvals ?? true,
    quality: userProfile?.modules?.quality ?? sapConfig.modules?.quality ?? true,
    maintenance: userProfile?.modules?.maintenance ?? sapConfig.modules?.maintenance ?? true,
    calibration: userProfile?.modules?.calibration ?? sapConfig.modules?.calibration ?? true,
    costs: userProfile?.modules?.costs ?? sapConfig.modules?.costs ?? true,
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const saveSapConfig = () => {
    localStorage.setItem('sap_portal_config', JSON.stringify(sapConfig));
    setIsSettingsOpen(false);
    toast.success('Configurações salvas com sucesso!');
  };

  const handleForgotPassword = async () => {
    const cleanEmail = loginEmail.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error('Informe seu e-mail corporativo para receber as instruções de recuperação.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      toast.success('E-mail de recuperação de senha enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        toast.error('Usuário não localizado no provedor de autenticação.');
      } else {
        toast.error(err.message || 'Erro ao enviar e-mail de recuperação.');
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();
    const targetCompany = loginCompany || sapConfig.company || 'SBO_QUALITECH';

    if (!cleanEmail || !cleanPassword) {
      toast.error('Informe o e-mail e a senha.');
      setIsLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
          toast.success('Conta criada com sucesso! Aguarde aprovação do administrador.');
          setIsRegistering(false);
          return;
        } catch (regErr: any) {
          if (regErr.code === 'auth/email-already-in-use') {
            try {
              await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
              toast.success('Este e-mail já possui cadastro. Login realizado com sucesso!');
              setIsRegistering(false);
              return;
            } catch (authErr: any) {
              toast.error('Este e-mail já possui cadastro no sistema. Faça login com sua senha ou redefina-a.');
              setIsRegistering(false);
              return;
            }
          } else if (regErr.code === 'auth/weak-password') {
            toast.error('A senha deve ter no mínimo 6 caracteres.');
            return;
          } else if (regErr.code === 'auth/invalid-email') {
            toast.error('Formato de e-mail inválido.');
            return;
          } else {
            toast.error(regErr.message || 'Erro ao criar conta.');
            return;
          }
        }
      }

      // 1. Tentar login direto no Firebase Auth
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        toast.success('Login efetuado na plataforma.');
        return;
      } catch (authError: any) {
        console.log('Firebase Auth direto falhou, verificando base de dados Firestore e SAP Service Layer...', authError.code);
        
        // 2. Verificar se o usuário existe na coleção 'users' do Firestore (ex: carga Excel ou pré-cadastro)
        const usersCol = collection(db, 'users');
        const qEmail = query(usersCol, where('email', '==', cleanEmail));
        const emailSnap = await getDocs(qEmail);

        let userRecord: any = null;
        let matchedDocId = '';
        if (!emailSnap.empty) {
          matchedDocId = emailSnap.docs[0].id;
          userRecord = emailSnap.docs[0].data();
        } else {
          // Busca secundária case-insensitive em todos os usuários
          const allUsersSnap = await getDocs(usersCol);
          const matched = allUsersSnap.docs.find(d => {
            const data = d.data();
            return (data.email || '').toLowerCase().trim() === cleanEmail;
          });
          if (matched) {
            matchedDocId = matched.id;
            userRecord = matched.data();
          }
        }

        if (userRecord) {
          const expectedPassword = (userRecord.password || '').trim();

          // Se há senha cadastrada no banco, valida com a digitada
          if (expectedPassword && expectedPassword !== cleanPassword) {
            toast.error('Senha incorreta para este usuário.');
            return;
          }

          // Senha válida! Sincroniza conta no Firebase Auth em background (se possível)
          try {
            await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              try {
                await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
              } catch {}
            }
          }

          const activeProfile = {
            ...userRecord,
            id: matchedDocId || cleanEmail,
            email: cleanEmail,
            role: userRecord.role || ((cleanEmail.includes('admin') || cleanEmail.includes('sapemailb1')) ? 'admin' : 'user'),
            status: userRecord.status || 'approved',
            modules: userRecord.modules || {
              procurement: true, salesOrders: true, quotations: true, negotiations: true, approvals: true, quality: true, maintenance: true, calibration: true, costs: true
            }
          };

          setLocalSessionUser({ email: cleanEmail, uid: matchedDocId || cleanEmail });
          setUserProfile(activeProfile);
          sessionStorage.setItem('sap_portal_active_user', JSON.stringify(activeProfile));
          localStorage.removeItem('sap_portal_active_user');
          if (activeProfile.sapCompany) {
            sessionStorage.setItem('sap_portal_company', activeProfile.sapCompany);
          }

          // Executa verificação do usuário na base SAP usando o usuário de serviço B1i
          const sapTargetUser = userRecord.sapEmail || cleanEmail;
          const sapTargetCompany = userRecord.sapCompany || targetCompany;

          try {
            const sapResult = await sapService.login(sapTargetUser, sapTargetCompany);
            if (sapResult.success) {
              setSapUser(sapResult.user);
              setIsSAPLoggedIn(true);
              toast.success(`Usuário validado no SAP (${sapResult.user.name || sapTargetUser})!`);
            } else {
              setSapUser({ name: cleanEmail.split('@')[0], email: sapTargetUser });
              setIsSAPLoggedIn(true);
              toast.success('Acesso ao portal liberado com sucesso!');
            }
          } catch (sapErr) {
            console.warn('Verificação SAP automática falhou, liberando acesso:', sapErr);
            setSapUser({ name: cleanEmail.split('@')[0], email: sapTargetUser });
            setIsSAPLoggedIn(true);
            toast.success('Acesso ao portal liberado com sucesso!');
          }
          return;
        }

        // 3. Se NÃO foi encontrado no Firestore: consulta diretamente no SAP Service Layer via usuário de serviço B1i
        try {
          toast.loading('Consultando usuário na base do SAP Service Layer (B1i)...', { id: 'sap-direct-search' });
          const directSapRes = await sapService.login(cleanEmail, targetCompany);
          toast.dismiss('sap-direct-search');

          if (directSapRes.success) {
            const sapUserFound = directSapRes.user;
            const newUserData = {
              email: cleanEmail,
              password: cleanPassword,
              name: sapUserFound.name,
              sapEmail: cleanEmail,
              sapCompany: targetCompany,
              role: (cleanEmail.includes('admin') || cleanEmail.includes('sapemailb1')) ? 'admin' : 'user',
              status: 'approved',
              modules: {
                procurement: true, salesOrders: true, quotations: true, negotiations: true, approvals: true, quality: true, maintenance: true, calibration: true, costs: true
              },
              createdAt: serverTimestamp()
            };

            const targetDocRef = doc(db, 'users', cleanEmail.replace(/[^a-z0-9@_.-]/g, '_'));
            await setDoc(targetDocRef, newUserData, { merge: true });

            // Tenta criar/sincronizar no Firebase Auth
            try {
              await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            } catch (err: any) {
              if (err.code === 'auth/email-already-in-use') {
                try { await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword); } catch {}
              }
            }

            setLocalSessionUser({ email: cleanEmail, uid: cleanEmail });
            setUserProfile(newUserData);
            sessionStorage.setItem('sap_portal_active_user', JSON.stringify(newUserData));
            localStorage.removeItem('sap_portal_active_user');
            setSapUser(sapUserFound);
            setIsSAPLoggedIn(true);
            toast.success(`Usuário ${sapUserFound.name} localizado no SAP B1 e acesso liberado!`);
            return;
          }
        } catch (sapDirectErr: any) {
          toast.dismiss('sap-direct-search');
          console.warn('Consulta direta ao SAP não localizou o usuário:', sapDirectErr);
        }

        if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential' || authError.code === 'auth/invalid-login-credentials' || authError.code === 'auth/wrong-password') {
          toast.error('Usuário não encontrado na base de usuários ou no SAP B1. Verifique o e-mail e senha digitados.');
        } else {
          toast.error(authError.message || 'Erro de autenticação.');
        }
      }
    } catch (error: any) {
      console.error('Erro de login:', error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Este e-mail já está cadastrado no sistema.');
      } else {
        toast.error(error.message || 'Erro de autenticação.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    sessionStorage.removeItem('sap_portal_active_user');
    sessionStorage.removeItem('sap_portal_company');
    localStorage.removeItem('sap_portal_active_user');
    setLocalSessionUser(null);
    setIsSAPLoggedIn(false);
    setSapUser(null);
    setUserProfile(null);
    setCurrentView('dashboard');
    setSelectedOrderEntry(null);
    setSelectedRequestEntry(null);
    setSelectedQuotationEntry(null);
    setSelectedDownPaymentEntry(null);
    setSelectedApprovalCode(null);
    toast.success('Sessão encerrada com sucesso.');
  };

  const handleViewDetails = (docEntry: number, type: string = 'order') => {
    if (type === 'order') {
      setSelectedOrderEntry(docEntry);
      setCurrentView('list-orders');
    } else if (type === 'request') {
      setSelectedRequestEntry(docEntry);
      setCurrentView('list-requests');
    } else if (type === 'quotation' || type === 'purchase-quotation') {
      setSelectedQuotationEntry(docEntry);
      setCurrentView('list-quotations');
    } else if (type === 'sales-quotation' || type === 'sales_quotation') {
      setSelectedQuotationEntry(docEntry);
      setCurrentView('quotations');
    } else if (type === 'sales-order') {
      setCurrentView('sales-orders');
    } else if (type === 'down-payment') {
      setSelectedDownPaymentEntry(docEntry);
      setCurrentView('list-down-payments');
    } else if (type === 'approval') {
      setCurrentView('approvals');
    }
  };

  const handleViewRequestDetails = (docEntry: number) => {
    setSelectedRequestEntry(docEntry);
    setCurrentView('list-requests');
  };

  const handleViewQuotationDetails = (docEntry: number) => {
    setSelectedQuotationEntry(docEntry);
    setCurrentView('list-quotations');
  };

  const handleViewDownPaymentDetails = (docEntry: number) => {
    setSelectedDownPaymentEntry(docEntry);
    setCurrentView('list-down-payments');
  };

  // Handle Portal View
  if (currentView === 'quotation-portal' && portalDocEntry) {
    return <SupplierPortalView docEntry={portalDocEntry} />;
  }

  if (fbLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-evo-bg"><Loader2 className="animate-spin text-evo-teal w-12 h-12" /></div>;
  }

  if (!activeAuthUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-evo-bg p-4 relative overflow-hidden font-sans">
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-evo-dark skew-x-[-15deg] translate-x-1/3 hidden lg:block" />
        
        {/* Version in bottom left corner */}
        <div className="absolute bottom-4 left-4 z-20 text-[10px] font-mono font-bold text-evo-dark/40 tracking-wider">
          {APP_VERSION_TAG}
        </div>
        
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="mb-8 flex flex-col items-center lg:items-start">
            <div className="mb-4">
              <Logo size="xl" />
            </div>
            <h1 className="text-4xl font-bold tracking-tighter text-evo-dark uppercase">QUALITECH</h1>
            <p className="text-xs uppercase tracking-[0.4em] font-bold text-evo-teal">Procurement Service Portal</p>
          </div>

          <Card className="shadow-2xl border-none overflow-hidden">
            <div className="h-1 bg-evo-teal w-full" />
            <CardHeader>
              <CardTitle className="text-xl font-bold text-evo-dark uppercase tracking-tight">
                {isRegistering ? 'Criar Nova Conta' : 'Autenticação'}
              </CardTitle>
              <CardDescription className="text-xs uppercase tracking-widest font-medium opacity-60">
                {isRegistering ? 'Registre-se para solicitar acesso' : 'Acesse o portal de serviços'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/60 ml-1">E-mail Corporativo</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="usuario@empresa.com" 
                    className="h-12 border-evo-bg bg-evo-bg/50 focus:bg-white transition-all text-sm rounded-none"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="pass" className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/60 ml-1">Senha de Acesso</Label>
                    {!isRegistering && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[9px] font-bold uppercase tracking-wider text-evo-teal hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <Input 
                    id="pass" 
                    type="password"
                    placeholder="••••••••" 
                    className="h-12 border-evo-bg bg-evo-bg/50 focus:bg-white transition-all text-sm rounded-none"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-evo-teal hover:bg-evo-teal-dark text-white font-bold uppercase tracking-widest text-xs transition-all shadow-lg rounded-none" 
                  disabled={isLoading}
                >
                  {isLoading ? 'Processando...' : isRegistering ? 'Registrar Agora' : 'Acessar Sistema'}
                </Button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-evo-bg" /></div>
                  <div className="relative flex justify-center text-[8px] uppercase font-black"><span className="bg-white px-3 text-evo-dark/20 tracking-widest">Ou continue com</span></div>
                </div>

                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => signInWithGoogle().catch(e => toast.error(e.message))}
                  className="w-full h-12 border-evo-bg rounded-none text-xs font-bold uppercase tracking-widest gap-3"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94L5.84 14.1z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Google Account
                </Button>

                <p className="text-center">
                  <button 
                    type="button"
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-[10px] font-bold uppercase tracking-widest text-evo-teal hover:underline"
                  >
                    {isRegistering ? 'Já tenho uma conta? Entrar' : 'Não tem conta? Solicite acesso'}
                  </button>
                </p>
              </form>
            </CardContent>
          </Card>
        </motion.div>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (userProfile && userProfile.status === 'pending') {
    const currentEmail = userProfile?.email || activeAuthUser?.email || '';
    const userInitial = (currentEmail || 'U').charAt(0).toUpperCase();

    return (
      <div className="min-h-screen bg-evo-bg flex flex-col font-sans relative w-full max-w-full overflow-x-hidden">
        {/* Top Header */}
        <header className="w-full bg-[#1b2a4e] text-white flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50 shadow-md h-16 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Logo size="md" className="bg-white text-evo-teal shadow-none" />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-xl tracking-tighter text-white">QUALITECH</span>
              <span className="text-[8px] uppercase tracking-[0.2em] font-medium opacity-70 text-white">Central de Serviços</span>
            </div>
          </div>

          {/* User Profile + Logout Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-white/10 px-2.5 sm:px-3 py-1.5 rounded-lg border border-white/10 text-white">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-inner uppercase shrink-0">
                {userInitial}
              </div>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-xs font-bold truncate max-w-[140px] sm:max-w-[200px] text-white">
                  {currentEmail}
                </span>
                <span className="text-[9px] uppercase tracking-tight text-amber-300 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Aguardando Aprovação
                </span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded shadow-md border border-red-500/50 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Sair da Conta (Logout)"
            >
              <LogOut className="w-4 h-4 text-white" />
              <span className="inline font-bold">Sair</span>
            </button>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-evo-dark skew-x-[-15deg] translate-x-1/3 hidden lg:block" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md relative z-10 my-8"
          >
            <div className="mb-6 flex flex-col items-center">
              <div className="mb-3">
                <Logo size="xl" />
              </div>
              <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">QUALITECH</h1>
              <p className="text-xs uppercase tracking-[0.3em] font-bold text-amber-500">Acesso Pendente de Aprovação</p>
            </div>

            <Card className="shadow-2xl border-none overflow-hidden text-center">
              <div className="h-1.5 w-full bg-amber-500" />
              <CardContent className="space-y-6 py-8 px-6">
                <div className="bg-amber-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-200">
                  <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase text-evo-dark tracking-tight">Cadastro em Análise</h3>
                  <p className="text-xs text-gray-500 font-medium mt-2 px-4 leading-relaxed">
                    Seu cadastro foi registrado com sucesso para <span className="font-bold text-evo-dark">{currentEmail}</span>. Um administrador irá aprovar seu perfil e liberar seus módulos de acesso ao sistema em breve.
                  </p>
                </div>
                <div className="pt-2">
                  <Button variant="outline" onClick={handleLogout} className="rounded-none border-evo-bg uppercase text-[10px] font-black tracking-widest px-8">
                    Trocar de Conta / Sair
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        <Toaster position="top-right" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-evo-bg flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      {/* Evo Style Header */}
      <header className="w-full bg-[#1b2a4e] text-white flex items-center justify-between px-3 sm:px-6 sticky top-0 z-50 shadow-md h-16 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0 overflow-hidden">
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-white hover:bg-white/10 shrink-0" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Menu de Navegação"
          >
            <Menu className="w-6 h-6" />
          </Button>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Logo size="md" className="bg-white text-evo-teal shadow-none" />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-lg sm:text-xl tracking-tighter text-white">QUALITECH</span>
              <span className="text-[7px] sm:text-[8px] uppercase tracking-[0.2em] font-medium opacity-70 text-white">Procurement Service</span>
            </div>
          </div>

          <nav className="hidden xl:flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap ml-2">
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`evo-nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
            >
              Dashboard
            </button>
            {activeModules.procurement && (
              <button 
                onClick={() => setCurrentView('create-order')}
                className={`evo-nav-link ${(currentView === 'create-order' || currentView === 'create-request' || currentView === 'create-quotation' || currentView === 'create-down-payment') ? 'active' : ''}`}
              >
                Ações
              </button>
            )}
            {activeModules.procurement && (
              <button 
                onClick={() => setCurrentView('list-orders')}
                className={`evo-nav-link ${(currentView === 'list-orders' || currentView === 'list-requests' || currentView === 'list-quotations' || currentView === 'list-down-payments') ? 'active' : ''}`}
              >
                Consultas
              </button>
            )}
            {activeModules.approvals && (
              <button 
                onClick={() => setCurrentView('approvals')}
                className={`evo-nav-link ${currentView === 'approvals' ? 'active' : ''}`}
              >
                Aprovações
              </button>
            )}
            {activeModules.negotiations && (
              <button 
                onClick={() => setCurrentView('list-quotations')}
                className={`evo-nav-link ${currentView === 'list-quotations' ? 'active' : ''}`}
              >
                Negociações
              </button>
            )}
            {activeModules.quality && (
              <button 
                onClick={() => setCurrentView('quality')}
                className={`evo-nav-link ${currentView === 'quality' ? 'active' : ''}`}
              >
                Qualidade
              </button>
            )}
            {activeModules.maintenance && (
              <button 
                onClick={() => setCurrentView('maintenance')}
                className={`evo-nav-link ${currentView === 'maintenance' ? 'active' : ''}`}
              >
                Manutenção
              </button>
            )}
            {activeModules.calibration && (
              <button 
                onClick={() => setCurrentView('calibration')}
                className={`evo-nav-link ${currentView === 'calibration' ? 'active' : ''}`}
              >
                Calibração
              </button>
            )}
            {activeModules.costs && (
              <button 
                onClick={() => setCurrentView('costs')}
                className={`evo-nav-link ${currentView === 'costs' ? 'active' : ''}`}
              >
                Receitas
              </button>
            )}
            <button 
              onClick={() => setIsMeasurementsModalOpen(true)}
              className="evo-nav-link text-evo-teal font-black flex items-center gap-1.5"
            >
              <Ruler className="w-3.5 h-3.5" />
              Medições
            </button>
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setCurrentView('users')}
                className={`evo-nav-link ${currentView === 'users' ? 'active' : ''}`}
              >
                Administração
              </button>
            )}
          </nav>
        </div>
        
        {/* User Profile + Red Logout Button in Extreme Top Right Corner */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* User Profile */}
          <div className="flex items-center gap-2 bg-white/10 hover:bg-white/15 px-2.5 sm:px-3 py-1.5 rounded-lg border border-white/15 transition-all text-white max-w-[200px] sm:max-w-[280px]">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-evo-teal text-white flex items-center justify-center font-bold text-xs shadow-inner uppercase shrink-0">
              {(userProfile?.email || activeAuthUser?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col text-left leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold truncate text-white">
                  {userProfile?.email || activeAuthUser?.email || sapUser?.name}
                </span>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0 ${userProfile?.role === 'admin' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'bg-evo-teal/30 text-teal-200 border border-teal-500/30'}`}>
                  {userProfile?.role === 'admin' ? 'Admin' : 'Usuário'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-white/70">
                <span className="bg-white/10 text-emerald-300 text-[8px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider font-bold truncate max-w-[120px]" title={`Base SAP vinculada: ${userProfile?.sapCompany || 'SBO_QUALITECH'}`}>
                  {userProfile?.sapCompany || 'SBO_QUALITECH'}
                </span>
                {userProfile?.sector && (
                  <span className="truncate max-w-[80px] sm:max-w-[100px] text-teal-300 font-medium">
                    {userProfile.sector}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSAPLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-[9px] uppercase tracking-tight text-emerald-300 font-semibold truncate">
                    {sapUser?.name ? `SAP: ${sapUser.name}` : (isSAPLoggedIn ? 'Portal Ativo' : 'Pendente')}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Settings Button */}
          <button 
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded border border-white/15 transition-all cursor-pointer shrink-0"
            title="Configurações e Diagnóstico do SAP"
          >
            <Settings className="w-4 h-4 text-white" />
          </button>

          {/* Prominent Red Logout Button on Corner */}
          <button 
            type="button"
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded shadow-md border border-red-500/50 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            title="Sair da Conta (Logout)"
          >
            <LogOut className="w-4 h-4 text-white" />
            <span className="inline font-bold">Sair</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Evo Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'w-64' : 'w-0 lg:w-16'} 
          transition-all duration-300 bg-evo-dark text-white/70 flex flex-col overflow-hidden
          fixed lg:relative z-40 h-[calc(100vh-4rem)] lg:h-auto border-r border-white/5 shadow-2xl lg:shadow-none
        `}>
          <nav className="flex-1 py-6">
            <SidebarItem 
              icon={<LayoutDashboard />} 
              label="Visão Geral" 
              active={currentView === 'dashboard'} 
              expanded={sidebarOpen}
              onClick={() => {
                setCurrentView('dashboard');
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
            />
            
            {activeModules.procurement && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Compras</div>
                <SidebarItem 
                  icon={<Plus />} 
                  label="Pedido de Compra" 
                  active={currentView === 'create-order'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('create-order');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                <SidebarItem 
                  icon={<Search />} 
                  label="Listar Pedidos" 
                  active={currentView === 'list-orders'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setSelectedOrderEntry(null);
                    setCurrentView('list-orders');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Solicitações</div>
                <SidebarItem 
                  icon={<Plus />} 
                  label="Nova Solicitação" 
                  active={currentView === 'create-request'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('create-request');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                <SidebarItem 
                  icon={<Search />} 
                  label="Listar Solicitações" 
                  active={currentView === 'list-requests'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setSelectedRequestEntry(null); // Clear selection when going to list
                    setCurrentView('list-requests');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
              </>
            )}

            {activeModules.approvals && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Aprovações</div>
                <SidebarItem 
                  icon={<CheckSquare />} 
                  label="Minhas Aprovações" 
                  active={currentView === 'approvals'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('approvals');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
              </>
            )}

            {activeModules.negotiations && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Negociações</div>
                <SidebarItem 
                  icon={<Plus />} 
                  label="Nova Oferta" 
                  active={currentView === 'create-quotation'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('create-quotation');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                <SidebarItem 
                  icon={<Search />} 
                  label="Listar Ofertas" 
                  active={currentView === 'list-quotations'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setSelectedQuotationEntry(null);
                    setCurrentView('list-quotations');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                <SidebarItem 
                  icon={<Calculator />} 
                  label="Mapa Comparativo (BID)" 
                  active={currentView === 'bid-map'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('bid-map');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
              </>
            )}

            {(activeModules.quality || activeModules.maintenance || activeModules.calibration) && (
              <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Indústria & Qualidade</div>
            )}
            
            {activeModules.quality && (
              <SidebarItem 
                icon={<CheckCircle />} 
                label="Qualidade (QLDADE)" 
                active={currentView === 'quality'} 
                expanded={sidebarOpen}
                onClick={() => {
                  setCurrentView('quality');
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
              />
            )}
            
            {activeModules.maintenance && (
              <SidebarItem 
                icon={<Settings />} 
                label="Manutenção (CAB)" 
                active={currentView === 'maintenance'} 
                expanded={sidebarOpen}
                onClick={() => {
                  setCurrentView('maintenance');
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
              />
            )}

            {activeModules.calibration && (
              <SidebarItem 
                icon={<Clock />} 
                label="Calibração" 
                active={currentView === 'calibration'} 
                expanded={sidebarOpen}
                onClick={() => {
                  setCurrentView('calibration');
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
              />
            )}

            {(activeModules.costs || activeModules.quotations || activeModules.salesOrders) && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Gestão</div>
                {activeModules.costs && (
                  <SidebarItem 
                    icon={<FileText />} 
                    label="Controle de Receitas" 
                    active={currentView === 'costs'} 
                    expanded={sidebarOpen}
                    onClick={() => {
                      setCurrentView('costs');
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                  />
                )}
                {activeModules.quotations && (
                  <SidebarItem 
                    icon={<FileText />} 
                    label="Cotações" 
                    active={currentView === 'quotations'} 
                    expanded={sidebarOpen}
                    onClick={() => {
                      setCurrentView('quotations');
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                  />
                )}
                <SidebarItem 
                  icon={<Ruler />} 
                  label="Resumo de Medições" 
                  active={false} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setIsMeasurementsModalOpen(true);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                {activeModules.salesOrders && (
                  <SidebarItem 
                    icon={<ShoppingCart />} 
                    label="Pedido de Venda" 
                    active={currentView === 'sales-orders'} 
                    expanded={sidebarOpen}
                    onClick={() => {
                      setCurrentView('sales-orders');
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                  />
                )}
              </>
            )}

            {activeModules.procurement && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Financeiro</div>
                <SidebarItem 
                  icon={<Plus />} 
                  label="Novo Adiantamento" 
                  active={currentView === 'create-down-payment'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('create-down-payment');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
                <SidebarItem 
                  icon={<Search />} 
                  label="Lista Adiantamentos" 
                  active={currentView === 'list-down-payments'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setSelectedDownPaymentEntry(null);
                    setCurrentView('list-down-payments');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
              </>
            )}

            {userProfile?.role === 'admin' && (
              <>
                <div className="mt-4 px-6 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Administração</div>
                <SidebarItem 
                  icon={<Settings />} 
                  label="Usuários & Acessos" 
                  active={currentView === 'users'} 
                  expanded={sidebarOpen}
                  onClick={() => {
                    setCurrentView('users');
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                />
              </>
            )}
          </nav>
          
          <div className="p-3 border-t border-white/10 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
              title="Encerrar Sessão / Sair"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Sair da Conta</span>}
            </button>
            <div className="px-2 flex flex-col gap-0.5 text-left">
              <div className="text-[9px] uppercase tracking-widest text-white/30 font-bold truncate">
                {sidebarOpen ? 'SAP Business One' : 'B1'}
              </div>
              <div className="text-[10px] font-mono font-bold text-white/50 tracking-wider">
                {APP_VERSION_TAG}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <DashboardView 
                key="dashboard" 
                onViewDetails={handleViewDetails} 
                activeModules={activeModules}
                onOpenMeasurements={() => setIsMeasurementsModalOpen(true)}
              />
            )}
            {currentView === 'create-order' && (
              <CreateOrderView 
                key="create" 
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'list-orders' && (
              <ListOrdersView 
                key="list" 
                selectedDocEntry={selectedOrderEntry} 
                onBack={() => setSelectedOrderEntry(null)}
                onViewDetails={handleViewDetails}
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'create-request' && (
              <CreateOrderView 
                key="create-request" 
                title="Nova Solicitação de Compra" 
                onSubmit={sapService.createPurchaseRequest} 
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'list-requests' && (
              <ListOrdersView 
                key="list-requests" 
                title="Solicitações de Compra"
                fetchOrders={sapService.getPurchaseRequests}
                fetchOrderDetail={sapService.getPurchaseRequest}
                selectedDocEntry={selectedRequestEntry} 
                onBack={() => setSelectedRequestEntry(null)}
                onViewDetails={handleViewRequestDetails}
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'create-quotation' && (
              <CreateOrderView 
                key="create-quotation" 
                title="Nova Cotação de Compra" 
                onSubmit={sapService.createPurchaseQuotation} 
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'list-quotations' && (
              <ListOrdersView 
                key="list-quotations" 
                title="Cotações de Compra"
                fetchOrders={sapService.getPurchaseQuotations}
                fetchOrderDetail={sapService.getPurchaseQuotation}
                selectedDocEntry={selectedQuotationEntry} 
                onBack={() => setSelectedQuotationEntry(null)}
                onViewDetails={handleViewQuotationDetails}
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'bid-map' && (
              <BidComparativeView 
                key="bid-map" 
                userEmail={sapUser?.email} 
              />
            )}
            {currentView === 'create-down-payment' && (
              <CreateOrderView 
                key="create-down-payment" 
                title="Novo Adiantamento a Fornecedor" 
                onSubmit={sapService.createPurchaseDownPayment} 
                userEmail={sapUser?.email}
                allowAttachments={true}
              />
            )}
            {currentView === 'list-down-payments' && (
              <ListOrdersView 
                key="list-down-payments" 
                title="Adiantamentos a Fornecedores"
                fetchOrders={sapService.getPurchaseDownPayments}
                fetchOrderDetail={sapService.getPurchaseDownPayment}
                selectedDocEntry={selectedDownPaymentEntry} 
                onBack={() => setSelectedDownPaymentEntry(null)}
                onViewDetails={handleViewDownPaymentDetails}
                userEmail={sapUser?.email}
              />
            )}
            {currentView === 'approvals' && (
              <ApprovalsView key="approvals" />
            )}
            {currentView === 'quality' && (
              <QualityView key="quality" />
            )}
            {currentView === 'maintenance' && (
              <MaintenanceView key="maintenance" />
            )}
            {currentView === 'costs' && (
              <CostsView key="costs" />
            )}
            {currentView === 'quotations' && (
              <QuotationsView 
                key="quotations" 
                initialDocEntry={selectedQuotationEntry}
                onClearSelection={() => setSelectedQuotationEntry(null)}
                onOpenMeasurements={() => setIsMeasurementsModalOpen(true)}
              />
            )}
            {currentView === 'sales-orders' && (
              <SalesOrdersView 
                key="sales-orders" 
                userEmail={userProfile?.email || activeAuthUser?.email || ''} 
              />
            )}
            {currentView === 'calibration' && (
              <CalibrationView key="calibration" />
            )}
            {currentView === 'users' && userProfile?.role === 'admin' && (
              <UserManagementView key="users" />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Global Measurements Summary Modal */}
      <MeasurementsSummaryModal 
        isOpen={isMeasurementsModalOpen}
        onClose={() => setIsMeasurementsModalOpen(false)}
        onSelectQuotation={(docEntry) => {
          setSelectedQuotationEntry(docEntry);
          setCurrentView('quotations');
        }}
      />

      {/* SAP Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white border border-evo-bg rounded-none p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wider text-evo-dark flex items-center gap-2">
              <Settings className="w-5 h-5 text-evo-teal" />
              Configurações do SAP Service Layer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">URL do Service Layer</Label>
              <Input 
                value={sapConfig.url} 
                onChange={(e) => setSapConfig({ ...sapConfig, url: e.target.value })}
                placeholder="https://piqualithse.b1cloud.com.br:50000/b1s/v1"
                className="rounded-none border-evo-bg text-xs font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Usuário Técnico</Label>
                <Input 
                  value={sapConfig.user} 
                  onChange={(e) => setSapConfig({ ...sapConfig, user: e.target.value })}
                  placeholder="B1i"
                  className="rounded-none border-evo-bg text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Senha Técnica</Label>
                <Input 
                  type="password"
                  value={sapConfig.password} 
                  onChange={(e) => setSapConfig({ ...sapConfig, password: e.target.value })}
                  placeholder="••••••••"
                  className="rounded-none border-evo-bg text-xs font-bold"
                />
              </div>
            </div>
            <div className="p-3 bg-evo-bg/40 border border-evo-bg text-[11px] text-evo-dark/70 space-y-1">
              <div className="font-bold text-evo-dark">Base SAP Vinculada ao seu Perfil:</div>
              <div className="font-mono font-bold text-evo-teal">{userProfile?.sapCompany || 'SBO_QUALITECH'}</div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)} className="rounded-none text-xs font-bold uppercase">
              Cancelar
            </Button>
            <Button onClick={saveSapConfig} className="rounded-none bg-evo-teal hover:bg-evo-teal-dark text-white text-xs font-bold uppercase">
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" />
    </div>
  );
}

function SidebarItem({ icon, label, active, expanded, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 px-6 py-3 transition-all duration-200 border-l-4
        ${active 
          ? 'bg-white/5 text-white border-evo-teal' 
          : 'border-transparent hover:bg-white/5 hover:text-white'}
      `}
    >
      <span className={`shrink-0 transition-colors ${active ? 'text-evo-teal' : ''}`}>{React.cloneElement(icon, { size: 18 })}</span>
      {expanded && <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">{label}</span>}
    </button>
  );
}

function DashboardView({ 
  onViewDetails, 
  activeModules = {},
  onOpenMeasurements 
}: { 
  key?: string; 
  onViewDetails: (id: number, type: string) => void; 
  activeModules?: any;
  onOpenMeasurements?: () => void;
}) {
  const [stats, setStats] = useState<any>({
    orders: [],
    requests: [],
    quotations: [],
    downpayments: [],
    approvals: [],
    salesOrders: [],
    salesQuotations: [],
    personnelCosts: [],
    rentalCosts: [],
    quality: [],
    maintenance: [],
    calibration: []
  });
  const [isLoading, setIsLoading] = useState(true);

  const hasProcurement = activeModules.procurement !== false;
  const hasSalesOrders = activeModules.salesOrders !== false;
  const hasNegotiations = activeModules.negotiations !== false || activeModules.quotations !== false;
  const hasApprovals = activeModules.approvals !== false;
  const hasCosts = activeModules.costs !== false;
  const hasQuality = activeModules.quality !== false;
  const hasMaintenance = activeModules.maintenance !== false;
  const hasCalibration = activeModules.calibration !== false;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const ordersPromise = hasProcurement
          ? sapService.getPurchaseOrders().then(res => (res || []).map((r: any) => ({ ...r, _type: 'order' }))).catch(() => [])
          : Promise.resolve([]);

        const requestsPromise = hasProcurement
          ? sapService.getPurchaseRequests().then(res => (res || []).map((r: any) => ({ ...r, _type: 'request' }))).catch(() => [])
          : Promise.resolve([]);

        const quotationsPromise = hasNegotiations
          ? sapService.getPurchaseQuotations().then(res => (res || []).map((r: any) => ({ ...r, _type: 'quotation' }))).catch(() => [])
          : Promise.resolve([]);

        const downpaymentsPromise = hasProcurement
          ? sapService.getPurchaseDownPayments().then(res => (res || []).map((r: any) => ({ ...r, _type: 'down-payment' }))).catch(() => [])
          : Promise.resolve([]);

        const approvalsPromise = hasApprovals
          ? sapService.getApprovalRequests().then(res => (res || []).map((r: any) => ({ ...r, _type: 'approval' }))).catch(() => [])
          : Promise.resolve([]);

        const salesOrdersPromise = hasSalesOrders
          ? sapService.getOrders().then(res => (res || []).map((r: any) => ({ ...r, _type: 'sales-order' }))).catch(() => [])
          : Promise.resolve([]);

        const salesQuotationsPromise = hasNegotiations
          ? sapService.getQuotations().then(res => (res || []).map((r: any) => ({ ...r, _type: 'sales-quotation' }))).catch(() => [])
          : Promise.resolve([]);

        const personnelCostsPromise = hasCosts
          ? sapService.getPersonnelCosts().then(res => (res || []).map((r: any) => ({ ...r, _type: 'personnel-cost' }))).catch(() => [])
          : Promise.resolve([]);

        const rentalCostsPromise = hasCosts
          ? sapService.getRentalCosts().then(res => (res || []).map((r: any) => ({ ...r, _type: 'rental-cost' }))).catch(() => [])
          : Promise.resolve([]);

        const qualityPromise = hasQuality
          ? sapService.getQualityRecords().then(res => (res || []).map((r: any) => ({ ...r, _type: 'quality' }))).catch(() => [])
          : Promise.resolve([]);

        const maintenancePromise = hasMaintenance
          ? sapService.getMaintenanceRecords().then(res => (res || []).map((r: any) => ({ ...r, _type: 'maintenance' }))).catch(() => [])
          : Promise.resolve([]);

        const calibrationPromise = hasCalibration
          ? sapService.getCalibrationRecords().then(res => (res || []).map((r: any) => ({ ...r, _type: 'calibration' }))).catch(() => [])
          : Promise.resolve([]);

        const [
          orders,
          requests,
          quotations,
          downpayments,
          approvals,
          salesOrders,
          salesQuotations,
          personnelCosts,
          rentalCosts,
          quality,
          maintenance,
          calibration
        ] = await Promise.all([
          ordersPromise,
          requestsPromise,
          quotationsPromise,
          downpaymentsPromise,
          approvalsPromise,
          salesOrdersPromise,
          salesQuotationsPromise,
          personnelCostsPromise,
          rentalCostsPromise,
          qualityPromise,
          maintenancePromise,
          calibrationPromise
        ]);

        setStats({
          orders,
          requests,
          quotations,
          downpayments,
          approvals,
          salesOrders,
          salesQuotations,
          personnelCosts,
          rentalCosts,
          quality,
          maintenance,
          calibration
        });
      } catch (error) {
        toast.error('Erro ao carregar estatísticas do dashboard.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, [hasProcurement, hasSalesOrders, hasNegotiations, hasApprovals, hasCosts, hasQuality, hasMaintenance, hasCalibration]);

  // Financial calculations
  const totalPurchaseOrdersValue = stats.orders.reduce((acc: number, curr: any) => acc + (Number(curr.DocTotal) || 0), 0);
  const totalSalesOrdersValue = stats.salesOrders.reduce((acc: number, curr: any) => acc + (Number(curr.DocTotal) || 0), 0);
  const totalSalesQuotationsValue = stats.salesQuotations.reduce((acc: number, curr: any) => acc + (Number(curr.DocTotal) || 0), 0);
  
  const totalPersonnelCosts = stats.personnelCosts.reduce((acc: number, c: any) => 
    acc + (Number(c.U_ValorTotal || c.U_TotalCost || c.DocTotal || c.U_SalarioBase) || 0), 0
  );
  const totalRentalCosts = stats.rentalCosts.reduce((acc: number, c: any) => 
    acc + (Number(c.U_ValorTotal || c.U_TotalCost || c.DocTotal || c.U_ValorAluguel) || 0), 0
  );

  const openOrders = stats.orders.filter((o: any) => o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O').length;
  const openQuotations = stats.quotations.filter((o: any) => o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O').length;
  const openRequests = stats.requests.filter((o: any) => o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O').length;
  const pendingApprovals = stats.approvals.filter((a: any) => a.Status === 'W' || a.Status === 'ardPending').length;

  const chartData = [
    hasCosts ? { name: 'Custos Pessoal', value: Math.round(totalPersonnelCosts), color: '#00D1FF' } : null,
    hasCosts ? { name: 'Custos Locação', value: Math.round(totalRentalCosts), color: '#3b82f6' } : null,
    hasSalesOrders ? { name: 'Ped. Venda', value: Math.round(totalSalesOrdersValue), color: '#10b981' } : null,
    hasNegotiations ? { name: 'Cotações', value: Math.round(totalSalesQuotationsValue), color: '#f59e0b' } : null,
    hasProcurement ? { name: 'Ped. Compra', value: Math.round(totalPurchaseOrdersValue), color: '#8b5cf6' } : null,
  ].filter(Boolean) as { name: string; value: number; color: string }[];

  const allowedActivityArrays = [
    ...(hasProcurement ? [stats.orders, stats.requests, stats.downpayments] : []),
    ...(hasNegotiations ? [stats.quotations, stats.salesQuotations] : []),
    ...(hasSalesOrders ? [stats.salesOrders] : []),
    ...(hasCosts ? [stats.personnelCosts, stats.rentalCosts] : []),
    ...(hasApprovals ? [stats.approvals] : []),
    ...(hasQuality ? [stats.quality] : []),
    ...(hasMaintenance ? [stats.maintenance] : []),
    ...(hasCalibration ? [stats.calibration] : [])
  ];

  const recentActivity = allowedActivityArrays.flat()
    .sort((a, b) => new Date(b.DocDate || b.CreationDate || 0).getTime() - new Date(a.DocDate || a.CreationDate || 0).getTime())
    .slice(0, 8);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-10"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black tracking-tighter text-evo-dark uppercase">Visão Geral</h1>
        <div className="h-1.5 w-16 bg-evo-teal rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-evo-dark/30 mt-3 italic">Painel Consolidado de Gestão Empresarial</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white p-8 h-48 animate-pulse border border-evo-bg" />
          ))}
        </div>
      ) : (
        <>
          {/* Top KPI Bento Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {hasCosts && (
              <StatCard 
                title="Custos de Pessoal" 
                value={`R$ ${(totalPersonnelCosts/1000).toFixed(1)}k`} 
                icon={<Users />}
                description={`${stats.personnelCosts.length} lançamentos de folha e encargos`}
              />
            )}
            {hasCosts && (
              <StatCard 
                title="Custos de Locação" 
                value={`R$ ${(totalRentalCosts/1000).toFixed(1)}k`} 
                icon={<Building />}
                description={`${stats.rentalCosts.length} imóveis e instalações`}
              />
            )}
            {hasSalesOrders && (
              <StatCard 
                title="Pedidos de Venda" 
                value={`R$ ${(totalSalesOrdersValue/1000).toFixed(1)}k`} 
                icon={<ShoppingCart />}
                description={`${stats.salesOrders.length} pedidos de venda ativos`}
              />
            )}
            {hasNegotiations && (
              <StatCard 
                title="Cotações de Venda" 
                value={`R$ ${(totalSalesQuotationsValue/1000).toFixed(1)}k`} 
                icon={<ClipboardList />}
                description={`${stats.salesQuotations.length} cotações em negociação`}
              />
            )}
            {hasProcurement && (
              <StatCard 
                title="Volume de Compras" 
                value={`R$ ${(totalPurchaseOrdersValue/1000).toFixed(1)}k`} 
                icon={<TrendingUp />}
                description={`${stats.orders.length} ordens de compra em suprimentos`}
              />
            )}
            {hasProcurement && (
              <StatCard 
                title="Solicitações Pendentes" 
                value={openRequests} 
                icon={<FileText />}
                description="Aguardando cotação/pedido"
              />
            )}
            {hasApprovals && (
              <StatCard 
                title="Aprovações Ativas" 
                value={pendingApprovals} 
                icon={<CheckSquare />}
                description="Aguardando decisão gestor"
              />
            )}
          </div>

          {/* DETAILED DASHBOARD SECTION: CONTROLE DE CUSTOS */}
          {hasCosts && (
            <Card className="evo-card border-none overflow-hidden shadow-2xl shadow-evo-dark/5">
              <CardHeader className="bg-evo-dark px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-[12px] font-black uppercase tracking-[0.3em] text-white">Controle de Custos Detalhado</CardTitle>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/40 mt-1">Análise de Custos de Pessoal, Encargos e Locação de Imóveis</p>
                </div>
                <Badge className="bg-evo-teal text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1 self-start md:self-auto">Módulo de Custos</Badge>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                {/* Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-evo-bg/50 p-6 border-l-4 border-evo-teal">
                    <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Total Custos de Pessoal</p>
                    <p className="text-2xl font-black text-evo-dark mt-1">R$ {totalPersonnelCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[9px] font-bold text-evo-teal mt-1">{stats.personnelCosts.length} lançamentos registrados</p>
                  </div>
                  <div className="bg-evo-bg/50 p-6 border-l-4 border-blue-500">
                    <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Total Custos de Locação</p>
                    <p className="text-2xl font-black text-evo-dark mt-1">R$ {totalRentalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[9px] font-bold text-blue-500 mt-1">{stats.rentalCosts.length} contratos / unidades</p>
                  </div>
                  <div className="bg-evo-bg/50 p-6 border-l-4 border-indigo-500">
                    <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Consolidado Geral de Custos</p>
                    <p className="text-2xl font-black text-evo-dark mt-1">R$ {(totalPersonnelCosts + totalRentalCosts).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[9px] font-bold text-indigo-500 mt-1">Soma de saídas de pessoal e locação</p>
                  </div>
                  <div className="bg-evo-bg/50 p-6 border-l-4 border-amber-500">
                    <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Distribuição Pessoal vs Locação</p>
                    <p className="text-2xl font-black text-evo-dark mt-1">
                      {totalPersonnelCosts + totalRentalCosts > 0 
                        ? `${Math.round((totalPersonnelCosts / (totalPersonnelCosts + totalRentalCosts)) * 100)}% / ${Math.round((totalRentalCosts / (totalPersonnelCosts + totalRentalCosts)) * 100)}%`
                        : '0% / 0%'}
                    </p>
                    <p className="text-[9px] font-bold text-amber-500 mt-1">Proporção no orçamento total</p>
                  </div>
                </div>

                {/* Charts & Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/50 mb-4">Composição de Gastos (R$)</h4>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { category: 'Custos de Pessoal', valor: totalPersonnelCosts },
                          { category: 'Custos de Locação', valor: totalRentalCosts }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                          <Tooltip formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor Total']} />
                          <Bar dataKey="valor" radius={[0, 0, 0, 0]} barSize={60}>
                            <Cell fill="#00D1FF" />
                            <Cell fill="#3b82f6" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/50 mb-4">Últimos Lançamentos de Custos</h4>
                    <div className="divide-y divide-evo-bg max-h-[250px] overflow-y-auto border border-evo-bg">
                      {[...stats.personnelCosts, ...stats.rentalCosts]
                        .sort((a, b) => new Date(b.DocDate || b.CreationDate || 0).getTime() - new Date(a.DocDate || a.CreationDate || 0).getTime())
                        .slice(0, 5)
                        .map((c: any, i: number) => {
                          const isPersonnel = c._type === 'personnel-cost';
                          const name = c.U_NomeColaborador || c.U_Colaborador || c.U_Imovel || c.U_TipoContrato || `Lançamento #${c.DocEntry}`;
                          const val = Number(c.U_ValorTotal || c.U_TotalCost || c.DocTotal || c.U_SalarioBase || c.U_ValorAluguel || 0);
                          return (
                            <div key={i} className="p-4 flex items-center justify-between hover:bg-evo-teal/5 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 text-white ${isPersonnel ? 'bg-evo-teal' : 'bg-blue-500'}`}>
                                  {isPersonnel ? <Users className="w-3.5 h-3.5" /> : <Building className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-evo-dark">{name}</p>
                                  <p className="text-[9px] font-bold text-evo-dark/40 uppercase tracking-wider">{isPersonnel ? 'Custo de Pessoal' : 'Custo de Locação'}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-evo-dark">R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                          );
                        })}
                      {[...stats.personnelCosts, ...stats.rentalCosts].length === 0 && (
                        <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-evo-dark/30 italic">Nenhum lançamento de custo encontrado</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DETAILED DASHBOARD SECTION: VENDAS & NEGOCIAÇÕES */}
          {(hasSalesOrders || hasNegotiations) && (
            <Card className="evo-card border-none overflow-hidden shadow-2xl shadow-evo-dark/5">
              <CardHeader className="bg-evo-dark px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-[12px] font-black uppercase tracking-[0.3em] text-white">Análise de Vendas & Negociações</CardTitle>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/40 mt-1">Acompanhamento Comercial de Pedidos de Venda e Cotações</p>
                </div>
                <Badge className="bg-emerald-500 text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1 self-start md:self-auto">Módulo Comercial</Badge>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {hasSalesOrders && (
                    <div className="bg-evo-bg/50 p-6 border-l-4 border-emerald-500">
                      <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Total Pedidos de Venda</p>
                      <p className="text-2xl font-black text-evo-dark mt-1">R$ {totalSalesOrdersValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[9px] font-bold text-emerald-500 mt-1">{stats.salesOrders.length} pedidos de venda</p>
                    </div>
                  )}
                  {hasSalesOrders && (
                    <div className="bg-evo-bg/50 p-6 border-l-4 border-teal-500">
                      <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Ticket Médio de Venda</p>
                      <p className="text-2xl font-black text-evo-dark mt-1">
                        R$ {stats.salesOrders.length > 0 ? (totalSalesOrdersValue / stats.salesOrders.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}
                      </p>
                      <p className="text-[9px] font-bold text-teal-500 mt-1">Valor médio por pedido</p>
                    </div>
                  )}
                  {hasNegotiations && (
                    <div className="bg-evo-bg/50 p-6 border-l-4 border-amber-500">
                      <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Volume Cotações de Venda</p>
                      <p className="text-2xl font-black text-evo-dark mt-1">R$ {totalSalesQuotationsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[9px] font-bold text-amber-500 mt-1">{stats.salesQuotations.length} cotações ativas</p>
                    </div>
                  )}
                  {hasNegotiations && (
                    <div className="bg-evo-bg/50 p-6 border-l-4 border-indigo-500">
                      <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Total de Oportunidades</p>
                      <p className="text-2xl font-black text-evo-dark mt-1">{stats.salesOrders.length + stats.salesQuotations.length}</p>
                      <p className="text-[9px] font-bold text-indigo-500 mt-1">Documentos comerciais</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/50 mb-4">Volume Comercial por Categoria (R$)</h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          ...(hasSalesOrders ? [{ name: 'Pedidos de Venda', valor: totalSalesOrdersValue }] : []),
                          ...(hasNegotiations ? [{ name: 'Cotações de Venda', valor: totalSalesQuotationsValue }] : [])
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
                          <Tooltip formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor Total']} />
                          <Bar dataKey="valor" fill="#10b981" barSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/50 mb-4">Últimos Pedidos & Cotações de Venda</h4>
                    <div className="divide-y divide-evo-bg max-h-[240px] overflow-y-auto border border-evo-bg">
                      {[...stats.salesOrders, ...stats.salesQuotations]
                        .sort((a, b) => new Date(b.DocDate || b.CreationDate || 0).getTime() - new Date(a.DocDate || a.CreationDate || 0).getTime())
                        .slice(0, 5)
                        .map((doc: any, i: number) => {
                          const isOrder = doc._type === 'sales-order';
                          return (
                            <div key={i} className="p-4 flex items-center justify-between hover:bg-emerald-500/5 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 text-white ${isOrder ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                  {isOrder ? <ShoppingCart className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-evo-dark">{doc.CardName || `Cliente #${doc.CardCode || doc.DocNum || doc.DocEntry}`}</p>
                                  <p className="text-[9px] font-bold text-evo-dark/40 uppercase tracking-wider">{isOrder ? 'Pedido de Venda' : 'Cotação de Venda'} #{doc.DocNum || doc.DocEntry}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-evo-dark">R$ {(Number(doc.DocTotal) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                          );
                        })}
                      {[...stats.salesOrders, ...stats.salesQuotations].length === 0 && (
                        <p className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-evo-dark/30 italic">Nenhum documento comercial encontrado</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* RESUMO DAS COTAÇÕES POR PROJETO / MEDIÇÕES (PRINT PROJETO.PNG) */}
          <Card className="evo-card border-none overflow-hidden shadow-2xl shadow-evo-dark/5 bg-white">
            <CardHeader className="bg-[#1b2a4e] px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-evo-teal/20 text-evo-teal border border-evo-teal/40 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-[11px] font-black uppercase tracking-[0.25em] text-white">
                    Resumo das Cotações por Projeto
                  </CardTitle>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/60 mt-0.5">
                    Acompanhamento por Projeto, Cotação, PO Cliente, Valor Medido e Saldo
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {onOpenMeasurements && (
                  <Button
                    onClick={onOpenMeasurements}
                    className="bg-evo-teal hover:bg-evo-teal-dark text-evo-dark text-[10px] font-black uppercase tracking-widest h-9 px-4 rounded-none shadow-md flex items-center gap-2"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    Resumo das Medições
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[850px]">
                  <TableHeader className="bg-slate-100 border-b border-slate-200">
                    <TableRow className="border-none">
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-700 px-6 py-4">Projeto</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-700 px-6 py-4">Cotação</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-700 px-6 py-4">PO Cliente</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-700 px-6 py-4 text-right">Valor Total da Cotação</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-emerald-700 px-6 py-4 text-right">Valor Medido até o momento</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-900 px-6 py-4 text-right">Saldo</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-700 px-6 py-4 text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {(() => {
                      const manualRaw = localStorage.getItem('qualitech_manual_measurements_v1');
                      let manualMap: any = {};
                      if (manualRaw) {
                        try { manualMap = JSON.parse(manualRaw); } catch {}
                      }

                      let items: any[] = [];
                      if (stats.salesQuotations && stats.salesQuotations.length > 0) {
                        items = stats.salesQuotations.map((q: any, idx: number) => {
                          const docEntry = q.DocEntry || idx + 1;
                          const docNum = q.DocNum || q.DocEntry || `${3060 + idx}`;
                          const docTotal = Number(q.DocTotal || 60000);
                          const override = manualMap[docEntry];
                          const srv = override?.serviceMeasured !== undefined ? override.serviceMeasured : Number(q.U_ValorMedidoServico || (docTotal * 0.05));
                          const eq = override?.equipmentMeasured !== undefined ? override.equipmentMeasured : Number(q.U_ValorMedidoEquip || 0);
                          const measured = srv + eq;
                          const balance = Math.max(0, docTotal - measured);
                          return {
                            docEntry,
                            docNum,
                            projeto: q.U_Projeto || q.Project || q.ProjectCode || q.Comments || `wO ${2040 + (idx % 20)}`,
                            cotacao: `QT ${docNum}`,
                            poCliente: q.NumAtCard || q.U_POCliente || `${7001 + idx}`,
                            cardName: q.CardName || `Cliente #${docEntry}`,
                            docTotal,
                            measured,
                            balance
                          };
                        });
                      } else {
                        items = [
                          {
                            docEntry: 3060,
                            docNum: '3060',
                            projeto: 'wO 2040',
                            cotacao: 'QT 3060',
                            poCliente: '7001',
                            cardName: 'PETROBRAS S.A.',
                            docTotal: 60000,
                            measured: (manualMap[3060]?.serviceMeasured ?? 3000) + (manualMap[3060]?.equipmentMeasured ?? 0),
                            balance: 60000 - ((manualMap[3060]?.serviceMeasured ?? 3000) + (manualMap[3060]?.equipmentMeasured ?? 0))
                          },
                          {
                            docEntry: 3061,
                            docNum: '3061',
                            projeto: 'wO 2041',
                            cotacao: 'QT 3061',
                            poCliente: '7005',
                            cardName: 'EQUINOR BRASIL',
                            docTotal: 85000,
                            measured: (manualMap[3061]?.serviceMeasured ?? 25000) + (manualMap[3061]?.equipmentMeasured ?? 0),
                            balance: 85000 - ((manualMap[3061]?.serviceMeasured ?? 25000) + (manualMap[3061]?.equipmentMeasured ?? 0))
                          },
                          {
                            docEntry: 3062,
                            docNum: '3062',
                            projeto: 'wO 2042',
                            cotacao: 'QT 3062',
                            poCliente: '7012',
                            cardName: 'MODEK OFFSHORE',
                            docTotal: 45000,
                            measured: (manualMap[3062]?.serviceMeasured ?? 0) + (manualMap[3062]?.equipmentMeasured ?? 0),
                            balance: 45000 - ((manualMap[3062]?.serviceMeasured ?? 0) + (manualMap[3062]?.equipmentMeasured ?? 0))
                          }
                        ];
                      }

                      return items.map((item, idx) => (
                        <TableRow 
                          key={idx} 
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                          onClick={() => onViewDetails(item.docEntry, 'sales-quotation')}
                        >
                          <TableCell className="px-6 py-4 font-black text-xs text-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-evo-teal"></span>
                              {item.projeto}
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 font-black text-xs text-evo-teal group-hover:underline">
                            {item.cotacao}
                          </TableCell>
                          <TableCell className="px-6 py-4 font-bold text-xs text-slate-600">
                            {item.poCliente}
                          </TableCell>
                          <TableCell className="px-6 py-4 font-black text-xs text-slate-800 text-right">
                            R$ {item.docTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-6 py-4 font-black text-xs text-emerald-600 text-right bg-emerald-50/40">
                            R$ {item.measured.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-6 py-4 font-black text-xs text-slate-900 text-right">
                            R$ {item.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(item.docEntry, 'sales-quotation');
                              }}
                              className="h-7 text-[9px] font-black uppercase tracking-wider rounded-none border-slate-300 hover:bg-evo-teal hover:text-white hover:border-evo-teal transition-all"
                            >
                              Abrir Cotação
                            </Button>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* GLOBAL VOLUME CHART AND RECENT ACTIVITY STREAM */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main analytics plate */}
            <Card className="evo-card border-none lg:col-span-7 overflow-hidden">
              <CardHeader className="bg-evo-dark px-8 py-6">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Distribuição Consolidada de Volume por Módulo</CardTitle>
              </CardHeader>
              <CardContent className="h-[380px] pt-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fontWeight: 900, fill: '#1a1a1a', letterSpacing: '0.1em' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fontWeight: 700, fill: '#ababab' }} 
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }} 
                      contentStyle={{ borderRadius: '0', border: '1px solid #f0f0f0', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                      formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR')}`, 'Volume (R$)']}
                    />
                    <Bar dataKey="value" radius={[0, 0, 0, 0]} barSize={50}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recent activity plate */}
            <Card className="evo-card border-none lg:col-span-5 shadow-2xl shadow-evo-dark/5">
              <CardHeader className="border-b border-evo-bg/50 px-8 py-6 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-dark/40">Fluxo Operacional Recente</CardTitle>
                <div className="w-2 h-2 rounded-full bg-evo-teal animate-ping" />
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-evo-bg">
                  {recentActivity.map((activity: any, idx) => (
                    <div key={idx} className="p-6 flex items-center justify-between transition-colors hover:bg-evo-teal/5 group">
                      <div className="flex items-center gap-5">
                        <div className="w-10 h-10 bg-evo-bg flex items-center justify-center transition-transform group-hover:rotate-12">
                          <FileText className="w-4 h-4 text-evo-dark/40 group-hover:text-evo-teal" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-tight text-evo-dark">Ref. #{activity.DocNum || activity.DocEntry}</p>
                          <p className="text-[9px] font-bold text-evo-teal/60 uppercase tracking-widest truncate max-w-[200px]">
                            {activity.CardName || activity.RequesterName || activity.U_NomeColaborador || activity.U_Imovel || '-'}
                          </p>
                          <p className="text-[9px] font-bold text-evo-dark/30 uppercase tracking-widest">
                            {new Date(activity.DocDate || activity.CreationDate || 0).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-evo-dark">
                          R$ {(activity.DocTotal || activity.U_ValorTotal || activity.U_TotalCost || activity.U_SalarioBase || activity.U_ValorAluguel || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-evo-teal hover:bg-evo-teal hover:text-white rounded-none ml-2 mt-1"
                          onClick={() => onViewDetails(activity.DocEntry, activity._type)}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/20 italic">
                      Aguardando processamento de dados...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </motion.div>
  );
}

function StatCard({ title, value, icon, description }: any) {
  return (
    <Card className="evo-card border-none relative overflow-hidden group h-full">
      <div className="absolute top-0 right-0 w-32 h-32 bg-evo-teal/5 rounded-bl-full -mr-16 -mt-16 transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute bottom-0 left-0 w-24 h-1 bg-evo-teal transform origin-left transition-transform duration-500 scale-x-0 group-hover:scale-x-100" />
      
      <CardContent className="pt-10 pb-8 px-8 relative z-10">
        <div className="flex flex-col h-full justify-between">
          <div className="bg-evo-bg w-14 h-14 flex items-center justify-center transition-colors duration-500 group-hover:bg-evo-teal/10 mb-6">
            {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6 text-evo-dark group-hover:text-evo-teal transition-colors' })}
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-black text-evo-dark/40 uppercase tracking-[0.3em] mb-1">{title}</p>
              <h3 className="text-3xl font-black text-evo-dark tracking-tighter leading-none">{value}</h3>
            </div>
            
            <div className="pt-4 border-t border-evo-bg flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-widest text-evo-teal/70">{description}</p>
              <div className="w-1.5 h-1.5 rounded-full bg-evo-teal animate-pulse" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateOrderView({ 
  title = "Novo Pedido de Compra", 
  onSubmit = sapService.createPurchaseOrder, 
  userEmail,
  allowAttachments = false 
}: { 
  key?: string, 
  title?: string, 
  onSubmit?: (data: any, email?: string) => Promise<any>, 
  userEmail?: string,
  allowAttachments?: boolean
}) {
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  
  const isRequest = title.includes('Solicitação');

  const [itemSearch, setItemSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  const [businessPlaces, setBusinessPlaces] = useState<any[]>([]);
  const [selectedBPL, setSelectedBPL] = useState<string>('');
  
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [distRules, setDistRules] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [usages, setUsages] = useState<any[]>([]);
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docDueDate, setDocDueDate] = useState<string>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingItems, setIsSearchingItems] = useState(false);
  const [lastAddedIdx, setLastAddedIdx] = useState<number | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [createdDocEntry, setCreatedDocEntry] = useState<number | null>(null);

  const handleSendEmail = (to: string, cc: string, subject: string, body: string) => {
    const mailtoUrl = `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    setIsEmailModalOpen(false);
    // After sending, reset form
    setOrderItems([]);
    setSelectedSupplier(null);
    setSelectedFiles([]);
  };

  useEffect(() => {
    fetchBusinessPlaces();
    fetchAccountingData();
    fetchInitialItems();
  }, []);

  const fetchInitialItems = async () => {
    try {
      const data = await sapService.getItems();
      setItems(data);
    } catch (error) {
      console.error('Erro ao carregar itens iniciais:', error);
    }
  };

  const fetchAccountingData = async () => {
    try {
      const [dims, rules, projs, use] = await Promise.all([
        sapService.getDimensions(),
        sapService.getDistributionRules(),
        sapService.getProjects(),
        sapService.getUsages()
      ]);
      setDimensions(dims);
      setDistRules(rules);
      setProjects(projs);
      setUsages(use);
    } catch (error) {
      console.error('Erro ao carregar dados contábeis:', error);
    }
  };

  const fetchBusinessPlaces = async () => {
    try {
      const data = await sapService.getBusinessPlaces();
      setBusinessPlaces(data);
      // Set default filial if available
      const defaultBPL = data.find((b: any) => b.DefaultIndicator === 'tYES');
      if (defaultBPL) setSelectedBPL(defaultBPL.BPLID.toString());
      else if (data.length > 0) setSelectedBPL(data[0].BPLID.toString());
    } catch (error) {
      toast.error('Erro ao carregar filiais.');
    }
  };

  const searchSuppliers = async () => {
    try {
      const data = await sapService.getBusinessPartners(supplierSearch);
      setSuppliers(data);
    } catch (error) {
      toast.error('Erro ao buscar fornecedores.');
    }
  };

  const searchItems = async () => {
    if (!itemSearch && items.length > 0) return; // Don't re-search empty if we already have items
    setIsSearchingItems(true);
    try {
      const data = await sapService.getItems(itemSearch);
      setItems(data);
      if (data.length === 0) {
        toast.info('Nenhum item encontrado com este termo.');
      }
    } catch (error) {
      toast.error('Erro ao buscar itens.');
    } finally {
      setIsSearchingItems(false);
    }
  };

  const addItemToOrder = (item: any) => {
    let targetIdx = -1;
    const existingIdx = orderItems.findIndex(i => i.ItemCode === item.ItemCode);
    if (existingIdx !== -1) {
      setOrderItems(orderItems.map((i, idx) => 
        idx === existingIdx ? { ...i, Quantity: i.Quantity + 1 } : i
      ));
      setLastAddedIdx(existingIdx);
      targetIdx = existingIdx;
    } else {
      const newItems = [...orderItems, { ...item, Quantity: 1, Price: 0 }];
      setOrderItems(newItems);
      setLastAddedIdx(newItems.length - 1);
      targetIdx = newItems.length - 1;
    }
    toast.success(`${item.ItemName} adicionado.`);
    
    // Focus the price input after some delay for the item to render
    setTimeout(() => {
      const idx = targetIdx;
      const input = document.querySelector(`input[data-item-idx="${idx}"][data-field="price"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      } else {
        // Fallback to the last one if specific match fails
        const inputs = document.querySelectorAll('input[type="number"][data-field="price"]');
        if (inputs.length > 0) {
          const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
          lastInput?.focus();
          lastInput?.select();
        }
      }
    }, 150);
  };

  const handleFormSubmit = async () => {
    if ((!selectedSupplier && !isRequest) || orderItems.length === 0 || !selectedBPL) {
      toast.error(isRequest ? 'Selecione uma filial e adicione itens.' : 'Selecione um fornecedor, uma filial e adicione itens.');
      return;
    }

    // Validation: Block if project or dimension 1 is missing
    const missingAccounting = orderItems.some(item => !item.ProjectCode || !item.CostingCode);
    if (missingAccounting) {
      toast.error('Todos os itens devem ter Projeto SAP e Dimensão 1 preenchidos no Detalhamento Contábil.');
      return;
    }

    setIsLoading(true);
    try {
      let attachmentEntry = null;
      if (allowAttachments && selectedFiles.length > 0) {
        toast.info('Enviando anexos...');
        const attachResult = await sapService.uploadAttachments(selectedFiles);
        attachmentEntry = attachResult.AbsoluteEntry;
      }

      const orderData: any = {
        CardCode: selectedSupplier?.CardCode || '',
        DocDueDate: docDueDate,
        DocumentLines: orderItems.map(i => ({
          ItemCode: i.ItemCode,
          Quantity: i.Quantity,
          Price: i.Price,
          CostingCode: i.CostingCode,
          CostingCode2: i.CostingCode2,
          CostingCode3: i.CostingCode3,
          CostingCode4: i.CostingCode4,
          CostingCode5: i.CostingCode5,
          ProjectCode: i.ProjectCode,
          Usage: i.Usage ? parseInt(i.Usage) : undefined
        }))
      };

      if (attachmentEntry) {
        orderData.AttachmentEntry = attachmentEntry;
      }

      // Handle Branch Mapping based on document type
      if (isRequest) {
        orderData.BPLID = parseInt(selectedBPL);
      } else {
        orderData.BPL_IDAssignedToInvoice = parseInt(selectedBPL);
      }

      const response = await onSubmit(orderData, userEmail);
      
      // Only show portal email prompt for Purchase Quotations
      if (title === "Nova Cotação de Compra" && response?.DocEntry) {
        setCreatedDocEntry(response.DocEntry);
        setIsEmailModalOpen(true);
      } else {
        toast.success(`${title} realizado com sucesso!`);
        setOrderItems([]);
        setSelectedSupplier(null);
        setSelectedFiles([]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message?.value || 'Erro ao processar operação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10 max-w-6xl mx-auto"
    >
      <EmailQuotationModal 
        isOpen={isEmailModalOpen}
        onClose={() => {
          setIsEmailModalOpen(false);
          toast.success(`${title} realizado com sucesso!`);
          setOrderItems([]);
          setSelectedSupplier(null);
          setSelectedFiles([]);
        }}
        onConfirm={handleSendEmail}
        defaultTo={selectedSupplier?.EmailAddress || ''}
        defaultCC={userEmail || ''}
        docEntry={createdDocEntry || 0}
        portalUrl={`${window.location.origin}${window.location.pathname}?portal=quotation&id=${createdDocEntry}`}
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">{title}</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Portal de Operações SAP Business One</p>
        </div>
        <Button 
          onClick={handleFormSubmit} 
          disabled={isLoading} 
          className="evo-button-primary shadow-xl"
        >
          {isLoading ? 'Efetivando...' : 'Efetivar Registro'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Main Form Area */}
        <div className="lg:col-span-8 space-y-10">
          {/* Header Data Section */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-teal">Informações de Cabeçalho</h2>
            <Card className="evo-card border-none">
              <CardContent className="pt-8 pb-8 px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/60 ml-1">Filial Responsável</Label>
                    <Select value={selectedBPL} onValueChange={setSelectedBPL}>
                      <SelectTrigger className="w-full h-11 rounded-none border-evo-bg bg-evo-bg/30 text-xs font-bold text-evo-dark">
                        <SelectValue placeholder="Selecione a unidade">
                          {selectedBPL ? businessPlaces.find(b => String(b.BPLID) === selectedBPL)?.BPLName : "Selecione a unidade"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-evo-bg max-w-[300px]">
                        {businessPlaces.map((bpl) => (
                          <SelectItem key={bpl.BPLID} value={String(bpl.BPLID)} className="text-[10px] uppercase font-black tracking-tight">
                            {bpl.BPLName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/60 ml-1">Data de Vencimento</Label>
                    <Input 
                      type="date" 
                      className="h-11 rounded-none border-evo-bg bg-evo-bg/30 text-xs font-bold"
                      value={docDueDate}
                      onChange={(e) => setDocDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Items Section */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-teal">Itens e Serviços</h2>
            <Card className="evo-card border-none">
              <CardContent className="pt-8 pb-8 px-8 space-y-8">
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-evo-dark/30 w-4 h-4" />
                    <Input 
                      placeholder="PESQUISAR POR CÓDIGO OU DESCRIÇÃO..." 
                      className="pl-10 h-11 rounded-none border-evo-bg bg-evo-bg/30 text-[10px] font-bold uppercase tracking-widest placeholder:text-evo-dark/20"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          searchItems();
                        }
                      }}
                    />
                  </div>
                  <Button 
                    onClick={searchItems} 
                    disabled={isSearchingItems}
                    variant="outline" 
                    className="h-11 rounded-none px-8 font-bold border-evo-bg uppercase text-[10px] tracking-widest hover:bg-evo-bg transition-all"
                  >
                    {isSearchingItems ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {isSearchingItems ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>

                {items.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto p-4 bg-evo-bg/20 border border-evo-bg">
                    {items.map(item => (
                      <button 
                        key={item.ItemCode}
                        className="text-left p-3 bg-white hover:bg-evo-teal/5 transition-all flex justify-between items-center group border border-transparent hover:border-evo-teal/20"
                        onClick={() => addItemToOrder(item)}
                      >
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black uppercase tracking-tight text-evo-dark truncate">{item.ItemName}</p>
                          <p className="text-[9px] font-bold tracking-[0.2em] text-evo-teal/60">{item.ItemCode}</p>
                        </div>
                        <Plus className="w-3 h-3 shrink-0 text-evo-dark/20 group-hover:text-evo-teal transition-colors" />
                      </button>
                    ))}
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow className="border-evo-bg hover:bg-transparent">
                      <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/40 px-2">Descrição</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/40 px-2 w-24">Quantidade</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/40 px-2 w-32 text-right">Preço Unit.</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/40 px-2 w-16 text-center">Config.</TableHead>
                      <TableHead className="w-10 px-2"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item, idx) => (
                      <TableRow key={idx} className="border-evo-bg hover:bg-evo-bg/5 transition-colors group">
                        <TableCell className="px-2 py-4">
                          <p className="text-[11px] font-black uppercase tracking-tight text-evo-dark">{item.ItemName}</p>
                          <p className="text-[9px] font-bold text-evo-teal/60 tracking-widest">{item.ItemCode}</p>
                        </TableCell>
                        <TableCell className="px-2 py-4">
                          <Input 
                            type="number" 
                            className="h-9 rounded-none border-evo-bg bg-white text-xs font-bold text-center"
                            value={item.Quantity} 
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setOrderItems(orderItems.map((it, i) => i === idx ? { ...it, Quantity: val } : it));
                            }}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[9px] font-black text-evo-dark/30">R$</span>
                            <Input 
                              type="number" 
                              step="0.01"
                              data-item-idx={idx}
                              data-field="price"
                              className="h-9 w-24 rounded-none border-evo-bg bg-white text-xs font-bold text-right"
                              value={item.Price} 
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setOrderItems(orderItems.map((it, i) => i === idx ? { ...it, Price: val } : it));
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-4 text-center">
                          <Dialog>
                            <DialogTrigger render={
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-evo-teal/10 hover:text-evo-teal transition-all">
                                <Settings className={`w-4 h-4 ${(item.CostingCode || item.CostingCode2 || item.CostingCode3 || item.CostingCode4 || item.CostingCode5 || item.ProjectCode || item.Usage) ? 'text-evo-teal fill-evo-teal/10' : 'text-evo-dark/20'}`} />
                              </Button>
                            } />
                            <DialogContent className="max-w-4xl rounded-none max-h-[95vh] overflow-y-auto border-none p-0 flex flex-col">
                              <div className="bg-white flex-1 flex flex-col">
                                <DialogHeader className="p-6 pb-0 space-y-0">
                                  <div className="flex items-center justify-between border-b border-evo-bg pb-4">
                                    <div className="space-y-0.5">
                                      <DialogTitle className="uppercase tracking-tighter font-black text-xl text-evo-dark text-left leading-none">Detalhamento Contábil</DialogTitle>
                                      <CardDescription className="text-[9px] uppercase tracking-[0.2em] font-bold text-evo-teal text-left">Rateio e Projetos</CardDescription>
                                    </div>
                                    <DialogClose render={
                                      <Button variant="ghost" size="icon" className="h-8 w-8 border border-evo-bg rounded-none hover:bg-evo-bg transition-all">
                                        <X className="w-4 h-4" />
                                      </Button>
                                    } />
                                  </div>
                                  <div className="mt-4 p-3 bg-evo-bg/20 border-l-4 border-evo-teal flex items-center gap-3">
                                    <div className="bg-evo-teal text-white text-[8px] font-black px-1.5 py-0.5 uppercase">ITEM</div>
                                    <p className="text-xs font-black uppercase text-evo-dark tracking-tight truncate">{item.ItemName}</p>
                                  </div>
                                </DialogHeader>
                                
                                <div className="p-6">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* Dimensions Grid Section */}
                                {[...dimensions].sort((a,b) => (a.DimensionCode || a.DimensionNumber || 0) - (b.DimensionCode || b.DimensionNumber || 0)).map((dim: any) => (
                                  <div key={dim.DimensionCode || dim.DimensionNumber} className="group space-y-3 bg-white p-5 border border-evo-bg shadow-sm transition-all hover:border-evo-teal/50 hover:shadow-md">
                                    <div className="flex items-center justify-between border-b border-evo-bg pb-2 mb-2">
                                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal text-left">
                                        {dim.DimensionName || `Dimensão ${dim.DimensionCode || dim.DimensionNumber}`}
                                      </Label>
                                      <div className="text-[9px] font-bold text-evo-dark/30">DIM {dim.DimensionCode || dim.DimensionNumber}</div>
                                    </div>
                                    <Select 
                                      value={item[`CostingCode${(dim.DimensionCode || dim.DimensionNumber) === 1 ? '' : (dim.DimensionCode || dim.DimensionNumber)}`] || 'none'} 
                                      onValueChange={(val) => {
                                        const dimNum = dim.DimensionCode || dim.DimensionNumber;
                                        const field = `CostingCode${dimNum === 1 ? '' : dimNum}`;
                                        setOrderItems(orderItems.map((it, i) => i === idx ? { ...it, [field]: val === 'none' ? undefined : val } : it));
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-11 rounded-none border-evo-bg bg-evo-bg/10 text-[10px] font-black uppercase tracking-tight shadow-none group-hover:bg-white transition-colors">
                                        <SelectValue placeholder="Centro de Custo" />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-none min-w-[320px] border-evo-bg shadow-xl">
                                        <SelectItem value="none" className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/40 py-3">Nenhum Selecionado</SelectItem>
                                        {distRules
                                          .filter((r: any) => Number(r.InWhichDimension) === Number(dim.DimensionCode || dim.DimensionNumber))
                                          .map((rule: any) => (
                                            <SelectItem key={rule.FactorCode} value={rule.FactorCode} className="text-[11px] uppercase font-bold tracking-wider py-3 border-b border-gray-50 last:border-0 hover:bg-evo-teal/5">
                                              <span className="text-evo-teal font-black mr-2">{rule.FactorCode}</span> {rule.FactorDescription}
                                            </SelectItem>
                                          ))
                                        }
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}

                                  {/* SAP Project Section */}
                                  <div className="group space-y-3 bg-white p-5 border border-evo-bg shadow-sm transition-all hover:border-evo-teal/50 hover:shadow-md">
                                    <div className="flex items-center justify-between border-b border-evo-bg pb-2 mb-2">
                                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal text-left">Projeto SAP</Label>
                                      <div className="text-[9px] font-bold text-evo-dark/30">PROJ</div>
                                    </div>
                                    <Select 
                                      value={item.ProjectCode || 'none'} 
                                      onValueChange={(val) => {
                                        setOrderItems(orderItems.map((it, i) => i === idx ? { ...it, ProjectCode: val === 'none' ? undefined : val } : it));
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-11 rounded-none border-evo-bg bg-evo-bg/10 text-[10px] font-black uppercase tracking-tight shadow-none group-hover:bg-white transition-colors">
                                        <SelectValue placeholder="Selecionar Projeto" />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-none min-w-[320px] border-evo-bg shadow-xl">
                                        <SelectItem value="none" className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/40 py-3">Nenhum Selecionado</SelectItem>
                                        {projects.map((p: any) => (
                                          <SelectItem key={p.Code} value={p.Code} className="text-[11px] uppercase font-bold tracking-wider py-3 border-b border-gray-50 last:border-0">
                                            <span className="text-evo-teal font-black mr-2">{p.Code}</span> {p.Name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {/* Usage Section */}
                                  <div className="group space-y-3 bg-white p-5 border border-evo-bg shadow-sm transition-all hover:border-evo-teal/50 hover:shadow-md">
                                    <div className="flex items-center justify-between border-b border-evo-bg pb-2 mb-2">
                                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal text-left">Utilização Fiscal</Label>
                                      <div className="text-[9px] font-bold text-evo-dark/30">USO</div>
                                    </div>
                                    <Select 
                                      value={item.Usage?.toString() || 'none'} 
                                      onValueChange={(val) => {
                                        setOrderItems(orderItems.map((it, i) => i === idx ? { ...it, Usage: val === 'none' ? undefined : val } : it));
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-11 rounded-none border-evo-bg bg-evo-bg/10 text-[10px] font-black uppercase tracking-tight shadow-none group-hover:bg-white transition-colors">
                                        <SelectValue placeholder="Utilização" />
                                      </SelectTrigger>
                                      <SelectContent className="rounded-none min-w-[320px] border-evo-bg shadow-xl">
                                        <SelectItem value="none" className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/40 py-3">Nenhum Selecionado</SelectItem>
                                        {usages.map((u: any) => (
                                          <SelectItem key={u.ID} value={u.ID.toString()} className="text-[11px] uppercase font-bold tracking-wider py-3 border-b border-gray-50 last:border-0">
                                            <span className="text-evo-teal font-black mr-2">{u.ID}</span> {u.Usage}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                              
                                <div className="p-6 pt-0 mt-auto flex justify-end border-t border-evo-bg pt-6 bg-gray-50/50">
                                  <DialogClose render={
                                    <Button className="evo-button-primary rounded-none px-12 h-12 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:translate-y-[-1px] transition-all" onClick={() => {
                                      toast.success('Configuração contábil aplicada ao item.');
                                    }}>
                                      Confirmar Contabilidade
                                    </Button>
                                  } />
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                        <TableCell className="px-2 py-4">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-none opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {orderItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-16">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-dark/20 italic">Vazio. Aguardando seleção de itens.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Sidebar Context */}
        <div className="lg:col-span-4 space-y-10">
          {/* BP Selection */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-teal">Entidade Parceira</h2>
            <Card className="evo-card border-none">
              <CardContent className="pt-8 pb-8 px-8 space-y-6">
                {selectedSupplier ? (
                  <div className="p-6 bg-evo-dark text-white rounded-none relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-evo-teal/20 -translate-y-1/2 translate-x-1/2 rounded-full" />
                    <div className="relative z-10">
                      <p className="text-[11px] font-black uppercase tracking-tight truncate leading-tight">{selectedSupplier.CardName}</p>
                      <p className="text-[9px] font-bold tracking-[0.2em] text-evo-teal mt-1">{selectedSupplier.CardCode}</p>
                      {selectedSupplier.FederalTaxID && (
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-[8px] uppercase tracking-widest font-black text-white/30">Tax ID / CNPJ</span>
                          <span className="text-[10px] font-bold text-white/70">{selectedSupplier.FederalTaxID}</span>
                        </div>
                      )}
                      <Button 
                        variant="link" 
                        className="p-0 h-auto mt-4 text-[9px] uppercase tracking-widest font-black text-rose-400 hover:text-rose-300"
                        onClick={() => setSelectedSupplier(null)}
                      >
                        [ Alterar Parceiro ]
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="NOME DO FORNECEDOR..." 
                        className="h-11 rounded-none border-evo-bg bg-evo-bg/30 text-[10px] font-bold uppercase tracking-widest"
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            searchSuppliers();
                          }
                        }}
                      />
                      <Button type="button" size="icon" className="h-11 w-11 rounded-none bg-evo-dark" onClick={searchSuppliers}><Search className="w-4 h-4" /></Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto border border-evo-bg divide-y divide-evo-bg bg-white shadow-inner">
                      {suppliers.map(s => (
                        <button 
                          key={s.CardCode}
                          type="button"
                          className="w-full text-left p-4 hover:bg-evo-teal/10 transition-all group cursor-pointer border-none outline-none block relative z-30"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Selecionando BP:', s.CardCode);
                            setSelectedSupplier(s);
                          }}
                        >
                          <p className="text-[10px] font-black uppercase tracking-tight text-evo-dark group-hover:text-evo-teal leading-tight pointer-events-none">{s.CardName}</p>
                          <p className="text-[9px] font-bold tracking-[0.2em] text-evo-dark/30 mt-0.5 pointer-events-none">{s.CardCode}</p>
                        </button>
                      ))}
                      {suppliers.length === 0 && (
                        <div className="p-10 text-center text-[9px] font-black uppercase tracking-widest text-evo-dark/20 italic">
                          Aguardando busca...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {allowAttachments && (
            <section className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-teal">Anexos e Mídias</h2>
              <Card className="evo-card border-none">
                <CardContent className="pt-8 pb-8 px-8 space-y-6">
                  <Label htmlFor="attachments" className="cursor-pointer block">
                    <div className="border border-dashed border-evo-dark/20 bg-evo-bg/20 rounded-none p-10 text-center hover:border-evo-teal transition-all group">
                      <Plus className="w-8 h-8 text-evo-dark/10 mx-auto mb-3 group-hover:text-evo-teal/40 transition-colors" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Selecionar Aquivos</p>
                    </div>
                    <input 
                      id="attachments" 
                      type="file" 
                      multiple 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files) {
                          setSelectedFiles([...selectedFiles, ...Array.from(e.target.files)]);
                        }
                      }}
                    />
                  </Label>

                  {selectedFiles.length > 0 && (
                    <div className="space-y-2 border-t border-evo-bg pt-4">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-evo-bg/50 border-l-2 border-evo-teal text-[10px] font-bold uppercase tracking-tight">
                          <span className="truncate max-w-[180px]">{file.name}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-rose-500 hover:bg-rose-50" 
                            onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Totals Section Context */}
          <Card className="bg-evo-dark border-none rounded-none shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-evo-teal" />
            <CardContent className="pt-10 pb-10 px-8">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 text-center mb-6">Total do Documento</p>
              <div className="text-center">
                <span className="text-white/40 text-xs font-black mr-2 opacity-50">R$</span>
                <span className="text-4xl font-black text-white tracking-tighter">
                  {orderItems.reduce((acc, curr) => acc + (curr.Quantity * curr.Price), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="mt-8 pt-8 border-t border-white/5 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
                  <span>Itens Selecionados</span>
                  <span>{orderItems.length} SKUs</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
                  <span>Status do Processo</span>
                  <span className="text-evo-teal">Validado</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (to: string, cc: string, subject: string, body: string) => void;
  defaultTo: string;
  defaultCC: string;
  docEntry: number;
  portalUrl: string;
}

function EmailQuotationModal({ isOpen, onClose, onConfirm, defaultTo, defaultCC, docEntry, portalUrl }: EmailModalProps) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState(defaultCC);
  const [subject, setSubject] = useState(`Solicitação de Cotação - Oferta #${docEntry}`);
  const [body, setBody] = useState(`Prezado fornecedor,\n\nFavor preencher sua proposta comercial no link abaixo para a oferta #${docEntry}:\n\n${portalUrl}\n\nAtenciosamente,\nSetor de Compras Qualitech`);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-evo-dark/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-none w-full max-w-xl overflow-hidden shadow-2xl"
      >
        <div className="bg-evo-dark p-6 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black text-evo-teal uppercase tracking-widest">Enviar Proposta Comercial</h3>
            <p className="text-[10px] text-white/40 uppercase font-bold tracking-tight">Oferta de Compra #{docEntry}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60">Para (Fornecedor)</Label>
              <Input 
                value={to} 
                onChange={e => setTo(e.target.value)}
                className="rounded-none border-evo-bg bg-evo-bg/20 font-bold text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60">Cópia (CC)</Label>
              <Input 
                value={cc} 
                onChange={e => setCc(e.target.value)}
                className="rounded-none border-evo-bg bg-evo-bg/20 font-bold text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60">Assunto</Label>
            <Input 
              value={subject} 
              onChange={e => setSubject(e.target.value)}
              className="rounded-none border-evo-bg bg-evo-bg/20 font-bold text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60">Mensagem</Label>
            <textarea 
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full h-40 border border-evo-bg bg-evo-bg/10 p-4 text-xs font-medium rounded-none focus:ring-1 focus:ring-evo-teal focus:outline-none transition-all"
            />
          </div>
        </div>

        <div className="p-6 bg-evo-bg/30 border-t border-evo-bg flex justify-end gap-4">
          <Button variant="ghost" onClick={onClose} className="rounded-none text-[10px] font-black uppercase tracking-widest">
            Cancelar
          </Button>
          <Button 
            onClick={() => onConfirm(to, cc, subject, body)}
            className="evo-button-primary rounded-none h-12 px-8 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4 rotate-180" /> CONFIRMAR E ABRIR E-MAIL
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ListOrdersView({ 
  selectedDocEntry, 
  onBack, 
  onViewDetails, 
  title = "Pedidos de Compra", 
  fetchOrders = sapService.getPurchaseOrders, 
  fetchOrderDetail = sapService.getPurchaseOrder,
  userEmail = ""
}: { 
  key?: string, 
  selectedDocEntry: number | null, 
  onBack: () => void, 
  onViewDetails: (id: number) => void,
  title?: string,
  fetchOrders?: (options?: any) => Promise<any[]>,
  fetchOrderDetail?: (id: number) => Promise<any>,
  userEmail?: string
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [supplierEmail, setSupplierEmail] = useState('');

  const handleSendEmail = (to: string, cc: string, subject: string, body: string) => {
    const mailtoUrl = `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    setIsEmailModalOpen(false);
  };

  useEffect(() => {
    if (selectedDocEntry) {
      handleFetchOrderDetail(selectedDocEntry);
    } else {
      setSelectedOrder(null);
      setSupplierEmail('');
    }
  }, [selectedDocEntry]);

  const handleFetchOrderDetail = async (docEntry: number) => {
    setIsDetailLoading(true);
    try {
      const data = await fetchOrderDetail(docEntry);
      setSelectedOrder(data);
      
      // Fetch Supplier Email if CardCode exists
      if (data.CardCode) {
        try {
          const bp = await sapService.getBusinessPartner(data.CardCode);
          setSupplierEmail(bp.EmailAddress || '');
        } catch (e) {
          console.error('Erro ao buscar e-mail do fornecedor');
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar detalhes.');
      onBack();
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleFetchOrders = async (targetPage = page, searchTarget = appliedSearch, targetPageSize = pageSize) => {
    setIsLoading(true);
    try {
      const data = await fetchOrders({
        skip: targetPage * targetPageSize,
        top: targetPageSize,
        search: searchTarget
      });
      const orderList = Array.isArray(data) ? data : [];
      setOrders(orderList);
      setHasMore(orderList.length >= targetPageSize);
    } catch (error) {
      toast.error('Erro ao carregar registros.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    handleFetchOrders(0, appliedSearch, pageSize);
  }, [fetchOrders]);

  // Debounced auto-search across all pages in the SAP database
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed !== appliedSearch) {
        setPage(0);
        setAppliedSearch(trimmed);
        handleFetchOrders(0, trimmed, pageSize);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch, pageSize]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchTerm.trim();
    setPage(0);
    setAppliedSearch(trimmed);
    handleFetchOrders(0, trimmed, pageSize);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setAppliedSearch('');
    setPage(0);
    handleFetchOrders(0, '', pageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 0) return;
    setPage(newPage);
    handleFetchOrders(newPage, appliedSearch, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    handleFetchOrders(0, appliedSearch, newSize);
  };

  const filteredOrders = orders;

  if (selectedOrder || isDetailLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10"
      >
        <EmailQuotationModal 
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          onConfirm={handleSendEmail}
          defaultTo={supplierEmail}
          defaultCC={userEmail || ''}
          docEntry={selectedOrder?.DocEntry || 0}
          portalUrl={`${window.location.origin}${window.location.pathname}?portal=quotation&id=${selectedOrder?.DocEntry}`}
        />
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 text-evo-dark hover:bg-evo-teal/10 hover:text-evo-teal transition-all rounded-none">
            <X className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-evo-dark uppercase">
              {isDetailLoading ? 'CARREGANDO...' : `${title.includes('Solicita') ? 'Solicitação' : title.includes('Cota') ? 'Cotação' : title.includes('Adiantamento') ? 'Adiantamento' : 'Pedido'} #${selectedOrder?.DocNum || selectedOrder?.DocEntry}`}
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-teal">Protocolo Gerado via Service Layer</p>
          </div>
          {title === "Cotações de Compra" && selectedOrder && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?portal=quotation&id=${selectedOrder.DocEntry}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Link do portal copiado para o fornecedor!');
                }}
                className="rounded-none border-evo-dark text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <Paperclip className="w-3 h-3" /> Copiar Link Portal
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => setIsEmailModalOpen(true)}
                className="rounded-none bg-evo-teal hover:bg-evo-teal/90 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <LogOut className="w-3 h-3 rotate-180" /> Enviar por E-mail
              </Button>
            </div>
          )}
        </div>

        {isDetailLoading ? (
          <Card className="evo-card border-none p-24 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-evo-dark/20 animate-pulse">Sincronizando metadados do documento...</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-10">
              <Card className="evo-card border-none">
                <CardHeader className="bg-evo-dark px-8 py-4">
                  <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Itens do Documento</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-evo-bg/50">
                      <TableRow className="border-evo-bg hover:bg-transparent">
                        <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/50 px-8">Especificação</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/50 px-6">Qtd</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/50 px-6">Preço Unit.</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-evo-dark/50 px-6 text-right pr-8">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder?.DocumentLines?.map((line: any, idx: number) => (
                        <TableRow key={idx} className="border-evo-bg transition-colors hover:bg-evo-bg/40">
                          <TableCell className="px-8 py-5">
                            <p className="text-[11px] font-black uppercase tracking-tight text-evo-dark">{line.ItemDescription}</p>
                            <p className="text-[9px] font-bold text-evo-teal/60 tracking-widest">{line.ItemCode}</p>
                          </TableCell>
                          <TableCell className="px-6 py-5 font-bold text-xs text-evo-dark">{line.Quantity}</TableCell>
                          <TableCell className="px-6 py-5 text-xs font-bold text-evo-dark/60">R$ {line.Price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="px-6 py-5 text-right pr-8 font-black text-sm text-evo-dark">R$ {line.LineTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-10">
              <Card className="evo-card border-none">
                <CardHeader className="bg-evo-dark px-8 py-4">
                  <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Detalhes Gerais</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Parceiro / Solicitante</Label>
                    <p className="text-xs font-black uppercase tracking-tight text-evo-dark">{selectedOrder?.CardName || selectedOrder?.RequesterName || '-'}</p>
                    <p className="text-[9px] font-bold text-evo-teal tracking-[0.2em]">{selectedOrder?.CardCode || ''}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Data de Emissão</Label>
                    <p className="text-xs font-black text-evo-dark">{selectedOrder?.DocDate ? new Date(selectedOrder?.DocDate).toLocaleDateString('pt-BR') : '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40">Status do Registro</Label>
                    <div className="mt-2">
                      <Badge className={`rounded-none text-[9px] uppercase font-bold px-2 py-0.5 border-none ${selectedOrder?.DocumentStatus === 'bost_Open' || selectedOrder?.DocumentStatus === 'O' ? 'bg-evo-teal text-white' : 'bg-evo-dark text-white opacity-60'}`}>
                        {selectedOrder?.DocumentStatus === 'bost_Open' || selectedOrder?.DocumentStatus === 'O' ? 'Aberto' : 'Encerrado'}
                      </Badge>
                    </div>
                  </div>
                  <div className="pt-8 border-t border-evo-bg">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-evo-dark/40 block mb-2 text-center">Valor Bruto Total</Label>
                    <p className="text-3xl font-black text-evo-dark tracking-tighter text-center">R$ {selectedOrder?.DocTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </CardContent>
              </Card>

              {selectedOrder?.AttachmentEntry && (
                <div className="bg-white p-4 border border-evo-bg shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Paperclip className="w-5 h-5 text-evo-teal" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-evo-dark">Documentos Anexos</span>
                  </div>
                  <Badge variant="outline" className="rounded-none text-[9px] border-evo-bg font-bold">VINCULADO</Badge>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">{title}</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Visão analítica dos registros integrados</p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-evo-dark/30 w-4 h-4" />
            <Input 
              className="pl-12 h-11 rounded-none border-none bg-white shadow-sm text-xs font-bold uppercase tracking-widest placeholder:text-evo-dark/20" 
              placeholder="PESQUISAR Nº OU FORNECEDOR..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-11 rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white font-bold uppercase text-[10px] tracking-widest px-6 shadow-sm">
            Buscar
          </Button>
          {appliedSearch && (
            <Button type="button" onClick={handleClearSearch} variant="outline" className="h-11 rounded-none border-none bg-white shadow-sm font-bold uppercase text-[10px] tracking-widest px-4">
              Limpar
            </Button>
          )}
          <Button type="button" onClick={() => handleFetchOrders(page, appliedSearch, pageSize)} variant="outline" className="h-11 rounded-none border-none bg-white shadow-sm font-bold uppercase text-[10px] tracking-widest px-4 flex items-center gap-1.5" title="Recarregar">
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </form>
      </div>

      <Card className="evo-card border-none overflow-hidden">
        <Table>
          <TableHeader className="bg-evo-dark">
            <TableRow className="border-none hover:bg-transparent">
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Nº Documento</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Data Emissão</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Entidade SAP</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Valor Consolidado</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Situação</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6 text-right px-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-dark/20 animate-pulse">Estabelecendo conexão com Service Layer...</p>
                </TableCell>
              </TableRow>
            ) : filteredOrders.map((order) => (
              <TableRow 
                key={order.DocEntry} 
                className="border-evo-bg transition-colors hover:bg-evo-teal/5 group cursor-pointer"
                onClick={() => onViewDetails(order.DocEntry)}
              >
                <TableCell className="px-6 py-5 font-black text-xs text-evo-dark">#{order.DocNum || order.DocEntry}</TableCell>
                <TableCell className="px-6 py-5 text-[10px] font-bold uppercase text-evo-dark/60 tracking-wider">
                  {order.DocDate ? new Date(order.DocDate).toLocaleDateString('pt-BR') : '-'}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <p className="text-[10px] font-black uppercase tracking-tight text-evo-dark leading-tight group-hover:text-evo-teal transition-colors">{order.CardName || order.RequesterName || '-'}</p>
                  <p className="text-[9px] font-bold text-evo-dark/30 tracking-[0.2em]">{order.CardCode || ''}</p>
                </TableCell>
                <TableCell className="px-6 py-5 font-black text-sm text-evo-dark tracking-tighter">
                  R$ {order.DocTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <Badge className={`rounded-none text-[9px] uppercase font-bold px-2 py-0.5 border-none ${order.DocumentStatus === 'bost_Open' || order.DocumentStatus === 'O' ? 'bg-evo-teal text-white' : 'bg-evo-dark text-white opacity-60'}`}>
                    {order.DocumentStatus === 'bost_Open' || order.DocumentStatus === 'O' ? 'Aberto' : 'Encerrado'}
                  </Badge>
                </TableCell>
                <TableCell className="px-8 py-5 text-right">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-evo-dark opacity-20 group-hover:opacity-100 group-hover:text-evo-teal group-hover:bg-evo-teal/10 transition-all rounded-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails(order.DocEntry);
                    }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 italic">
                  Nenhum registro localizado sob os critérios informados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination bar */}
        <div className="p-4 bg-white border-t border-evo-bg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs font-bold text-evo-dark/60">
            <span>Página {page + 1} ({orders.length} registros nesta página)</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-black tracking-widest text-evo-dark/40">Exibir:</span>
              <select 
                value={pageSize} 
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="border border-evo-bg bg-white px-2 py-1 text-xs font-bold rounded-none focus:outline-none"
              >
                <option value={20}>20 por página</option>
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(0)} 
              disabled={page === 0 || isLoading}
              className="rounded-none h-9 px-3 text-[10px] uppercase font-black tracking-widest"
              title="Primeira Página"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(page - 1)} 
              disabled={page === 0 || isLoading}
              className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </Button>
            <span className="px-3 py-1 bg-evo-dark text-white text-xs font-black min-w-[32px] text-center">
              {page + 1}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handlePageChange(page + 1)} 
              disabled={!hasMore || orders.length < pageSize || isLoading}
              className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
            >
              Próxima <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ApprovalsView() {
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('W'); // W = Pending
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [remarks, setRemarks] = useState('');

  const getObjectTypeName = (type: string | number) => {
    const types: Record<string, string> = {
      '13': 'Nota Fiscal de Saída',
      '14': 'Devolução de Nota Fiscal de Saída',
      '15': 'Entrega',
      '16': 'Devolução de Mercadorias',
      '17': 'Pedido de Venda',
      '18': 'Nota Fiscal de Entrada',
      '19': 'Nota Fiscal de Entrada (Devolução)',
      '20': 'Recebimento de Mercadorias',
      '21': 'Devolução de Mercadorias (Compra)',
      '22': 'Pedido de Compra',
      '23': 'Cotação de Venda',
      '112': 'Rascunho',
      '1470000113': 'Solicitação de Compra',
      '540000006': 'Cotação de Compra'
    };
    return types[String(type)] || `Tipo ${type}`;
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      // Fetch all requests to calculate stats correctly
      const data = await sapService.getApprovalRequests();
      console.log('Approval Requests Data:', data);
      setAllRequests(data || []);
    } catch (error) {
      toast.error('Erro ao carregar solicitações de aprovação.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (code: number, status: 'ardApproved' | 'ardNotApproved') => {
    setIsActionLoading(true);
    try {
      await sapService.updateApprovalRequest(code, status, remarks || (status === 'ardApproved' ? 'Aprovado via Portal' : 'Recusado via Portal'));
      toast.success(status === 'ardApproved' ? 'Solicitação aprovada!' : 'Solicitação recusada.');
      setRemarks('');
      fetchRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message?.value || 'Erro ao processar ação.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const isStatus = (reqStatus: any, target: 'W' | 'Y' | 'N') => {
    if (!reqStatus) return false;
    const s = String(reqStatus);
    // W = Pending, Y = Approved, N = Rejected
    // Supporting various SAP status formats (W/Y/N, ard..., ars...)
    if (target === 'W') return s === 'W' || s === 'ardPending' || s === 'arsPending';
    if (target === 'Y') return s === 'Y' || s === 'ardApproved' || s === 'arsApproved' || s === 'P';
    if (target === 'N') return s === 'N' || s === 'ardNotApproved' || s === 'arsNotApproved';
    return false;
  };

  const stats = {
    pending: allRequests.filter(r => isStatus(r.Status, 'W')).length,
    approved: allRequests.filter(r => isStatus(r.Status, 'Y')).length,
    rejected: allRequests.filter(r => isStatus(r.Status, 'N')).length,
  };

  const filteredRequests = allRequests.filter(r => isStatus(r.Status, activeTab as any));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-10 max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">Centro de Aprovações</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Workflow de decisões estratégicas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="evo-card border-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/40">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-600 tracking-tighter">{stats.pending}</div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-evo-dark/20 mt-1">Aguardando definição</p>
          </CardContent>
        </Card>
        <Card className="evo-card border-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-evo-teal" />
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/40">Aprovadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-evo-teal tracking-tighter">{stats.approved}</div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-evo-dark/20 mt-1">Total de liberações</p>
          </CardContent>
        </Card>
        <Card className="evo-card border-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-evo-dark opacity-20" />
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-dark/40">Recusadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-evo-dark tracking-tighter opacity-40">{stats.rejected}</div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-evo-dark/20 mt-1">Operações canceladas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="W" onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-evo-bg rounded-none p-1 h-auto mb-6">
          <TabsTrigger value="W" className="rounded-none px-8 py-3 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-evo-dark data-[state=active]:text-white transition-all">Pendentes</TabsTrigger>
          <TabsTrigger value="Y" className="rounded-none px-8 py-3 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-evo-dark data-[state=active]:text-white transition-all">Aprovadas</TabsTrigger>
          <TabsTrigger value="N" className="rounded-none px-8 py-3 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-evo-dark data-[state=active]:text-white transition-all">Recusadas</TabsTrigger>
        </TabsList>

        <Card className="evo-card border-none overflow-hidden">
          <Table>
            <TableHeader className="bg-evo-dark">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6">ID Workflow</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Documento Origem</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Data Solicitação</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Contexto</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Comentários</TableHead>
                {activeTab === 'W' && <TableHead className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-6 text-right px-8">Ações Decisórias</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 animate-pulse">Carregando fila de processos...</TableCell>
                </TableRow>
              ) : filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 italic">Fila de trabalho vazia.</TableCell>
                </TableRow>
              ) : filteredRequests.map((req) => (
                <TableRow key={req.Code} className="border-evo-bg hover:bg-evo-teal/5 transition-colors group">
                  <TableCell className="px-6 py-5 font-black text-xs text-evo-dark">#{req.Code}</TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-tight text-evo-dark">{getObjectTypeName(req.ObjectType)}</span>
                      <span className="text-[9px] font-bold text-evo-teal/60 tracking-widest">Doc: {req.DocNum || req.DraftEntry || req.DocEntry}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-[10px] font-bold uppercase text-evo-dark/60 tracking-wider">
                    {new Date(req.CreationDate).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <p className="text-[10px] font-bold text-evo-dark/60">{req.DraftEntry ? `Rascunho: ${req.DraftEntry}` : '-'}</p>
                  </TableCell>
                  <TableCell className="px-6 py-5 max-w-xs truncate text-[10px] font-bold text-evo-dark/40 italic">
                    {req.Remarks || '-'}
                  </TableCell>
                  {activeTab === 'W' && (
                    <TableCell className="px-6 py-5 text-right">
                      <Sheet>
                        <SheetTrigger render={
                          <Button variant="outline" size="sm" className="h-9 rounded-none border-evo-bg uppercase text-[9px] font-black tracking-widest text-evo-teal hover:bg-evo-teal hover:text-white transition-all px-4">
                            Decidir
                          </Button>
                        } />
                        <SheetContent className="rounded-none sm:max-w-md">
                          <SheetHeader>
                            <SheetTitle className="uppercase tracking-tight font-black">Decisão de Workflow</SheetTitle>
                            <SheetDescription className="text-[10px] uppercase tracking-widest">Protocolo #{req.Code} - {getObjectTypeName(req.ObjectType)}</SheetDescription>
                          </SheetHeader>
                          <div className="space-y-8 py-10">
                            <div className="space-y-3">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 ml-1">Observações do Parecer</Label>
                              <textarea 
                                className="w-full min-h-[160px] p-5 bg-evo-bg/50 border border-evo-bg focus:border-evo-teal focus:ring-0 text-xs font-bold transition-all outline-none rounded-none placeholder:text-evo-dark/20"
                                placeholder="Descreva formalmente o motivo da sua decisão..."
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                              />
                            </div>
                            <div className="flex flex-col gap-4">
                              <Button 
                                className="h-14 bg-evo-teal hover:bg-evo-teal-dark rounded-none uppercase text-[11px] font-black tracking-widest text-white transition-all shadow-xl"
                                onClick={() => handleAction(req.Code, 'ardApproved')}
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? 'Sincronizando...' : 'Aprovar Documento'}
                              </Button>
                              <Button 
                                variant="outline"
                                className="h-14 border-evo-bg hover:bg-rose-50 hover:text-rose-600 rounded-none uppercase text-[11px] font-black tracking-widest text-evo-dark/40 transition-all"
                                onClick={() => handleAction(req.Code, 'ardNotApproved')}
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? 'Sincronizando...' : 'Recusar Operação'}
                              </Button>
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </Card>
      </Tabs>
    </motion.div>
  );
}

function QualityView() {
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [formData, setFormData] = useState({
    U_Atendimento: 0,
    U_Prazo: 0,
    U_Quantidade: 0,
    U_Documentacao: 0,
    U_Qualidade: 0,
    U_Status: 'AT',
    U_Leg: '1',
    U_Aviso_IPF: '',
    U_IPF: 0
  });

  const ipfValue = (Number(formData.U_Atendimento) || 0) + 
                   (Number(formData.U_Prazo) || 0) + 
                   (Number(formData.U_Quantidade) || 0) + 
                   (Number(formData.U_Documentacao) || 0) + 
                   (Number(formData.U_Qualidade) || 0);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const data = await sapService.getQualityRecords();
      setRecords(data || []);
    } catch (error) {
      toast.error('Erro ao carregar registros de qualidade.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitLoading(true);
    try {
      await sapService.createQualityRecord({
        ...formData,
        U_IPF: ipfValue,
        U_Aviso_IPF: ipfValue < 10 ? 'Fornecedor Crítico' : 'Desempenho Adequado'
      });
      toast.success('Avaliação de qualidade registrada com sucesso!');
      fetchRecords();
      setFormData({
        U_Atendimento: 0,
        U_Prazo: 0,
        U_Quantidade: 0,
        U_Documentacao: 0,
        U_Qualidade: 0,
        U_Status: 'AT',
        U_Leg: '1',
        U_Aviso_IPF: '',
        U_IPF: 0
      });
    } catch (error) {
      toast.error('Erro ao salvar avaliação.');
    } finally {
      setIsSubmitLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">Controle de Qualidade</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Avaliação de Performance de Fornecedores (IPF)</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={
            <Button className="evo-button-primary shadow-xl">Nova Avaliação</Button>
          } />
          <DialogContent className="max-w-2xl rounded-none">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-tight font-black">Registro de Qualidade (QLT_QLDADE)</DialogTitle>
              <CardDescription className="text-[10px] uppercase tracking-widest">Insira as pontuações para cálculo do IPF</CardDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Atendimento (0 a 2)</Label>
                  <Input 
                    type="number" min="0" max="2" 
                    value={formData.U_Atendimento} 
                    onChange={e => setFormData({...formData, U_Atendimento: parseInt(e.target.value) || 0})}
                    className="rounded-none h-11 border-evo-bg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Prazo (0 a 4)</Label>
                  <Input 
                    type="number" min="0" max="4" 
                    value={formData.U_Prazo} 
                    onChange={e => setFormData({...formData, U_Prazo: parseInt(e.target.value) || 0})}
                    className="rounded-none h-11 border-evo-bg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Quantidade (0 a 4)</Label>
                  <Input 
                    type="number" min="0" max="4" 
                    value={formData.U_Quantidade} 
                    onChange={e => setFormData({...formData, U_Quantidade: parseInt(e.target.value) || 0})}
                    className="rounded-none h-11 border-evo-bg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Documentação (0 a 4)</Label>
                  <Input 
                    type="number" min="0" max="4" 
                    value={formData.U_Documentacao} 
                    onChange={e => setFormData({...formData, U_Documentacao: parseInt(e.target.value) || 0})}
                    className="rounded-none h-11 border-evo-bg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Qualidade (0 a 8)</Label>
                  <Input 
                    type="number" min="0" max="8" 
                    value={formData.U_Qualidade} 
                    onChange={e => setFormData({...formData, U_Qualidade: parseInt(e.target.value) || 0})}
                    className="rounded-none h-11 border-evo-bg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Legenda</Label>
                  <Select value={formData.U_Leg} onValueChange={val => setFormData({...formData, U_Leg: val})}>
                    <SelectTrigger className="h-11 rounded-none border-evo-bg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="1">Excelente (1)</SelectItem>
                      <SelectItem value="2">Bom (2)</SelectItem>
                      <SelectItem value="3">Ruim (3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest">Status da Avaliação</Label>
                  <Select value={formData.U_Status} onValueChange={val => setFormData({...formData, U_Status: val})}>
                    <SelectTrigger className="h-11 rounded-none border-evo-bg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="AT">Atenção (AT)</SelectItem>
                      <SelectItem value="OK">Conforme (OK)</SelectItem>
                      <SelectItem value="RE">Reprovado (RE)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-6 bg-evo-dark text-white rounded-none flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">IPF Calculado</p>
                  <h3 className="text-3xl font-black tracking-tighter">{ipfValue.toFixed(2)}</h3>
                </div>
                {ipfValue < 10 && (
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-[0.1em]">Fornecedor Crítico</span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <DialogClose render={
                  <Button variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest">Cancelar</Button>
                } />
                <Button type="submit" disabled={isSubmitLoading} className="evo-button-primary rounded-none">
                  {isSubmitLoading ? 'Gravando...' : 'Gravar Avaliação'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="evo-card border-none overflow-hidden">
        <Table>
          <TableHeader className="bg-evo-dark">
            <TableRow className="border-none hover:bg-transparent">
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">ID</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">IPF</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Status</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Aviso</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Avaliação (At/Pr/Qt/Dc/Ql)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 animate-pulse">Consultando base SAP...</TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 italic">Sem registros de qualidade cadastrados.</TableCell>
              </TableRow>
            ) : records.map((rec, i) => (
              <TableRow key={i} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                <TableCell className="px-6 py-5 font-black text-xs text-evo-dark">#{rec.DocNum || rec.DocEntry || i+1}</TableCell>
                <TableCell className="px-6 py-5 font-black text-xl text-evo-teal tracking-tighter">{Number(rec.U_IPF || 0).toFixed(2)}</TableCell>
                <TableCell className="px-6 py-5">
                  <Badge className="bg-evo-dark text-white rounded-none text-[9px] font-black px-2 py-0.5">{rec.U_Status}</Badge>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <span className={`text-[10px] font-bold uppercase tracking-tight ${Number(rec.U_IPF || 0) < 10 ? 'text-rose-600' : 'text-evo-teal'}`}>
                    {rec.U_Aviso_IPF || (Number(rec.U_IPF || 0) < 10 ? 'Fornecedor Crítico' : 'Adequado')}
                  </span>
                </TableCell>
                <TableCell className="px-6 py-5 text-[10px] font-bold text-evo-dark/40 tracking-widest">
                  {rec.U_Atendimento}/{rec.U_Prazo}/{rec.U_Quantidade}/{rec.U_Documentacao}/{rec.U_Qualidade}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </motion.div>
  );
}

function MaintenanceView() {
  const [records, setRecords] = useState<any[]>([]);
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    U_ITEM: '',
    U_ItemName: '',
    U_QT: '',
    U_NumSerFab: '',
    U_DtInicia: new Date().toISOString().split('T')[0],
    U_TipoPrev: 'S',
    U_TipoCor: 'N',
    U_DtVenc: new Date().toISOString().split('T')[0],
    U_Insp: '',
    U_DescInsp: '',
    U_Aprov: '',
    U_DescAprov: '',
    U_Forn: '',
    U_DescForn: '',
    U_OBS: '',
    U_Fabricante: '',
    U_Modelo: '',
    U_CCusto: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [maint, calib] = await Promise.all([
        sapService.getMaintenanceRecords(),
        sapService.getCalibrationRecords()
      ]);
      setRecords(maint || []);
      setCalibrations(calib || []);
    } catch (error) {
      toast.error('Erro ao carregar dados de manutenção e calibração.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitLoading(true);
    try {
      await sapService.createMaintenanceRecord(formData);
      toast.success('Intervenção de manutenção registrada!');
      fetchData();
      setFormData({
        U_ITEM: '',
        U_ItemName: '',
        U_QT: '',
        U_NumSerFab: '',
        U_DtInicia: new Date().toISOString().split('T')[0],
        U_TipoPrev: 'S',
        U_TipoCor: 'N',
        U_DtVenc: new Date().toISOString().split('T')[0],
        U_Insp: '',
        U_DescInsp: '',
        U_Aprov: '',
        U_DescAprov: '',
        U_Forn: '',
        U_DescForn: '',
        U_OBS: '',
        U_Fabricante: '',
        U_Modelo: '',
        U_CCusto: ''
      });
    } catch (error) {
      toast.error('Erro ao salvar manutenção.');
    } finally {
      setIsSubmitLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">Manutenção & Calibração</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Controle de intervenções e calibração de equipamentos</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={
            <Button className="evo-button-primary shadow-xl">Registrar Intervenção</Button>
          } />
          <DialogContent className="max-w-4xl rounded-none">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-tight font-black">Nova Manutenção (QLT_CAB)</DialogTitle>
              <CardDescription className="text-[10px] uppercase tracking-widest">Cadastro de intervenção preventiva ou corretiva conforme padrão SAP</CardDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {/* Left Column */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Nº do Item</Label>
                      <Input value={formData.U_ITEM} onChange={e => setFormData({...formData, U_ITEM: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">QT</Label>
                      <Input value={formData.U_QT} onChange={e => setFormData({...formData, U_QT: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Nº Série Fabricante</Label>
                    <Input value={formData.U_NumSerFab} onChange={e => setFormData({...formData, U_NumSerFab: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                  </div>

                  <div className="flex gap-8 py-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="prev" checked={formData.U_TipoPrev === 'S'} onChange={e => setFormData({...formData, U_TipoPrev: e.target.checked ? 'S' : 'N'})} className="border-evo-dark" />
                      <Label htmlFor="prev" className="text-[9px] font-black uppercase tracking-tight">Preventiva</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="cor" checked={formData.U_TipoCor === 'S'} onChange={e => setFormData({...formData, U_TipoCor: e.target.checked ? 'S' : 'N'})} className="border-evo-dark" />
                      <Label htmlFor="cor" className="text-[9px] font-black uppercase tracking-tight">Corretiva</Label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Vencimento</Label>
                    <Input type="date" value={formData.U_DtVenc} onChange={e => setFormData({...formData, U_DtVenc: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1.5 col-span-1">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Cód. Inspecionado</Label>
                      <Input value={formData.U_Insp} onChange={e => setFormData({...formData, U_Insp: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Inspecionado Por</Label>
                      <Input value={formData.U_DescInsp} onChange={e => setFormData({...formData, U_DescInsp: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1.5 col-span-1">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Cód. Aprovador</Label>
                      <Input value={formData.U_Aprov} onChange={e => setFormData({...formData, U_Aprov: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Aprovado Por</Label>
                      <Input value={formData.U_DescAprov} onChange={e => setFormData({...formData, U_DescAprov: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Descrição do Equipamento</Label>
                    <Input value={formData.U_ItemName} onChange={e => setFormData({...formData, U_ItemName: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data da Manutenção</Label>
                    <Input type="date" value={formData.U_DtInicia} onChange={e => setFormData({...formData, U_DtInicia: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1.5 col-span-1">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Fornecedor</Label>
                      <Input value={formData.U_Forn} onChange={e => setFormData({...formData, U_Forn: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Nome do Fornecedor</Label>
                      <Input value={formData.U_DescForn} onChange={e => setFormData({...formData, U_DescForn: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Observação</Label>
                    <textarea value={formData.U_OBS} onChange={e => setFormData({...formData, U_OBS: e.target.value})} className="w-full rounded-none border border-evo-bg min-h-[80px] p-2 text-xs" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Fabricante</Label>
                      <Input value={formData.U_Fabricante} onChange={e => setFormData({...formData, U_Fabricante: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Modelo</Label>
                      <Input value={formData.U_Modelo} onChange={e => setFormData({...formData, U_Modelo: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Centro de Custo</Label>
                    <Input value={formData.U_CCusto} onChange={e => setFormData({...formData, U_CCusto: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <DialogClose render={
                  <Button variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest">Cancelar</Button>
                } />
                <Button type="submit" disabled={isSubmitLoading} className="evo-button-primary rounded-none">
                  {isSubmitLoading ? 'Gravando...' : 'Gravar Registro'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="maintenance">
        <TabsList className="bg-evo-bg p-1 h-auto mb-6 rounded-none">
          <TabsTrigger value="maintenance" className="rounded-none px-8 py-2 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-evo-dark data-[state=active]:text-white">Fila de Manutenções</TabsTrigger>
          <TabsTrigger value="calibration" className="rounded-none px-8 py-2 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-evo-dark data-[state=active]:text-white">Histórico de Calibração</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance">
          <Card className="evo-card border-none overflow-hidden">
            <Table>
              <TableHeader className="bg-evo-dark">
                <TableRow className="border-none hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Equipamento</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Tipo</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Vencimento</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Profissional</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Fornecedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 animate-pulse">Sincronizando com SAP Service Layer...</TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 italic">Sem manutenções agendadas.</TableCell>
                  </TableRow>
                ) : records.map((rec, i) => (
                  <TableRow key={i} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                    <TableCell className="px-6 py-5">
                      <p className="text-[11px] font-black uppercase tracking-tight text-evo-dark">{rec.U_ItemName || 'S/D'}</p>
                      <p className="text-[9px] font-bold text-evo-teal/60 tracking-widest">{rec.U_ITEM}</p>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge className={`rounded-none text-[9px] font-black ${rec.U_TipoPrev === 'S' ? 'bg-evo-teal text-white' : 'bg-rose-500 text-white'}`}>
                        {rec.U_TipoPrev === 'S' ? 'PREVENTIVA' : 'CORRETIVA'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-xs font-bold text-evo-dark">
                      {rec.U_DtVenc ? new Date(rec.U_DtVenc).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="px-6 py-5 text-[10px] font-bold uppercase tracking-tight text-evo-dark/60">{rec.U_Insp || '-'}</TableCell>
                    <TableCell className="px-6 py-5 text-[10px] font-bold uppercase tracking-tight text-evo-dark/60">{rec.U_Forn || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="calibration">
          <Card className="evo-card border-none overflow-hidden">
            <Table>
              <TableHeader className="bg-evo-dark">
                <TableRow className="border-none hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Data Calib.</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Certificado</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Laboratório</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Maior Erro</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 animate-pulse">Estabelecendo handshake SAP...</TableCell>
                  </TableRow>
                ) : calibrations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest text-evo-dark/20 italic">Sem registros de calibração localizados.</TableCell>
                  </TableRow>
                ) : calibrations.map((cal, i) => (
                  <TableRow key={i} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                    <TableCell className="px-6 py-4 text-xs font-bold">{cal.U_DtCalib ? new Date(cal.U_DtCalib).toLocaleDateString('pt-BR') : '-'}</TableCell>
                    <TableCell className="px-6 py-4 uppercase font-black text-[10px] tracking-widest text-evo-dark">{cal.U_Certificado}</TableCell>
                    <TableCell className="px-6 py-4 uppercase font-bold text-[10px] text-evo-dark/60">{cal.U_Lab}</TableCell>
                    <TableCell className="px-6 py-4 font-black text-rose-500">{cal.U_MajorErro || cal.U_MaiorErro || 0}%</TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge className={`rounded-none text-[8px] font-black uppercase tracking-widest ${cal.U_Status?.toLowerCase().includes('ok') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {cal.U_Status || 'OK'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function CostsView() {
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [rental, setRental] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  
  const [isPersDialogOpen, setIsPersDialogOpen] = useState(false);
  const [isRentalDialogOpen, setIsRentalDialogOpen] = useState(false);
  const [isCollabLookupOpen, setIsCollabLookupOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const initialPersForm = {
    U_DataInicial: new Date().toISOString().split('T')[0],
    U_DataFinal: new Date().toISOString().split('T')[0],
    U_Colaborador: '',
    U_VlNormal: 0,
    U_StandByRate: 0,
    U_QtdDiariasNormal: 0,
    U_QtdDiariasStandBy: 0,
    U_NoturnoNor: 0,
    U_NoturnoNob: 0,
    U_HExtraDiu: 0,
    U_HExtraNot: 0,
    U_Total: 0
  };

  const initialRentalForm = {
    U_DataInicial: new Date().toISOString().split('T')[0],
    U_DataFinal: new Date().toISOString().split('T')[0],
    U_Recurso: '',
    U_ValorBase: 0,
    U_HorasNor: 0,
    U_HorasNob: 0,
    U_HENor: 0,
    U_HENob: 0,
    U_Total: 0
  };

  const [formData, setFormData] = useState(initialPersForm);
  const [rentalFormData, setRentalFormData] = useState(initialRentalForm);

  // Computa o breakdown de receitas/custos fiel à planilha Excel e ao SAP
  const currentPersBreakdown = calculatePersonnelCost({
    valorNormal: formData.U_VlNormal,
    qtdDiariasNormal: formData.U_QtdDiariasNormal,
    qtdDiariasStandBy: formData.U_QtdDiariasStandBy,
    noturnoNormal: formData.U_NoturnoNor,
    noturnoNob: formData.U_NoturnoNob,
    hExtraDiurna: formData.U_HExtraDiu,
    hExtraNoturna: formData.U_HExtraNot
  });

  useEffect(() => {
    if (formData.U_StandByRate !== currentPersBreakdown.standByRate || formData.U_Total !== currentPersBreakdown.totalGeral) {
      setFormData(prev => ({ 
        ...prev, 
        U_StandByRate: currentPersBreakdown.standByRate, 
        U_Total: currentPersBreakdown.totalGeral 
      }));
    }
  }, [
    formData.U_VlNormal, 
    formData.U_QtdDiariasNormal, 
    formData.U_QtdDiariasStandBy, 
    formData.U_NoturnoNor, 
    formData.U_NoturnoNob, 
    formData.U_HExtraDiu, 
    formData.U_HExtraNot,
    currentPersBreakdown.standByRate,
    currentPersBreakdown.totalGeral
  ]);

  const calculateRentalTotal = () => {
    const total = (Number(rentalFormData.U_ValorBase) * (Number(rentalFormData.U_HorasNor) + Number(rentalFormData.U_HorasNob))) + 
                (Number(rentalFormData.U_HENor) * (Number(rentalFormData.U_ValorBase) * 1.5)) + 
                (Number(rentalFormData.U_HENob) * (Number(rentalFormData.U_ValorBase) * 2.0));
    setRentalFormData(prev => ({ ...prev, U_Total: total }));
  };

  useEffect(() => {
    calculateRentalTotal();
  }, [rentalFormData.U_ValorBase, rentalFormData.U_HorasNor, rentalFormData.U_HorasNob, rentalFormData.U_HENor, rentalFormData.U_HENob]);

  useEffect(() => {
    fetchCosts();
  }, []);

  const fetchCosts = async () => {
    setIsLoading(true);
    try {
      const [pers, rent] = await Promise.all([
        sapService.getPersonnelCosts(),
        sapService.getRentalCosts()
      ]);
      setPersonnel(pers || []);
      setRental(rent || []);
    } catch (error) {
      toast.error('Erro ao carregar dados financeiros.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitLoading(true);
    try {
      if (editingId) {
        await sapService.updatePersonnelCost(editingId, formData);
        toast.success('Receita de pessoal atualizada com sucesso!');
      } else {
        await sapService.createPersonnelCost(formData);
        toast.success('Receita de pessoal registrada com sucesso!');
      }
      fetchCosts();
      setIsPersDialogOpen(false);
      setFormData(initialPersForm);
      setEditingId(null);
    } catch (error) {
      toast.error('Erro ao salvar registro de receita.');
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleRentalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitLoading(true);
    try {
      if (editingId) {
        await sapService.updateRentalCost(editingId, rentalFormData);
        toast.success('Receita de locação atualizada com sucesso!');
      } else {
        await sapService.createRentalCost(rentalFormData);
        toast.success('Receita de locação registrada com sucesso!');
      }
      fetchCosts();
      setIsRentalDialogOpen(false);
      setRentalFormData(initialRentalForm);
      setEditingId(null);
    } catch (error) {
      toast.error('Erro ao salvar registro de locação.');
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleEditPers = (item: any) => {
    setFormData({
      U_DataInicial: item.U_DataInicial?.split('T')[0] || '',
      U_DataFinal: item.U_DataFinal?.split('T')[0] || '',
      U_Colaborador: item.U_Colaborador || '',
      U_VlNormal: item.U_VlNormal || 0,
      U_StandByRate: item.U_StandByRate || 0,
      U_QtdDiariasNormal: item.U_QtdDiariasNormal || 0,
      U_QtdDiariasStandBy: item.U_QtdDiariasStandBy || 0,
      U_NoturnoNor: item.U_NoturnoNor || 0,
      U_NoturnoNob: item.U_NoturnoNob || 0,
      U_HExtraDiu: item.U_HExtraDiu || 0,
      U_HExtraNot: item.U_HExtraNot || 0,
      U_Total: item.U_Total || 0
    });
    setEditingId(item.DocEntry);
    setIsPersDialogOpen(true);
  };

  const handleEditRental = (item: any) => {
    setRentalFormData({
      U_DataInicial: item.U_DataInicial?.split('T')[0] || '',
      U_DataFinal: item.U_DataFinal?.split('T')[0] || '',
      U_Recurso: item.U_Recurso || '',
      U_ValorBase: item.U_ValorBase || 0,
      U_HorasNor: item.U_HorasNor || 0,
      U_HorasNob: item.U_HorasNob || 0,
      U_HENor: item.U_HENor || 0,
      U_HENob: item.U_HENob || 0,
      U_Total: item.U_Total || 0
    });
    setEditingId(item.DocEntry);
    setIsRentalDialogOpen(true);
  };

  const handleDeletePers = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de pessoal?')) return;
    try {
      await sapService.deletePersonnelCost(id);
      toast.success('Registro excluído com sucesso');
      fetchCosts();
    } catch (error) {
      toast.error('Erro ao excluir registro');
    }
  };

  const handleDeleteRental = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de locação?')) return;
    try {
      await sapService.deleteRentalCost(id);
      toast.success('Registro excluído com sucesso');
      fetchCosts();
    } catch (error) {
      toast.error('Erro ao excluir registro');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">Gestão de Receitas</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Controle financeiro operacional de receitas de colaboradores e locações</p>
        </div>

        <div className="flex gap-4">
          <Dialog open={isPersDialogOpen} onOpenChange={open => {
            setIsPersDialogOpen(open);
            if (!open) {
              setEditingId(null);
              setFormData(initialPersForm);
            }
          }}>
            <DialogTrigger render={<Button className="evo-button-primary shadow-xl" onClick={() => {
                setEditingId(null);
                setFormData(initialPersForm);
              }} />}>Nova Receita Pessoal</DialogTrigger>
            <DialogContent className="max-w-4xl rounded-none border-evo-teal/20 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight font-black">{editingId ? 'Editar Receita Pessoal' : 'Registro de Receita de Pessoal (CustosPessoal)'}</DialogTitle>
                <CardDescription className="text-[10px] uppercase tracking-widest">Lançamento de diárias e horas extras para controle de projetos</CardDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Colaborador (Código CO)</Label>
                      <div className="flex gap-1">
                        <Input 
                          value={formData.U_Colaborador} 
                          onChange={e => setFormData({...formData, U_Colaborador: e.target.value})} 
                          className="rounded-none h-10 border-evo-bg flex-1 font-bold" 
                          placeholder="Código ou Nome do Colaborador (Ex: CO...)" 
                          required
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="rounded-none h-10 w-10 p-0 border-evo-bg"
                          onClick={() => setIsCollabLookupOpen(true)}
                          title="Listar Parceiros CO"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>

                      <LookupDialog 
                        isOpen={isCollabLookupOpen}
                        onClose={() => setIsCollabLookupOpen(false)}
                        title="Pesquisar Colaborador (CO)"
                        placeholder="Filtrar por nome ou código..."
                        onSelect={(collab: any) => {
                          setFormData({ ...formData, U_Colaborador: collab.CardName || collab.CardCode });
                          setIsCollabLookupOpen(false);
                        }}
                        searchFn={sapService.getCollaborators}
                        renderItem={(collab: any) => (
                          <div className="flex justify-between items-center w-full">
                            <span className="font-black text-xs text-evo-dark">{collab.CardCode}</span>
                            <span className="text-[11px] font-bold text-evo-dark/70 uppercase truncate max-w-[280px]">{collab.CardName}</span>
                          </div>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Inicial</Label>
                        <Input type="date" value={formData.U_DataInicial} onChange={e => setFormData({...formData, U_DataInicial: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Final</Label>
                        <Input type="date" value={formData.U_DataFinal} onChange={e => setFormData({...formData, U_DataFinal: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-evo-bg pt-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Valor Normal (R$)</Label>
                        <Input type="number" step="0.01" value={formData.U_VlNormal} onChange={e => setFormData({...formData, U_VlNormal: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Qtd Diárias (Normal)</Label>
                        <Input type="number" step="0.5" value={formData.U_QtdDiariasNormal} onChange={e => setFormData({...formData, U_QtdDiariasNormal: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5 opacity-60">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Stand-by Rate (R$) - Automático</Label>
                        <Input type="number" step="0.01" value={formData.U_StandByRate} readOnly className="rounded-none h-10 border-evo-bg bg-evo-bg/50 cursor-not-allowed" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Qtd Diárias (Stand-by)</Label>
                        <Input type="number" step="0.5" value={formData.U_QtdDiariasStandBy} onChange={e => setFormData({...formData, U_QtdDiariasStandBy: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Noturno Normal</Label>
                        <Input type="number" value={formData.U_NoturnoNor} onChange={e => setFormData({...formData, U_NoturnoNor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Noturno Nob</Label>
                        <Input type="number" value={formData.U_NoturnoNob} onChange={e => setFormData({...formData, U_NoturnoNob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Diurna</Label>
                        <Input type="number" value={formData.U_HExtraDiu} onChange={e => setFormData({...formData, U_HExtraDiu: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Noturna</Label>
                        <Input type="number" value={formData.U_HExtraNot} onChange={e => setFormData({...formData, U_HExtraNot: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>

                    <div className="p-4 bg-evo-dark text-white rounded-none mt-2 space-y-2 border-l-4 border-evo-teal">
                      <div className="flex justify-between items-center text-[10px] uppercase text-white/60 font-semibold border-b border-white/10 pb-1">
                        <span>Detalhamento dos Cálculos (Excel / SAP)</span>
                        <span>Multiplicadores</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <div className="flex justify-between text-white/80">
                          <span>Diárias Normais:</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalDiariasNormal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>Diárias Stand-by (50%):</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalDiariasStandBy.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>Noturno Normal (8%):</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalNoturnoNormal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>Noturno Dobrado:</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalNoturnoNob.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>H.E. Diurna (1.5x):</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalHExtraDiurna.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>H.E. Noturna (1.5x + 8%):</span>
                          <span className="font-mono font-bold">R$ {currentPersBreakdown.totalHExtraNoturna.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Total Geral Previsto</p>
                          <h3 className="text-2xl font-black tracking-tighter text-evo-teal">
                            R$ {currentPersBreakdown.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </h3>
                        </div>
                        <div className="text-right text-[9px] text-white/60">
                          <div>Taxas extras: <span className="font-mono text-teal-300 font-bold">R$ {currentPersBreakdown.taxasNoturnas.toFixed(2)}</span></div>
                          <div>Valor Base/h: <span className="font-mono text-white/90">R$ {currentPersBreakdown.valorHora.toFixed(2)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest" />}>Cancelar</DialogClose>
                  <Button type="submit" disabled={isSubmitLoading} className="evo-button-primary rounded-none px-10">
                    {isSubmitLoading ? 'Gravando...' : editingId ? 'Atualizar Receita' : 'Gravar Receita'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isRentalDialogOpen} onOpenChange={open => {
            setIsRentalDialogOpen(open);
            if (!open) {
              setEditingId(null);
              setRentalFormData(initialRentalForm);
            }
          }}>
            <DialogTrigger render={<Button variant="outline" className="rounded-none h-12 uppercase text-[10px] font-black tracking-widest border-evo-dark hover:bg-evo-dark hover:text-white transition-all px-8" onClick={() => {
                setEditingId(null);
                setRentalFormData(initialRentalForm);
              }} />}>Nova Receita Locação</DialogTrigger>
            <DialogContent className="max-w-4xl rounded-none border-evo-teal/20 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight font-black">{editingId ? 'Editar Receita de Locação' : 'Registro de Receita de Locação (CustosLoc)'}</DialogTitle>
                <CardDescription className="text-[10px] uppercase tracking-widest">Controle de receitas de equipamentos e recursos externos</CardDescription>
              </DialogHeader>
              <form onSubmit={handleRentalSubmit} className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Equipamento / Recurso</Label>
                      <Input value={rentalFormData.U_Recurso} onChange={e => setRentalFormData({...rentalFormData, U_Recurso: e.target.value})} className="rounded-none h-10 border-evo-bg" placeholder="Descrição do Recurso" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Inicial</Label>
                        <Input type="date" value={rentalFormData.U_DataInicial} onChange={e => setRentalFormData({...rentalFormData, U_DataInicial: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Final</Label>
                        <Input type="date" value={rentalFormData.U_DataFinal} onChange={e => setRentalFormData({...rentalFormData, U_DataFinal: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                    <div className="space-y-1.5 border-t border-evo-bg pt-4">
                      <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Valor Base (R$)</Label>
                      <Input type="number" step="0.01" value={rentalFormData.U_ValorBase} onChange={e => setRentalFormData({...rentalFormData, U_ValorBase: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Horas Normais</Label>
                        <Input type="number" value={rentalFormData.U_HorasNor} onChange={e => setRentalFormData({...rentalFormData, U_HorasNor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Horas Nob</Label>
                        <Input type="number" value={rentalFormData.U_HorasNob} onChange={e => setRentalFormData({...rentalFormData, U_HorasNob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Normal</Label>
                        <Input type="number" value={rentalFormData.U_HENor} onChange={e => setRentalFormData({...rentalFormData, U_HENor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Nob</Label>
                        <Input type="number" value={rentalFormData.U_HENob} onChange={e => setRentalFormData({...rentalFormData, U_HENob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                      </div>
                    </div>

                    <div className="p-6 bg-evo-dark text-white rounded-none mt-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total Receita Locação</p>
                      <h3 className="text-3xl font-black tracking-tighter text-evo-teal">
                        R$ {rentalFormData.U_Total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest" />}>Cancelar</DialogClose>
                  <Button type="submit" disabled={isSubmitLoading} className="evo-button-primary rounded-none px-10">
                    {isSubmitLoading ? 'Gravando...' : editingId ? 'Atualizar Locação' : 'Gravar Locação'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <Card className="evo-card border-none overflow-hidden shadow-lg">
          <CardHeader className="bg-evo-dark px-8 py-4 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Receita de Pessoal (Equipes)</CardTitle>
            <Badge className="bg-evo-teal text-white border-none text-[8px] font-black uppercase tracking-wider">{personnel.length} Registros</Badge>
          </CardHeader>
          <Table>
            <TableHeader className="bg-evo-bg/50">
              <TableRow className="border-evo-bg hover:bg-transparent">
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Data</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Colaborador</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Total (R$)</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 opacity-30 animate-pulse">Buscando...</TableCell></TableRow>
              ) : personnel.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-[9px] font-black uppercase tracking-widest opacity-20">Sem registros de pessoal</TableCell></TableRow>
              ) : personnel.map((p, i) => (
                <TableRow key={i} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                  <TableCell className="px-6 py-4 text-[10px] font-bold">{p.U_DataInicial ? new Date(p.U_DataInicial).toLocaleDateString('pt-BR') : '-'}</TableCell>
                  <TableCell className="px-6 py-4 uppercase font-black text-[10px] text-evo-dark">{p.U_Colaborador || p.U_Colaborador_Nome}</TableCell>
                  <TableCell className="px-6 py-4 font-black text-xs text-evo-teal">R$ {Number(p.U_Total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleEditPers(p)} className="p-2 hover:bg-evo-bg text-evo-dark/40 hover:text-evo-teal transition-colors rounded-full" title="Editar">
                         <Edit className="w-3.5 h-3.5" />
                       </button>
                       <button onClick={() => handleDeletePers(p.DocEntry)} className="p-2 hover:bg-red-50 text-evo-dark/40 hover:text-red-500 transition-colors rounded-full" title="Excluir">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="evo-card border-none overflow-hidden shadow-lg">
          <CardHeader className="bg-evo-dark px-8 py-4 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Receita de Locação (Equip.)</CardTitle>
            <Badge className="bg-blue-500 text-white border-none text-[8px] font-black uppercase tracking-wider">{rental.length} Registros</Badge>
          </CardHeader>
          <Table>
            <TableHeader className="bg-evo-bg/50">
              <TableRow className="border-evo-bg hover:bg-transparent">
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Recurso/Locado</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Valor Base</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Total (R$)</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest px-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 opacity-30 animate-pulse">Buscando...</TableCell></TableRow>
              ) : rental.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-[9px] font-black uppercase tracking-widest opacity-20">Sem registros de locação</TableCell></TableRow>
              ) : rental.map((r, i) => (
                <TableRow key={i} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                  <TableCell className="px-6 py-4 uppercase font-black text-[10px] text-evo-dark">{r.U_Recurso || 'LOCAÇÃO EQUIP.'}</TableCell>
                  <TableCell className="px-6 py-4 text-[10px] font-bold text-evo-dark/40">R$ {Number(r.U_ValorBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="px-6 py-4 font-black text-xs text-evo-teal">R$ {Number(r.U_Total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleEditRental(r)} className="p-2 hover:bg-evo-bg text-evo-dark/40 hover:text-evo-teal transition-colors rounded-full" title="Editar">
                         <Edit className="w-3.5 h-3.5" />
                       </button>
                       <button onClick={() => handleDeleteRental(r.DocEntry)} className="p-2 hover:bg-red-50 text-evo-dark/40 hover:text-red-500 transition-colors rounded-full" title="Excluir">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </motion.div>
  );
}

function QuotationsView({
  initialDocEntry,
  onClearSelection,
  onOpenMeasurements
}: {
  key?: string;
  initialDocEntry?: number | null;
  onClearSelection?: () => void;
  onOpenMeasurements?: () => void;
} = {}) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(true);

  // States for Costs sub-modals
  const [isPersCostModalOpen, setIsPersCostModalOpen] = useState(false);
  const [isRentalCostModalOpen, setIsRentalCostModalOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [isItemLookupOpen, setIsItemLookupOpen] = useState(false);
  const [isBPLookupOpen, setIsBPLookupOpen] = useState(false);
  const [lineIndexForLookup, setLineIndexForLookup] = useState<number | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  // Effect to auto-open if initialDocEntry is passed
  useEffect(() => {
    if (initialDocEntry) {
      const openTarget = async () => {
        try {
          const quote = await sapService.getQuotation(initialDocEntry);
          if (quote) {
            handleEdit(quote);
          }
        } catch {
          // If not found in API, check in loaded list or fallback
          const matched = quotations.find(q => q.DocEntry === initialDocEntry || q.DocNum === initialDocEntry);
          if (matched) {
            handleEdit(matched);
          }
        }
      };
      openTarget();
    }
  }, [initialDocEntry]);

  const fetchQuotations = async (targetPage = page, searchTarget = appliedSearch, targetPageSize = pageSize) => {
    setIsLoading(true);
    try {
      const data = await sapService.getQuotations({
        skip: targetPage * targetPageSize,
        top: targetPageSize,
        search: searchTarget
      });
      const quoteList = Array.isArray(data) ? data : [];
      setQuotations(quoteList);
      setHasMore(quoteList.length >= targetPageSize);
    } catch (error) {
      toast.error('Erro ao buscar cotações.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuxData = async () => {
    try {
      const projData = await sapService.getProjects();
      setProjects(projData || []);
    } catch (e) {
      console.warn('Erro ao carregar projetos:', e);
    }
  };

  useEffect(() => {
    setPage(0);
    fetchQuotations(0, appliedSearch, pageSize);
    loadAuxData();
  }, []);

  // Debounced auto-search across all pages in the SAP database
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed !== appliedSearch) {
        setPage(0);
        setAppliedSearch(trimmed);
        fetchQuotations(0, trimmed, pageSize);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch, pageSize]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchTerm.trim();
    setPage(0);
    setAppliedSearch(trimmed);
    fetchQuotations(0, trimmed, pageSize);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setAppliedSearch('');
    setPage(0);
    fetchQuotations(0, '', pageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 0) return;
    setPage(newPage);
    fetchQuotations(newPage, appliedSearch, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    fetchQuotations(0, appliedSearch, newSize);
  };

  const filteredQuotations = quotations.filter(q => {
    const isOpen = q.DocumentStatus === 'bost_Open' || q.DocumentStatus === 'O';
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'open' && isOpen) || 
                         (statusFilter === 'closed' && !isOpen);
    return matchesStatus;
  });

  const handleCreateNew = () => {
    setSelectedQuote({
      CardCode: '',
      CardName: '',
      DocDueDate: new Date().toISOString().split('T')[0],
      U_Projeto: '',
      NumAtCard: '',
      Comments: '',
      DocumentLines: [
        { ItemCode: '', Quantity: 1, Price: 0, ProjectCode: '', U_nITEM: '', U_ItemLoc: '' }
      ]
    });
    setIsModalOpen(true);
  };

  const handleEdit = async (quote: any) => {
    try {
      const fullQuote = await sapService.getQuotation(quote.DocEntry);
      setSelectedQuote(fullQuote);
      setIsModalOpen(true);
    } catch (error) {
      toast.error('Erro ao carregar detalhes da cotação.');
    }
  };

  const handleSaveQuotation = async () => {
    if (!selectedQuote) return;
    setIsOrderLoading(true);
    try {
      let savedQuote;
      if (selectedQuote.DocEntry) {
        await sapService.updateQuotation(selectedQuote.DocEntry, selectedQuote);
        savedQuote = await sapService.getQuotation(selectedQuote.DocEntry);
        toast.success('Cotação atualizada com sucesso!');
      } else {
        savedQuote = await sapService.createQuotation(selectedQuote);
        toast.success('Cotação criada com sucesso!');
      }
      
      // Attempt automatic conversion to order after saving if quote is valid
      if (savedQuote && savedQuote.DocEntry) {
        try {
          toast.info('Iniciando geração automática do Pedido de Venda...');
          await sapService.createOrderFromQuotation(savedQuote);
          toast.success('Pedido de Venda criado e Cotação encerrada com sucesso!');
        } catch (orderErr) {
          console.warn('Erro na conversão automática para Pedido de Venda:', orderErr);
          toast.warning('Cotação salva, porém não foi possível converter em Pedido automaticamente.');
        }
      }
      
      fetchQuotations();
      setIsModalOpen(false);
    } catch (error) {
      toast.error('Erro ao salvar cotação.');
    } finally {
      setIsOrderLoading(false);
    }
  };

  const handleGenerateOrder = async () => {
    if (!selectedQuote?.DocEntry) return;
    setIsOrderLoading(true);
    try {
      await sapService.createOrderFromQuotation(selectedQuote);
      toast.success('Pedido de Venda criado com sucesso! Cotação encerrada.');
      fetchQuotations();
      setIsModalOpen(false);
    } catch (error) {
      toast.error('Erro ao gerar pedido.');
    } finally {
      setIsOrderLoading(false);
    }
  };

  const handleAddLine = () => {
    setSelectedQuote({
      ...selectedQuote,
      DocumentLines: [
        ...selectedQuote.DocumentLines,
        { ItemCode: '', Quantity: 1, Price: 0, ProjectCode: selectedQuote.U_Projeto || '', U_nITEM: '', U_ItemLoc: '' }
      ]
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...selectedQuote.DocumentLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setSelectedQuote({ ...selectedQuote, DocumentLines: newLines });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 border-l-4 border-evo-teal shadow-sm gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-evo-dark uppercase">Cotações de Venda</h2>
          <p className="text-[10px] font-bold text-evo-dark/40 uppercase tracking-[0.3em] mt-1">Gestão de ofertas, WO, PO cliente e anexos de comprovação</p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-evo-dark/20" />
            <Input 
              placeholder="BUSCAR CLIENTE, WO, PO OU Nº..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-none border-evo-bg focus:border-evo-teal uppercase text-[10px] font-bold tracking-widest h-12"
            />
          </div>
          <Button type="submit" className="h-12 rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white font-bold uppercase text-[10px] tracking-widest px-6 shadow-sm">
            Buscar
          </Button>
          {appliedSearch && (
            <Button type="button" onClick={handleClearSearch} variant="outline" className="h-12 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4">
              Limpar
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 rounded-none border-evo-bg h-12 uppercase text-[10px] font-bold tracking-widest">
              {statusFilter === 'all' ? 'TODOS STATUS' : statusFilter === 'open' ? 'ABERTAS' : 'FECHADAS'}
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all" className="uppercase text-[10px] font-bold">TODOS STATUS</SelectItem>
              <SelectItem value="open" className="uppercase text-[10px] font-bold">ABERTAS</SelectItem>
              <SelectItem value="closed" className="uppercase text-[10px] font-bold">FECHADAS</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => fetchQuotations(page, appliedSearch, pageSize)} variant="outline" className="h-12 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4 flex items-center gap-1.5" title="Recarregar">
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {onOpenMeasurements && (
            <Button 
              type="button" 
              onClick={onOpenMeasurements} 
              variant="outline" 
              className="h-12 rounded-none border-evo-teal text-evo-teal hover:bg-evo-teal hover:text-white font-black uppercase text-[10px] tracking-widest px-6 shadow-sm flex items-center gap-2"
            >
              <Ruler className="w-4 h-4" />
              Resumo Medições
            </Button>
          )}
          <Button type="button" onClick={handleCreateNew} className="evo-button-primary shadow-xl h-12 px-8">Nova Cotação</Button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="evo-card border-none overflow-hidden">
          <Table>
            <TableHeader className="bg-evo-dark">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Nº Cotação</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">WO (Projeto)</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">PO Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Cód. Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Nome do Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Vencimento</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Total</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6">Status</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-20 opacity-30 animate-pulse uppercase text-[10px] font-black tracking-widest">Sincronizando com SAP...</TableCell></TableRow>
              ) : filteredQuotations.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-20 text-[10px] font-black uppercase tracking-widest opacity-20">Nenhuma cotação encontrada</TableCell></TableRow>
              ) : filteredQuotations.map((q) => {
                const wo = q.U_Projeto || q.Project || q.ProjectCode || (q.DocumentLines && q.DocumentLines[0]?.ProjectCode) || '-';
                const poCliente = q.NumAtCard || q.U_POCliente || '-';
                return (
                  <TableRow key={q.DocEntry} className="border-evo-bg hover:bg-evo-teal/5 transition-colors group">
                    <TableCell className="px-6 py-5 font-black text-xs text-evo-dark">{q.DocNum || q.DocEntry}</TableCell>
                    <TableCell className="px-6 py-5">
                      <span className="inline-flex items-center gap-1 font-black text-[10px] text-evo-teal bg-evo-teal/10 px-2 py-0.5 border border-evo-teal/20 uppercase tracking-tight">
                        {wo}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-5 font-black text-[10px] text-evo-dark uppercase">
                      {poCliente !== '-' ? (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 border border-blue-200">
                          {poCliente}
                        </span>
                      ) : (
                        <span className="text-evo-dark/30">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-5 font-bold text-[10px] uppercase">{q.CardCode}</TableCell>
                    <TableCell className="px-6 py-5 font-bold text-[10px] uppercase truncate max-w-[200px]">{q.CardName || "N/A"}</TableCell>
                    <TableCell className="px-6 py-5 text-[10px] font-bold">{q.DocDueDate ? new Date(q.DocDueDate).toLocaleDateString('pt-BR') : '-'}</TableCell>
                    <TableCell className="px-6 py-5 font-black text-xs text-evo-teal">R$ {Number(q.DocTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge className={`rounded-none text-[8px] font-black uppercase tracking-widest ${q.DocumentStatus === 'bost_Open' || q.DocumentStatus === 'O' ? 'bg-evo-teal/10 text-evo-teal' : 'bg-gray-100 text-gray-500'}`}>
                        {q.DocumentStatus === 'bost_Open' || q.DocumentStatus === 'O' ? 'Aberta' : 'Fechada'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-right">
                      <button onClick={() => handleEdit(q)} className="p-3 hover:bg-evo-dark hover:text-white transition-all rounded-none border border-evo-bg" title="Editar/Visualizar">
                        <Edit className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination bar */}
          <div className="p-4 bg-white border-t border-evo-bg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs font-bold text-evo-dark/60">
              <span>Página {page + 1} ({quotations.length} cotações nesta página)</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-evo-dark/40">Exibir:</span>
                <select 
                  value={pageSize} 
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="border border-evo-bg bg-white px-2 py-1 text-xs font-bold rounded-none focus:outline-none"
                >
                  <option value={20}>20 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(0)} 
                disabled={page === 0 || isLoading}
                className="rounded-none h-9 px-3 text-[10px] uppercase font-black tracking-widest"
                title="Primeira Página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(page - 1)} 
                disabled={page === 0 || isLoading}
                className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </Button>
              <span className="px-3 py-1 bg-evo-dark text-white text-xs font-black min-w-[32px] text-center">
                {page + 1}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(page + 1)} 
                disabled={!hasMore || quotations.length < pageSize || isLoading}
                className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
              >
                Próxima <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Quotation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 rounded-none overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-evo-dark p-8 text-white relative shrink-0">
            <div className="absolute top-0 right-0 p-6 flex items-center gap-4 z-10">
              {selectedQuote?.DocEntry && (selectedQuote.DocumentStatus === 'bost_Open' || selectedQuote.DocumentStatus === 'O') && (
                <Button 
                  onClick={handleGenerateOrder} 
                  disabled={isOrderLoading}
                  className="bg-evo-teal hover:bg-evo-teal/80 text-evo-dark font-black uppercase text-[10px] tracking-widest px-8 rounded-none h-10 shadow-lg"
                >
                  {isOrderLoading ? 'Processando...' : 'Gerar Pedido (Copy To)'}
                  <Zap className="ml-2 w-3 h-3 text-evo-dark" />
                </Button>
              )}
              <DialogClose render={<Button variant="ghost" className="text-white hover:bg-white/10 p-2 h-10 w-10 flex items-center justify-center rounded-none" />}>
                <X className="w-6 h-6" />
              </DialogClose>
            </div>
            <DialogTitle className="text-3xl font-black tracking-tighter uppercase pr-48">
              {selectedQuote?.DocEntry ? `Cotação #${selectedQuote.DocNum || selectedQuote.DocEntry}` : 'Nova Cotação'}
            </DialogTitle>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.4em] mt-1">Detalhamento, WO, PO do Cliente, Itens e Comprovações em Anexo</p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-10 bg-evo-bg/30">
            {selectedQuote && (
              <div className="space-y-8">
                {/* Header Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 bg-white p-8 border border-evo-bg shadow-sm">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Código do Cliente</label>
                    <div className="flex gap-1">
                      <Input 
                        value={selectedQuote.CardCode}
                        onChange={(e) => setSelectedQuote({ ...selectedQuote, CardCode: e.target.value })}
                        className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold flex-1"
                        placeholder="EX: C20000"
                      />
                      <Button 
                        type="button"
                        variant="outline"
                        className="rounded-none h-11 w-11 p-0 border-2 border-evo-dark/10 shrink-0"
                        onClick={() => setIsBPLookupOpen(true)}
                        title="Buscar Cliente"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Nome do Cliente</label>
                    <Input 
                      value={selectedQuote.CardName || ""}
                      onChange={(e) => setSelectedQuote({ ...selectedQuote, CardName: e.target.value })}
                      placeholder="Nome do Cliente"
                      className="rounded-none border-2 border-evo-dark/10 h-11 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">WO (Projeto)</label>
                    <Input 
                      value={selectedQuote.U_Projeto || selectedQuote.Project || selectedQuote.ProjectCode || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedQuote({ 
                          ...selectedQuote, 
                          U_Projeto: val,
                          Project: val,
                          ProjectCode: val
                        });
                      }}
                      placeholder="EX: WO 2040 OU PROJETO"
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold text-evo-teal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">PO do Cliente</label>
                    <Input 
                      value={selectedQuote.NumAtCard || selectedQuote.U_POCliente || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedQuote({ 
                          ...selectedQuote, 
                          NumAtCard: val,
                          U_POCliente: val
                        });
                      }}
                      placeholder="EX: PO-987654"
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold text-blue-700"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Data de Vencimento</label>
                    <Input 
                      type="date"
                      value={selectedQuote.DocDueDate ? selectedQuote.DocDueDate.split('T')[0] : ""}
                      onChange={(e) => setSelectedQuote({ ...selectedQuote, DocDueDate: e.target.value })}
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 font-bold"
                    />
                  </div>
                </div>

                {/* Section for Attachments (PO Cliente, Cotação Qualitech, Email de Aprovação) */}
                <DocumentAttachmentsSection 
                  documentType="quotation" 
                  docId={selectedQuote.DocEntry || 'draft'} 
                />

                <div className="space-y-4">
                  <div className="flex justify-between items-end px-2">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Linhas da Cotação</h3>
                      <p className="text-[9px] font-bold text-evo-dark/30 uppercase tracking-widest">Total de Itens: {selectedQuote.DocumentLines?.length || 0}</p>
                    </div>
                    <Button onClick={handleAddLine} variant="outline" size="sm" className="rounded-none uppercase text-[9px] font-black border-2 h-9 px-6 hover:bg-evo-dark hover:text-white transition-all">Adicionar Item</Button>
                  </div>
                  
                  <div className="border border-evo-dark/10 overflow-x-auto bg-white shadow-lg">
                    <Table className="min-w-[800px]">
                      <TableHeader className="bg-evo-dark">
                        <TableRow className="border-none hover:bg-transparent">
                          <TableHead className="text-[9px] font-black uppercase px-6 py-4 text-white/60">Cód. Item</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60 w-28 text-center">Quant.</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60 w-36 text-center">Preço Unit.</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-6 py-4 text-white/60">Vinculação de Custos (Pessoal / Locação)</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-6 py-4 text-white/60 text-right">Total Linha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuote.DocumentLines.map((line: any, idx: number) => (
                          <TableRow key={idx} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                            <TableCell className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex gap-1">
                                  <Input 
                                    value={line.ItemCode}
                                    onChange={(e) => updateLine(idx, 'ItemCode', e.target.value)}
                                    className="h-10 rounded-none text-xs border-evo-bg bg-transparent font-bold focus:bg-white flex-1"
                                    placeholder="EX: ITEM-001"
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-10 w-10 p-0 rounded-none border-evo-bg"
                                    onClick={() => {
                                      setLineIndexForLookup(idx);
                                      setIsItemLookupOpen(true);
                                    }}
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                                {(line.ItemDescription || line.ItemName) && (
                                  <p className="text-[10px] font-black text-evo-teal uppercase tracking-tight truncate max-w-[250px] mt-1 bg-evo-teal/5 px-2 py-0.5 border-l-2 border-evo-teal">
                                    {line.ItemDescription || line.ItemName}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <Input 
                                type="number"
                                value={line.Quantity}
                                onChange={(e) => updateLine(idx, 'Quantity', Number(e.target.value))}
                                className="h-10 rounded-none text-xs border-evo-bg text-center font-bold"
                              />
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-evo-dark/30">R$</span>
                                <Input 
                                  type="number"
                                  value={line.Price}
                                  onChange={(e) => updateLine(idx, 'Price', Number(e.target.value))}
                                  className="h-10 rounded-none text-xs border-evo-bg pl-8 text-right font-bold"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[8px] font-black text-evo-dark/30 uppercase tracking-tighter">Pessoal</span>
                                  <div className="flex items-center gap-2">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className={`h-8 w-8 p-0 border rounded-none transition-all ${line.U_nITEM ? 'bg-evo-teal/20 border-evo-teal text-evo-teal' : 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'}`}
                                      onClick={() => {
                                        setActiveLineIndex(idx);
                                        setIsPersCostModalOpen(true);
                                      }}
                                    >
                                      <User className="w-3.5 h-3.5" />
                                    </Button>
                                    <span className={`text-[9px] font-black uppercase ${line.U_nITEM ? 'text-evo-teal' : 'text-rose-400'}`}>
                                      {line.U_nITEM ? `#${line.U_nITEM}` : 'PENDENTE'}
                                    </span>
                                  </div>
                                </div>

                                <div className="w-[1px] h-8 bg-evo-bg" />

                                <div className="flex flex-col gap-1">
                                  <span className="text-[8px] font-black text-evo-dark/30 uppercase tracking-tighter">Locação</span>
                                  <div className="flex items-center gap-2">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className={`h-8 w-8 p-0 border rounded-none transition-all ${line.U_ItemLoc ? 'bg-evo-teal/20 border-evo-teal text-evo-teal' : 'bg-indigo-50 border-indigo-200 text-indigo-500 hover:bg-indigo-100'}`}
                                      onClick={() => {
                                        setActiveLineIndex(idx);
                                        setIsRentalCostModalOpen(true);
                                      }}
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                    </Button>
                                    <span className={`text-[9px] font-black uppercase ${line.U_ItemLoc ? 'text-evo-teal' : 'text-indigo-400'}`}>
                                      {line.U_ItemLoc ? `#${line.U_ItemLoc}` : 'PENDENTE'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 font-black text-sm text-right text-evo-dark bg-evo-bg/10">
                              R$ {(line.Quantity * line.Price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Observações</label>
                  <textarea 
                    value={selectedQuote.Comments || ""}
                    onChange={(e) => setSelectedQuote({ ...selectedQuote, Comments: e.target.value })}
                    className="w-full min-h-[100px] p-4 rounded-none border-2 border-evo-dark/10 focus:border-evo-teal transition-colors text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-8 border-t border-evo-dark/10 flex justify-end gap-4 shadow-2xl shrink-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-none uppercase text-[10px] font-black border-2 px-10">Fechar</Button>
            <Button 
              onClick={handleSaveQuotation}
              disabled={isOrderLoading}
              className="evo-button-primary rounded-none px-12 h-12 shadow-lg"
            >
              {isOrderLoading ? 'Gravando e Gerando Pedido...' : 'Gravar e Gerar Pedido'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Lookup Dialog */}
      <LookupDialog 
        isOpen={isItemLookupOpen}
        onClose={() => setIsItemLookupOpen(false)}
        title="Pesquisar Item"
        placeholder="Digite o código ou nome do item..."
        onSelect={(item) => {
          if (lineIndexForLookup !== null) {
            const newLines = [...selectedQuote.DocumentLines];
            newLines[lineIndexForLookup] = { 
              ...newLines[lineIndexForLookup], 
              ItemCode: item.ItemCode, 
              ItemDescription: item.ItemName 
            };
            setSelectedQuote({ ...selectedQuote, DocumentLines: newLines });
          }
          setIsItemLookupOpen(false);
        }}
        searchFn={sapService.getItems}
        renderItem={(item) => (
          <div className="flex justify-between items-center w-full">
            <span className="font-black text-xs">{item.ItemCode}</span>
            <span className="text-[10px] font-bold text-evo-dark/40 uppercase">{item.ItemName}</span>
          </div>
        )}
      />

      {/* Business Partner (Customer) Lookup Dialog */}
      <LookupDialog 
        isOpen={isBPLookupOpen}
        onClose={() => setIsBPLookupOpen(false)}
        title="Pesquisar Cliente"
        placeholder="Digite o código ou razão social do cliente..."
        onSelect={(bp) => {
          if (selectedQuote) {
            setSelectedQuote({
              ...selectedQuote,
              CardCode: bp.CardCode,
              CardName: bp.CardName
            });
          }
          setIsBPLookupOpen(false);
        }}
        searchFn={sapService.getCustomers}
        renderItem={(bp) => (
          <div className="flex justify-between items-center w-full">
            <span className="font-black text-xs">{bp.CardCode}</span>
            <span className="text-[10px] font-bold text-evo-dark/40 uppercase truncate max-w-[250px]">{bp.CardName}</span>
          </div>
        )}
      />

      {/* Personnel Cost Sub-Modal */}
      <PersonnelCostModal 
        isOpen={isPersCostModalOpen} 
        onClose={() => setIsPersCostModalOpen(false)}
        docEntry={selectedQuote?.DocEntry}
        lineIndex={activeLineIndex}
        onSaved={(id) => {
          if (activeLineIndex !== null) {
            updateLine(activeLineIndex, 'U_nITEM', id.toString());
          }
          setIsPersCostModalOpen(false);
        }}
      />

      {/* Rental Cost Sub-Modal */}
      <RentalCostModal 
        isOpen={isRentalCostModalOpen} 
        onClose={() => setIsRentalCostModalOpen(false)}
        docEntry={selectedQuote?.DocEntry}
        lineIndex={activeLineIndex}
        onSaved={(id) => {
          if (activeLineIndex !== null) {
            updateLine(activeLineIndex, 'U_ItemLoc', id.toString());
          }
          setIsRentalCostModalOpen(false);
        }}
      />
    </motion.div>
  );
}

function SalesOrdersView({ userEmail = "" }: { userEmail?: string; key?: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(true);

  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Sub-modals & Lookups
  const [isPersCostModalOpen, setIsPersCostModalOpen] = useState(false);
  const [isRentalCostModalOpen, setIsRentalCostModalOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [isItemLookupOpen, setIsItemLookupOpen] = useState(false);
  const [isBPLookupOpen, setIsBPLookupOpen] = useState(false);
  const [lineIndexForLookup, setLineIndexForLookup] = useState<number | null>(null);

  // Print Layout Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [orderForPrint, setOrderForPrint] = useState<any>(null);

  const handleOpenPrintLayout = (orderToPrint: any) => {
    setOrderForPrint(orderToPrint);
    setIsPrintModalOpen(true);
  };

  const fetchOrders = async (targetPage = page, searchTarget = appliedSearch, targetPageSize = pageSize) => {
    setIsLoading(true);
    try {
      const data = await sapService.getOrders({
        skip: targetPage * targetPageSize,
        top: targetPageSize,
        search: searchTarget
      });
      const orderList = Array.isArray(data) ? data : [];
      setOrders(orderList);
      setHasMore(orderList.length >= targetPageSize);
    } catch (error) {
      toast.error('Erro ao buscar pedidos de venda.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuxData = async () => {
    try {
      const [ccData, projData] = await Promise.all([
        sapService.getDistributionRules(),
        sapService.getProjects()
      ]);
      setCostCenters(ccData || []);
      setProjects(projData || []);
    } catch (e) {
      console.warn('Erro ao carregar centros de custo ou projetos:', e);
    }
  };

  useEffect(() => {
    setPage(0);
    fetchOrders(0, appliedSearch, pageSize);
    loadAuxData();
  }, []);

  // Debounced auto-search across all pages in the SAP database
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed !== appliedSearch) {
        setPage(0);
        setAppliedSearch(trimmed);
        fetchOrders(0, trimmed, pageSize);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch, pageSize]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchTerm.trim();
    setPage(0);
    setAppliedSearch(trimmed);
    fetchOrders(0, trimmed, pageSize);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setAppliedSearch('');
    setPage(0);
    fetchOrders(0, '', pageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 0) return;
    setPage(newPage);
    fetchOrders(newPage, appliedSearch, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    fetchOrders(0, appliedSearch, newSize);
  };

  const filteredOrders = orders.filter(o => {
    const isOpen = o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O';
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'open' && isOpen) || 
                         (statusFilter === 'closed' && !isOpen);
    return matchesStatus;
  });

  const handleCreateNew = () => {
    setSelectedOrder({
      CardCode: '',
      CardName: '',
      DocDueDate: new Date().toISOString().split('T')[0],
      U_Projeto: '',
      NumAtCard: '',
      Comments: '',
      BPL_IDAssignedToInvoice: 1,
      DocumentLines: [
        { ItemCode: '', ItemDescription: '', Quantity: 1, Price: 0, CostingCode: '', ProjectCode: '', U_nITEM: '', U_ItemLoc: '' }
      ]
    });
    setIsModalOpen(true);
  };

  const handleEdit = async (order: any) => {
    try {
      const fullOrder = await sapService.getOrder(order.DocEntry);
      setSelectedOrder(fullOrder);
      setIsModalOpen(true);
    } catch (error) {
      toast.error('Erro ao carregar detalhes do pedido de venda.');
    }
  };

  const handleSaveOrder = async () => {
    if (!selectedOrder) return;
    if (!selectedOrder.CardCode) {
      toast.error('Selecione o código do cliente.');
      return;
    }
    setIsSaving(true);
    try {
      if (selectedOrder.DocEntry) {
        await sapService.updateOrder(selectedOrder.DocEntry, selectedOrder);
        toast.success('Pedido de Venda atualizado!');
      } else {
        await sapService.createOrder(selectedOrder);
        toast.success('Pedido de Venda criado com sucesso no SAP!');
      }
      fetchOrders();
      setIsModalOpen(false);
    } catch (error) {
      toast.error('Erro ao salvar pedido de venda.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrder?.DocEntry) return;
    if (!confirm('Deseja realmente cancelar este Pedido de Venda?')) return;
    setIsSaving(true);
    try {
      await sapService.deleteOrder(selectedOrder.DocEntry);
      toast.success('Pedido de Venda excluído/cancelado.');
      fetchOrders();
      setIsModalOpen(false);
    } catch (error) {
      toast.error('Erro ao excluir pedido.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLine = () => {
    setSelectedOrder({
      ...selectedOrder,
      DocumentLines: [
        ...selectedOrder.DocumentLines,
        { ItemCode: '', ItemDescription: '', Quantity: 1, Price: 0, CostingCode: '', ProjectCode: selectedOrder.U_Projeto || '', U_nITEM: '', U_ItemLoc: '' }
      ]
    });
  };

  const handleRemoveLine = (index: number) => {
    const updated = selectedOrder.DocumentLines.filter((_: any, i: number) => i !== index);
    setSelectedOrder({ ...selectedOrder, DocumentLines: updated });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...selectedOrder.DocumentLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setSelectedOrder({ ...selectedOrder, DocumentLines: newLines });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 border border-evo-bg shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-evo-teal" />
            <h1 className="text-3xl font-black tracking-tighter uppercase text-evo-dark">Pedidos de Venda (Orders)</h1>
          </div>
          <p className="text-[10px] font-bold text-evo-dark/40 uppercase tracking-[0.3em] mt-1">Gestão de Vendas, WO, PO Cliente e Documentos Comprobatórios</p>
        </div>
        <Button onClick={handleCreateNew} className="evo-button-primary rounded-none px-8 h-12 text-xs uppercase tracking-widest font-black shadow-xl">
          <Plus className="w-4 h-4 mr-2" /> Novo Pedido de Venda
        </Button>
      </div>

      <div className="flex flex-col gap-3 bg-white p-6 border border-evo-bg shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 flex-1 w-full">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-evo-dark/30" />
              <Input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por Nº do Pedido (ex: 1029), Cliente, PO ou WO em toda a base..."
                className="pl-12 rounded-none border-evo-bg h-11 text-xs font-bold"
              />
            </div>
            <Button type="submit" className="h-11 rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white font-bold uppercase text-[10px] tracking-widest px-6 shadow-sm">
              Buscar
            </Button>
            {appliedSearch && (
              <Button type="button" onClick={handleClearSearch} variant="outline" className="h-11 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4">
                Limpar
              </Button>
            )}
            <Button type="button" onClick={() => fetchOrders(page, appliedSearch, pageSize)} variant="outline" className="h-11 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4 flex items-center gap-1.5" title="Recarregar">
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </form>
          <div className="flex gap-2 w-full md:w-auto">
            <Button 
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('all')}
              className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-6 ${statusFilter === 'all' ? 'bg-evo-dark text-white' : ''}`}
            >
              Todos
            </Button>
            <Button 
              variant={statusFilter === 'open' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('open')}
              className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-6 ${statusFilter === 'open' ? 'bg-evo-teal text-evo-dark' : ''}`}
            >
              Abertos
            </Button>
            <Button 
              variant={statusFilter === 'closed' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('closed')}
              className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-6 ${statusFilter === 'closed' ? 'bg-gray-200 text-gray-700' : ''}`}
            >
              Fechados
            </Button>
          </div>
        </div>

        {appliedSearch && (
          <div className="bg-evo-teal/10 border border-evo-teal/30 px-4 py-2 flex items-center justify-between text-xs font-bold text-evo-dark">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-evo-teal" />
              <span>Busca global no SAP por: <span className="text-evo-teal font-black">"{appliedSearch}"</span> ({orders.length} resultado(s) retornado(s))</span>
            </div>
            <button type="button" onClick={handleClearSearch} className="text-[10px] uppercase font-black text-evo-teal hover:underline cursor-pointer">
              Limpar Filtro
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="evo-card border-none overflow-hidden shadow-lg">
          <Table>
            <TableHeader className="bg-evo-dark">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Nº Pedido</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">WO (Projeto)</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">PO Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Cód. Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Nome do Cliente</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Data Vencimento</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Total Pedido</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4">Status</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-white/50 px-6 py-4 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-20 opacity-30 animate-pulse uppercase text-[10px] font-black tracking-widest">Sincronizando com SAP Orders...</TableCell></TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-20 text-[10px] font-black uppercase tracking-widest opacity-20">Nenhum pedido de venda encontrado</TableCell></TableRow>
              ) : filteredOrders.map((o) => {
                const wo = o.U_Projeto || o.Project || o.ProjectCode || (o.DocumentLines && o.DocumentLines[0]?.ProjectCode) || '-';
                const poCliente = o.NumAtCard || o.U_POCliente || '-';
                return (
                  <TableRow key={o.DocEntry} className="border-evo-bg hover:bg-evo-teal/5 transition-colors group">
                    <TableCell className="px-6 py-5 font-black text-xs text-evo-dark">{o.DocNum || o.DocEntry}</TableCell>
                    <TableCell className="px-6 py-5">
                      <span className="inline-flex items-center gap-1 font-black text-[10px] text-evo-teal bg-evo-teal/10 px-2 py-0.5 border border-evo-teal/20 uppercase tracking-tight">
                        {wo}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-5 font-black text-[10px] text-evo-dark uppercase">
                      {poCliente !== '-' ? (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 border border-blue-200">
                          {poCliente}
                        </span>
                      ) : (
                        <span className="text-evo-dark/30">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-5 font-bold text-[10px] uppercase">{o.CardCode}</TableCell>
                    <TableCell className="px-6 py-5 font-bold text-[10px] uppercase truncate max-w-[200px]">{o.CardName || "N/A"}</TableCell>
                    <TableCell className="px-6 py-5 text-[10px] font-bold">{o.DocDueDate ? new Date(o.DocDueDate).toLocaleDateString('pt-BR') : '-'}</TableCell>
                    <TableCell className="px-6 py-5 font-black text-xs text-evo-teal">R$ {Number(o.DocTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="px-6 py-5">
                      <Badge className={`rounded-none text-[8px] font-black uppercase tracking-widest ${o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O' ? 'bg-evo-teal/10 text-evo-teal border-evo-teal' : 'bg-gray-100 text-gray-500'}`}>
                        {o.DocumentStatus === 'bost_Open' || o.DocumentStatus === 'O' ? 'Aberta' : 'Fechada'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => handleOpenPrintLayout(o)} 
                          className="p-3 hover:bg-evo-teal hover:text-white text-evo-teal transition-all rounded-none border border-evo-bg" 
                          title="Visualizar Layout de Impressão PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEdit(o)} className="p-3 hover:bg-evo-dark hover:text-white transition-all rounded-none border border-evo-bg" title="Editar/Visualizar">
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination bar */}
          <div className="p-4 bg-white border-t border-evo-bg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs font-bold text-evo-dark/60">
              <span>Página {page + 1} ({orders.length} pedidos nesta página)</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-evo-dark/40">Exibir:</span>
                <select 
                  value={pageSize} 
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="border border-evo-bg bg-white px-2 py-1 text-xs font-bold rounded-none focus:outline-none"
                >
                  <option value={20}>20 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(0)} 
                disabled={page === 0 || isLoading}
                className="rounded-none h-9 px-3 text-[10px] uppercase font-black tracking-widest"
                title="Primeira Página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(page - 1)} 
                disabled={page === 0 || isLoading}
                className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </Button>
              <span className="px-3 py-1 bg-evo-dark text-white text-xs font-black min-w-[32px] text-center">
                {page + 1}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handlePageChange(page + 1)} 
                disabled={!hasMore || orders.length < pageSize || isLoading}
                className="rounded-none h-9 px-4 text-[10px] uppercase font-black tracking-widest flex items-center gap-1"
              >
                Próxima <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <div className="flex items-center gap-1.5 ml-2 border-l border-evo-bg pl-3">
                <span className="text-[10px] uppercase font-bold text-evo-dark/40">Ir pág:</span>
                <input 
                  type="number" 
                  min={1} 
                  placeholder={`${page + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(val) && val >= 1) {
                        handlePageChange(val - 1);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                  className="w-14 h-9 border border-evo-bg text-center text-xs font-bold rounded-none focus:outline-none"
                  title="Digite o número da página e pressione Enter"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Order Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 rounded-none overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-evo-dark p-8 text-white relative shrink-0">
            <div className="absolute top-0 right-0 p-6 flex items-center gap-3 z-10">
              {selectedOrder?.DocEntry && (
                <Button 
                  type="button"
                  onClick={() => handleOpenPrintLayout(selectedOrder)}
                  className="rounded-none uppercase text-[9px] font-black px-4 h-10 tracking-widest bg-evo-teal hover:bg-evo-teal-dark text-white flex items-center gap-1.5 shadow-md"
                  title="Visualizar layout de impressão e baixar PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Layout Impressão (PDF)
                </Button>
              )}
              {selectedOrder?.DocEntry && (
                <Button 
                  onClick={handleDeleteOrder} 
                  disabled={isSaving}
                  variant="destructive"
                  className="rounded-none uppercase text-[9px] font-black px-6 h-10 tracking-widest"
                >
                  Excluir Pedido
                </Button>
              )}
              <DialogClose render={<Button variant="ghost" className="text-white hover:bg-white/10 p-2 h-10 w-10 flex items-center justify-center rounded-none" />}>
                <X className="w-6 h-6" />
              </DialogClose>
            </div>
            <DialogTitle className="text-3xl font-black tracking-tighter uppercase pr-48">
              {selectedOrder?.DocEntry ? `Pedido de Venda #${selectedOrder.DocNum || selectedOrder.DocEntry}` : 'Novo Pedido de Venda'}
            </DialogTitle>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.4em] mt-1">Preenchimento de Venda, WO, PO Cliente, Centros de Custo e Anexos de Comprovação</p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-10 bg-evo-bg/30">
            {selectedOrder && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 bg-white p-8 border border-evo-bg shadow-sm">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Código do Cliente</label>
                    <div className="flex gap-1">
                      <Input 
                        value={selectedOrder.CardCode}
                        onChange={(e) => setSelectedOrder({ ...selectedOrder, CardCode: e.target.value })}
                        className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold flex-1"
                        placeholder="EX: C20000"
                      />
                      <Button 
                        type="button"
                        variant="outline"
                        className="rounded-none h-11 w-11 p-0 border-2 border-evo-dark/10"
                        onClick={() => setIsBPLookupOpen(true)}
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Nome do Cliente</label>
                    <Input 
                      value={selectedOrder.CardName || ""}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, CardName: e.target.value })}
                      placeholder="Nome do Cliente"
                      className="rounded-none border-2 border-evo-dark/10 h-11 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">WO (Projeto)</label>
                    <Input 
                      value={selectedOrder.U_Projeto || selectedOrder.Project || selectedOrder.ProjectCode || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedOrder({ 
                          ...selectedOrder, 
                          U_Projeto: val,
                          Project: val,
                          ProjectCode: val
                        });
                      }}
                      placeholder="EX: WO 2040 OU PROJETO"
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold text-evo-teal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">PO do Cliente</label>
                    <Input 
                      value={selectedOrder.NumAtCard || selectedOrder.U_POCliente || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedOrder({ 
                          ...selectedOrder, 
                          NumAtCard: val,
                          U_POCliente: val
                        });
                      }}
                      placeholder="EX: PO-987654"
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 uppercase font-bold text-blue-700"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Data de Vencimento</label>
                    <Input 
                      type="date"
                      value={selectedOrder.DocDueDate ? selectedOrder.DocDueDate.split('T')[0] : ""}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, DocDueDate: e.target.value })}
                      className="rounded-none border-2 border-evo-dark/10 focus:border-evo-teal h-11 font-bold"
                    />
                  </div>
                </div>

                {/* Section for Attachments (PO Cliente, Cotação Qualitech, Email de Aprovação) */}
                <DocumentAttachmentsSection 
                  documentType="order" 
                  docId={selectedOrder.DocEntry || 'draft'} 
                />

                <div className="space-y-4">
                  <div className="flex justify-between items-end px-2">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Itens e Linhas do Pedido</h3>
                      <p className="text-[9px] font-bold text-evo-dark/30 uppercase tracking-widest">Total de Itens: {selectedOrder.DocumentLines?.length || 0}</p>
                    </div>
                    <Button onClick={handleAddLine} variant="outline" size="sm" className="rounded-none uppercase text-[9px] font-black border-2 h-9 px-6 hover:bg-evo-dark hover:text-white transition-all">
                      Adicionar Item
                    </Button>
                  </div>
                  
                  <div className="border border-evo-dark/10 overflow-x-auto bg-white shadow-lg">
                    <Table className="min-w-[1200px]">
                      <TableHeader className="bg-evo-dark">
                        <TableRow className="border-none hover:bg-transparent">
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60">Cód. Item</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-2 py-4 text-white/60 w-20 text-center">Quant.</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-2 py-4 text-white/60 w-28 text-center">Preço Unit.</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60">Centro de Custo</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60">Projeto</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60">Custos (Pessoal / Locação)</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-4 py-4 text-white/60 text-right">Total Linha</TableHead>
                          <TableHead className="text-[9px] font-black uppercase px-2 py-4 text-white/60 w-12 text-center"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.DocumentLines.map((line: any, idx: number) => (
                          <TableRow key={idx} className="border-evo-bg hover:bg-evo-teal/5 transition-colors">
                            <TableCell className="px-4 py-4">
                              <div className="space-y-1">
                                <div className="flex gap-1">
                                  <Input 
                                    value={line.ItemCode}
                                    onChange={(e) => updateLine(idx, 'ItemCode', e.target.value)}
                                    className="h-10 rounded-none text-xs border-evo-bg bg-transparent font-bold focus:bg-white flex-1 min-w-[120px]"
                                    placeholder="EX: ITEM-001"
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-10 w-10 p-0 rounded-none border-evo-bg shrink-0"
                                    onClick={() => {
                                      setLineIndexForLookup(idx);
                                      setIsItemLookupOpen(true);
                                    }}
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                                {(line.ItemDescription || line.ItemName) && (
                                  <p className="text-[10px] font-black text-evo-teal uppercase tracking-tight truncate max-w-[200px] mt-1 bg-evo-teal/5 px-2 py-0.5 border-l-2 border-evo-teal">
                                    {line.ItemDescription || line.ItemName}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-4">
                              <Input 
                                type="number"
                                value={line.Quantity}
                                onChange={(e) => updateLine(idx, 'Quantity', Number(e.target.value))}
                                className="h-10 rounded-none text-xs border-evo-bg text-center font-bold"
                              />
                            </TableCell>
                            <TableCell className="px-2 py-4">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-evo-dark/30">R$</span>
                                <Input 
                                  type="number"
                                  value={line.Price || line.UnitPrice || 0}
                                  onChange={(e) => updateLine(idx, 'Price', Number(e.target.value))}
                                  className="h-10 rounded-none text-xs border-evo-bg pl-6 text-right font-bold"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <select 
                                value={line.CostingCode || ''}
                                onChange={(e) => updateLine(idx, 'CostingCode', e.target.value)}
                                className="h-10 w-full rounded-none text-[10px] font-bold border border-evo-bg bg-white px-2 uppercase"
                              >
                                <option value="">Nenhum Centro de Custo</option>
                                {costCenters.map((cc) => (
                                  <option key={cc.FactorCode} value={cc.FactorCode}>
                                    {cc.FactorCode} - {cc.FactorDescription}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <select 
                                value={line.ProjectCode || ''}
                                onChange={(e) => updateLine(idx, 'ProjectCode', e.target.value)}
                                className="h-10 w-full rounded-none text-[10px] font-bold border border-evo-bg bg-white px-2 uppercase"
                              >
                                <option value="">Nenhum Projeto</option>
                                {projects.map((p) => (
                                  <option key={p.Code} value={p.Code}>
                                    {p.Code} - {p.Name}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[8px] font-black text-evo-dark/30 uppercase tracking-tighter">Pessoal</span>
                                  <div className="flex items-center gap-1.5">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className={`h-7 w-7 p-0 border rounded-none transition-all ${line.U_nITEM ? 'bg-evo-teal/20 border-evo-teal text-evo-teal' : 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'}`}
                                      onClick={() => {
                                        setActiveLineIndex(idx);
                                        setIsPersCostModalOpen(true);
                                      }}
                                    >
                                      <User className="w-3 h-3" />
                                    </Button>
                                    <span className={`text-[8px] font-black uppercase ${line.U_nITEM ? 'text-evo-teal' : 'text-rose-400'}`}>
                                      {line.U_nITEM ? `#${line.U_nITEM}` : 'S/ CUSTO'}
                                    </span>
                                  </div>
                                </div>

                                <div className="w-[1px] h-7 bg-evo-bg" />

                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[8px] font-black text-evo-dark/30 uppercase tracking-tighter">Locação</span>
                                  <div className="flex items-center gap-1.5">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className={`h-7 w-7 p-0 border rounded-none transition-all ${line.U_ItemLoc ? 'bg-evo-teal/20 border-evo-teal text-evo-teal' : 'bg-indigo-50 border-indigo-200 text-indigo-500 hover:bg-indigo-100'}`}
                                      onClick={() => {
                                        setActiveLineIndex(idx);
                                        setIsRentalCostModalOpen(true);
                                      }}
                                    >
                                      <Truck className="w-3 h-3" />
                                    </Button>
                                    <span className={`text-[8px] font-black uppercase ${line.U_ItemLoc ? 'text-evo-teal' : 'text-indigo-400'}`}>
                                      {line.U_ItemLoc ? `#${line.U_ItemLoc}` : 'S/ CUSTO'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-4 font-black text-xs text-right text-evo-dark bg-evo-bg/10">
                              R$ {(line.Quantity * (line.Price || line.UnitPrice || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="px-2 py-4 text-center">
                              {selectedOrder.DocumentLines.length > 1 && (
                                <button onClick={() => handleRemoveLine(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-none transition-colors" title="Remover Linha">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Observações do Pedido</label>
                  <textarea 
                    value={selectedOrder.Comments || ""}
                    onChange={(e) => setSelectedOrder({ ...selectedOrder, Comments: e.target.value })}
                    className="w-full min-h-[100px] p-4 rounded-none border-2 border-evo-dark/10 focus:border-evo-teal transition-colors text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-8 border-t border-evo-dark/10 flex justify-end gap-4 shadow-2xl shrink-0">
            {selectedOrder?.DocEntry && (
              <Button 
                type="button"
                variant="outline" 
                onClick={() => handleOpenPrintLayout(selectedOrder)} 
                className="rounded-none uppercase text-[10px] font-black border-2 border-evo-teal text-evo-teal hover:bg-evo-teal hover:text-white px-6 h-12 flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Visualizar Impressão (PDF)
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-none uppercase text-[10px] font-black border-2 px-10">Fechar</Button>
            <Button 
              onClick={handleSaveOrder}
              disabled={isSaving}
              className="evo-button-primary rounded-none px-12 h-12 shadow-lg"
            >
              {isSaving ? 'Gravando Pedido...' : 'Salvar Pedido de Venda'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Lookup Dialog */}
      <LookupDialog 
        isOpen={isBPLookupOpen}
        onClose={() => setIsBPLookupOpen(false)}
        title="Pesquisar Cliente / Parceiro"
        placeholder="Digite o código ou razão social..."
        onSelect={(bp: any) => {
          setSelectedOrder({
            ...selectedOrder,
            CardCode: bp.CardCode,
            CardName: bp.CardName
          });
          setIsBPLookupOpen(false);
        }}
        searchFn={sapService.getBusinessPartners}
        renderItem={(bp: any) => (
          <div className="flex justify-between items-center w-full">
            <span className="font-black text-xs">{bp.CardCode}</span>
            <span className="text-[10px] font-bold text-evo-dark/40 uppercase">{bp.CardName}</span>
          </div>
        )}
      />

      {/* Item Lookup Dialog */}
      <LookupDialog 
        isOpen={isItemLookupOpen}
        onClose={() => setIsItemLookupOpen(false)}
        title="Pesquisar Item"
        placeholder="Digite o código ou nome do item..."
        onSelect={(item: any) => {
          if (lineIndexForLookup !== null) {
            const newLines = [...selectedOrder.DocumentLines];
            newLines[lineIndexForLookup] = { 
              ...newLines[lineIndexForLookup], 
              ItemCode: item.ItemCode, 
              ItemDescription: item.ItemName 
            };
            setSelectedOrder({ ...selectedOrder, DocumentLines: newLines });
          }
          setIsItemLookupOpen(false);
        }}
        searchFn={sapService.getItems}
        renderItem={(item: any) => (
          <div className="flex justify-between items-center w-full">
            <span className="font-black text-xs">{item.ItemCode}</span>
            <span className="text-[10px] font-bold text-evo-dark/40 uppercase">{item.ItemName}</span>
          </div>
        )}
      />

      {/* Personnel Cost Sub-Modal */}
      <PersonnelCostModal 
        isOpen={isPersCostModalOpen} 
        onClose={() => setIsPersCostModalOpen(false)}
        docEntry={selectedOrder?.DocEntry}
        lineIndex={activeLineIndex}
        onSaved={(id) => {
          if (activeLineIndex !== null) {
            updateLine(activeLineIndex, 'U_nITEM', id.toString());
          }
          setIsPersCostModalOpen(false);
        }}
      />

      {/* Rental Cost Sub-Modal */}
      <RentalCostModal 
        isOpen={isRentalCostModalOpen} 
        onClose={() => setIsRentalCostModalOpen(false)}
        docEntry={selectedOrder?.DocEntry}
        lineIndex={activeLineIndex}
        onSaved={(id) => {
          if (activeLineIndex !== null) {
            updateLine(activeLineIndex, 'U_ItemLoc', id.toString());
          }
          setIsRentalCostModalOpen(false);
        }}
      />

      {/* Sales Order Print Layout Modal */}
      <SalesOrderPrintModal 
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        order={orderForPrint}
        userEmail={userEmail}
      />
    </motion.div>
  );
}

// Reusable Lookup Dialog
function LookupDialog({ isOpen, onClose, title, placeholder, onSelect, searchFn, renderItem }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResults, setRawResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async (query = '') => {
    setIsLoading(true);
    try {
      const data = await searchFn(query);
      setRawResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Erro ao buscar dados no lookup:', error);
      toast.error('Erro ao buscar dados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      loadData('');
    } else {
      setSearchTerm('');
      setRawResults([]);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    loadData(searchTerm);
  };

  // Real-time in-memory filter of loaded list
  const filteredResults = useMemo(() => {
    if (!searchTerm.trim()) return rawResults;
    const term = searchTerm.toLowerCase().trim();
    return rawResults.filter((item: any) => {
      const code = String(item.CardCode || item.ItemCode || item.Code || '').toLowerCase();
      const name = String(item.CardName || item.ItemName || item.Name || item.Description || '').toLowerCase();
      return code.includes(term) || name.includes(term);
    });
  }, [rawResults, searchTerm]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg w-[95vw] rounded-none border-t-4 border-evo-teal shadow-2xl">
        <DialogHeader>
          <div className="flex justify-between items-center pr-4">
            <DialogTitle className="uppercase tracking-tight font-black text-sm text-evo-dark">{title}</DialogTitle>
            <span className="text-[9px] font-bold text-evo-teal uppercase bg-evo-teal/10 px-2 py-0.5">
              {isLoading ? 'Carregando...' : `${filteredResults.length} Encontrado(s)`}
            </span>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-evo-dark/30" />
              <Input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={placeholder || 'Digite para filtrar ou buscar...'}
                className="rounded-none h-10 border-evo-bg font-bold pl-9 text-xs"
                autoFocus
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading} className="evo-button-primary h-10 rounded-none px-4" title="Buscar no Servidor">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          
          <div className="max-h-[340px] overflow-y-auto border border-evo-bg divide-y divide-evo-bg bg-white">
            {isLoading && rawResults.length === 0 ? (
              <div className="p-8 text-center text-[10px] font-bold text-evo-dark/40 uppercase tracking-widest flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-evo-teal" />
                Listando parceiros...
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="p-8 text-center text-[10px] font-bold text-evo-dark/30 uppercase tracking-widest">
                {searchTerm ? 'Nenhum resultado encontrado para o filtro' : 'Nenhum registro disponível'}
              </div>
            ) : filteredResults.map((item, idx) => (
              <button 
                key={idx}
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full p-3.5 text-left hover:bg-evo-teal/5 transition-colors flex items-center group cursor-pointer border-l-2 border-transparent hover:border-evo-teal"
              >
                {renderItem ? renderItem(item) : (
                  <div className="flex justify-between items-center w-full">
                    <span className="font-black text-xs text-evo-dark group-hover:text-evo-teal">{item.CardCode || item.ItemCode}</span>
                    <span className="text-[11px] font-bold text-evo-dark/60 uppercase truncate max-w-[280px]">{item.CardName || item.ItemName}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Sub-components for linking costs
function PersonnelCostModal({ isOpen, onClose, onSaved, docEntry, lineIndex }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSaved: (id: number) => void,
  docEntry?: number,
  lineIndex: number | null
}) {
  const [formData, setFormData] = useState({
    U_DataInicial: new Date().toISOString().split('T')[0],
    U_DataFinal: new Date().toISOString().split('T')[0],
    U_Colaborador: '',
    U_VlNormal: 0,
    U_StandBy: 0,
    U_QtdDiarias: 0,
    U_QtdDiariasSt: 0,
    U_NotNor: 0,
    U_NotNob: 0,
    U_HExtraDiu: 0,
    U_HExtraNot: 0,
    U_Total: 0
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isCollabLookupOpen, setIsCollabLookupOpen] = useState(false);

  // Computa o breakdown de custos fiel à planilha Excel e ao SAP
  const currentBreakdown = calculatePersonnelCost({
    valorNormal: formData.U_VlNormal,
    qtdDiariasNormal: formData.U_QtdDiarias,
    qtdDiariasStandBy: formData.U_QtdDiariasSt,
    noturnoNormal: formData.U_NotNor,
    noturnoNob: formData.U_NotNob,
    hExtraDiurna: formData.U_HExtraDiu,
    hExtraNoturna: formData.U_HExtraNot
  });

  useEffect(() => {
    if (formData.U_StandBy !== currentBreakdown.standByRate || formData.U_Total !== currentBreakdown.totalGeral) {
      setFormData(prev => ({ 
        ...prev, 
        U_StandBy: currentBreakdown.standByRate, 
        U_Total: currentBreakdown.totalGeral 
      }));
    }
  }, [
    formData.U_VlNormal, 
    formData.U_QtdDiarias, 
    formData.U_QtdDiariasSt, 
    formData.U_NotNor, 
    formData.U_NotNob, 
    formData.U_HExtraDiu, 
    formData.U_HExtraNot,
    currentBreakdown.standByRate,
    currentBreakdown.totalGeral
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const code = `${docEntry}-${(lineIndex || 0) + 1}`;
      const payload = {
        ...formData,
        Code: code,
        Name: code
      };
      
      console.log('Gravando custo pessoal:', payload);
      const response = await sapService.createPersonnelCost(payload);
      toast.success('Custo Pessoal vinculado!');
      onSaved(response.DocEntry || response.AbsoluteEntry || 0);
    } catch (error: any) {
      console.error('Falha ao salvar custo pessoal:', error.response?.data || error);
      const errorMsg = error.response?.data?.error?.message?.value || 'Erro ao salvar custo.';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[95vh] overflow-y-auto rounded-none border-evo-teal border-t-8 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight font-black">Vincular Custo Pessoal</DialogTitle>
          <DialogDescription className="text-[10px] uppercase tracking-widest">Lançamento de diárias e horas extras para esta linha</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Colaborador</Label>
                <div className="flex gap-1">
                  <Input 
                    value={formData.U_Colaborador}
                    onChange={(e) => setFormData({ ...formData, U_Colaborador: e.target.value })}
                    className="rounded-none h-10 border-evo-bg flex-1 font-bold"
                    placeholder="Selecione o Colaborador"
                    required
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="rounded-none h-10 w-10 p-0 border-evo-bg"
                    onClick={() => setIsCollabLookupOpen(true)}
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                <LookupDialog 
                  isOpen={isCollabLookupOpen}
                  onClose={() => setIsCollabLookupOpen(false)}
                  title="Pesquisar Colaborador (CO)"
                  placeholder="Nome ou código..."
                  onSelect={(collab: any) => {
                    setFormData({ ...formData, U_Colaborador: collab.CardName || collab.CardCode });
                    setIsCollabLookupOpen(false);
                  }}
                  searchFn={sapService.getCollaborators}
                  renderItem={(collab: any) => (
                    <div className="flex justify-between items-center w-full">
                      <span className="font-black text-xs">{collab.CardCode}</span>
                      <span className="text-[10px] font-bold text-evo-dark/40 uppercase">{collab.CardName}</span>
                    </div>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Inicial</Label>
                  <Input type="date" value={formData.U_DataInicial} onChange={e => setFormData({...formData, U_DataInicial: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Final</Label>
                  <Input type="date" value={formData.U_DataFinal} onChange={e => setFormData({...formData, U_DataFinal: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-evo-bg pt-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Valor Normal (R$)</Label>
                  <Input type="number" step="0.01" value={formData.U_VlNormal} onChange={e => setFormData({...formData, U_VlNormal: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Qtd Diárias (Normal)</Label>
                  <Input type="number" step="0.5" value={formData.U_QtdDiarias} onChange={e => setFormData({...formData, U_QtdDiarias: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 opacity-60">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Stand-by Rate (R$) - Automático</Label>
                  <Input type="number" step="0.01" value={formData.U_StandBy} readOnly className="rounded-none h-10 border-evo-bg bg-evo-bg/50 cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Qtd Diárias (Stand-by)</Label>
                  <Input type="number" step="0.5" value={formData.U_QtdDiariasSt} onChange={e => setFormData({...formData, U_QtdDiariasSt: parseFloat(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Noturno Normal</Label>
                  <Input type="number" value={formData.U_NotNor} onChange={e => setFormData({...formData, U_NotNor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Noturno Nob</Label>
                  <Input type="number" value={formData.U_NotNob} onChange={e => setFormData({...formData, U_NotNob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Diurna</Label>
                  <Input type="number" value={formData.U_HExtraDiu} onChange={e => setFormData({...formData, U_HExtraDiu: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Noturna</Label>
                  <Input type="number" value={formData.U_HExtraNot} onChange={e => setFormData({...formData, U_HExtraNot: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>

              <div className="p-4 bg-evo-dark text-white rounded-none mt-2 space-y-2 border-l-4 border-evo-teal">
                <div className="flex justify-between items-center text-[10px] uppercase text-white/60 font-semibold border-b border-white/10 pb-1">
                  <span>Detalhamento dos Cálculos (Excel / SAP)</span>
                  <span>Multiplicadores</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                  <div className="flex justify-between text-white/80">
                    <span>Diárias Normais:</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalDiariasNormal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>Diárias Stand-by (50%):</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalDiariasStandBy.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>Noturno Normal (8%):</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalNoturnoNormal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>Noturno Dobrado:</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalNoturnoNob.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>H.E. Diurna (1.5x):</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalHExtraDiurna.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span>H.E. Noturna (1.5x + 8%):</span>
                    <span className="font-mono font-bold">R$ {currentBreakdown.totalHExtraNoturna.toFixed(2)}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Total Geral Previsto</p>
                    <h3 className="text-2xl font-black tracking-tighter text-evo-teal">
                      R$ {currentBreakdown.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="text-right text-[9px] text-white/60">
                    <div>Taxas extras: <span className="font-mono text-teal-300 font-bold">R$ {currentBreakdown.taxasNoturnas.toFixed(2)}</span></div>
                    <div>Valor Base/h: <span className="font-mono text-white/90">R$ {currentBreakdown.valorHora.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isLoading} className="evo-button-primary rounded-none px-10">
              {isLoading ? 'Gravando...' : 'Gravar e Vincular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Rental Cost Sub-Modal
function RentalCostModal({ isOpen, onClose, onSaved, docEntry, lineIndex }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSaved: (id: number) => void,
  docEntry?: number,
  lineIndex: number | null
}) {
  const [formData, setFormData] = useState({
    U_DataInicial: new Date().toISOString().split('T')[0],
    U_DataFinal: new Date().toISOString().split('T')[0],
    U_Recurso: '',
    U_ValorBase: 0,
    U_HorasNor: 0,
    U_HorasNob: 0,
    U_HENor: 0,
    U_HENob: 0,
    U_Total: 0
  });

  const [isLoading, setIsLoading] = useState(false);

  const calculateTotal = () => {
    const total = (Number(formData.U_ValorBase) * (Number(formData.U_HorasNor) + Number(formData.U_HorasNob))) + 
                (Number(formData.U_HENor) * (Number(formData.U_ValorBase) * 1.5)) + 
                (Number(formData.U_HENob) * (Number(formData.U_ValorBase) * 2.0));
    setFormData(prev => ({ ...prev, U_Total: total }));
  };

  useEffect(() => {
    calculateTotal();
  }, [formData.U_ValorBase, formData.U_HorasNor, formData.U_HorasNob, formData.U_HENor, formData.U_HENob]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const code = `${docEntry}-${(lineIndex || 0) + 1}`;
      const payload = {
        ...formData,
        Code: code,
        Name: code
      };
      const response = await sapService.createRentalCost(payload);
      toast.success('Custo Locação vinculado!');
      onSaved(response.DocEntry || response.AbsoluteEntry || 0);
    } catch (error: any) {
      console.error('Falha ao salvar custo locação:', error.response?.data || error);
      const errorMsg = error.response?.data?.error?.message?.value || 'Erro ao salvar custo.';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[95vh] overflow-y-auto rounded-none border-evo-teal border-t-8 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight font-black">Vincular Custo Locação</DialogTitle>
          <DialogDescription className="text-[10px] uppercase tracking-widest">Controle de custos de equipamentos e recursos externos</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Equipamento / Recurso</Label>
                <Input 
                  value={formData.U_Recurso}
                  onChange={(e) => setFormData({ ...formData, U_Recurso: e.target.value })}
                  className="rounded-none h-10 border-evo-bg"
                  placeholder="Descrição do Recurso"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Inicial</Label>
                  <Input type="date" value={formData.U_DataInicial} onChange={e => setFormData({...formData, U_DataInicial: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Data Final</Label>
                  <Input type="date" value={formData.U_DataFinal} onChange={e => setFormData({...formData, U_DataFinal: e.target.value})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
              <div className="space-y-1.5 border-t border-evo-bg pt-4">
                <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Valor Base (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={formData.U_ValorBase} 
                  onChange={e => setFormData({...formData, U_ValorBase: parseFloat(e.target.value) || 0})} 
                  className="rounded-none h-10 border-evo-bg" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Horas Normais</Label>
                  <Input type="number" value={formData.U_HorasNor} onChange={e => setFormData({...formData, U_HorasNor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">Horas Nob</Label>
                  <Input type="number" value={formData.U_HorasNob} onChange={e => setFormData({...formData, U_HorasNob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Normal</Label>
                  <Input type="number" value={formData.U_HENor} onChange={e => setFormData({...formData, U_HENor: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-tight text-evo-dark/60">H. Extra Nob</Label>
                  <Input type="number" value={formData.U_HENob} onChange={e => setFormData({...formData, U_HENob: parseInt(e.target.value) || 0})} className="rounded-none h-10 border-evo-bg" />
                </div>
              </div>

              <div className="p-6 bg-evo-dark text-white rounded-none mt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total Previsto</p>
                <h3 className="text-3xl font-black tracking-tighter text-evo-teal">
                  R$ {formData.U_Total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className="rounded-none uppercase text-[10px] font-black tracking-widest" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isLoading} className="evo-button-primary rounded-none px-10">
              {isLoading ? 'Gravando...' : 'Gravar e Vincular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalibrationView() {
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [selectedCalibration, setSelectedCalibration] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState<any>({
    U_Item: '',
    U_Forn: '',
    U_Verificador: '',
    U_Fabricante: '',
    U_Modelo: '',
    U_CCusto: '',
    QLT_CAL_DETCollection: [{
      U_DtCalib: new Date().toISOString().split('T')[0],
      U_DtVenc: '',
      U_Certificado: '',
      U_Lab: '',
      U_StatusCal: 'Aprovado',
      U_MaiorErro: '',
      U_ErroEnc: '',
      U_ErroAdm: '',
      U_MaiorIncer: ''
    }]
  });

  useEffect(() => {
    fetchCalibrations();
  }, []);

  const fetchCalibrations = async () => {
    setIsLoading(true);
    try {
      const calib = await sapService.getCalibrationRecords();
      setCalibrations(calib || []);
    } catch (error) {
      toast.error('Erro ao carregar registros de calibração.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCalibration = async (docEntry: number) => {
    try {
      const details = await sapService.getCalibrationDetail(docEntry);
      setSelectedCalibration(details);
    } catch (error) {
      toast.error('Erro ao carregar detalhes da calibração.');
    }
  };

  const handleOpenNew = () => {
    setFormData({
      U_Item: '',
      U_Forn: '',
      U_Verificador: '',
      U_Fabricante: '',
      U_Modelo: '',
      U_CCusto: '',
      QLT_CAL_DETCollection: [{
        U_DtCalib: new Date().toISOString().split('T')[0],
        U_DtVenc: '',
        U_Certificado: '',
        U_Lab: '',
        U_StatusCal: 'Aprovado',
        U_MaiorErro: '',
        U_ErroEnc: '',
        U_ErroAdm: '',
        U_MaiorIncer: ''
      }]
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedCalibration) return;
    setFormData({
      ...selectedCalibration,
      QLT_CAL_DETCollection: selectedCalibration.QLT_CAL_DETCollection || [{
        U_DtCalib: new Date().toISOString().split('T')[0],
        U_DtVenc: '',
        U_Certificado: '',
        U_Lab: '',
        U_StatusCal: 'Aprovado'
      }]
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (formData.DocEntry) {
        await sapService.updateCalibrationRecord(formData.DocEntry, formData);
        toast.success('Calibração atualizada com sucesso!');
      } else {
        await sapService.createCalibrationRecord(formData);
        toast.success('Calibração criada com sucesso!');
      }
      setIsModalOpen(false);
      fetchCalibrations();
      if (formData.DocEntry) {
        handleSelectCalibration(formData.DocEntry);
      }
    } catch (error) {
      toast.error('Erro ao salvar calibração.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCalibration || !window.confirm('Deseja realmente excluir este registro?')) return;
    try {
      await sapService.deleteCalibrationRecord(selectedCalibration.DocEntry);
      toast.success('Registro excluído com sucesso!');
      setSelectedCalibration(null);
      fetchCalibrations();
    } catch (error) {
      toast.error('Erro ao excluir registro.');
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      QLT_CAL_DETCollection: [
        ...formData.QLT_CAL_DETCollection,
        {
          U_DtCalib: new Date().toISOString().split('T')[0],
          U_DtVenc: '',
          U_Certificado: '',
          U_Lab: '',
          U_StatusCal: 'Aprovado'
        }
      ]
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...formData.QLT_CAL_DETCollection];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, QLT_CAL_DETCollection: newLines });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-evo-dark uppercase">Controle de Calibração</h1>
          <div className="h-1 w-12 bg-evo-teal rounded-full my-2" />
          <p className="text-xs font-bold uppercase tracking-widest text-evo-dark/40">Gestão de certificados e validade de instrumentos (QLT_CALIB)</p>
        </div>
        <div className="flex gap-4">
          <Button onClick={handleOpenNew} className="rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white text-[10px] font-black uppercase tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Novo Registro
          </Button>
          <Button onClick={fetchCalibrations} variant="outline" size="sm" className="rounded-none border-evo-dark text-[10px] font-black uppercase tracking-widest">
            Atualizar Lista
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* List Card */}
        <Card className="evo-card border-none overflow-hidden col-span-1 h-fit">
          <CardHeader className="bg-evo-dark px-8 py-4">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Instrumentos / Equipamentos</CardTitle>
          </CardHeader>
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-evo-bg/50 sticky top-0 z-10">
                <TableRow className="border-evo-bg">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Nº Doc</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest px-6">Equipamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-10 opacity-30 animate-pulse">Carregando...</TableCell></TableRow>
                ) : calibrations.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-10 text-[9px] font-black uppercase tracking-widest opacity-20">Vazio</TableCell></TableRow>
                ) : calibrations.map((cal) => (
                  <TableRow 
                    key={cal.DocEntry} 
                    className={`border-evo-bg cursor-pointer transition-colors ${selectedCalibration?.DocEntry === cal.DocEntry ? 'bg-evo-teal/10' : 'hover:bg-evo-teal/5'}`}
                    onClick={() => handleSelectCalibration(cal.DocEntry)}
                  >
                    <TableCell className="px-6 py-4 text-[10px] font-black text-evo-dark opacity-40">#{cal.DocNum || cal.DocEntry}</TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-tight text-evo-dark">{cal.U_DescEqui || cal.U_ItemName || cal.U_Item || 'N/A'}</span>
                        <span className="text-[8px] font-bold text-evo-teal tracking-widest uppercase">{cal.U_Fabricante} - {cal.U_Modelo || '-'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Detail Card */}
        <Card className="evo-card border-none overflow-hidden lg:col-span-2 min-h-[600px]">
          {selectedCalibration ? (
            <div className="flex flex-col h-full">
              <div className="bg-evo-dark p-8 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge className="rounded-none bg-evo-teal text-evo-dark text-[9px] font-black uppercase tracking-[0.2em] mb-2 px-3 py-1">
                      Calibração #{selectedCalibration.DocNum || selectedCalibration.DocEntry}
                    </Badge>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black tracking-tighter uppercase">{selectedCalibration.U_ItemName || selectedCalibration.U_Item}</h2>
                      <div className="flex gap-2">
                        <Button onClick={handleOpenEdit} size="icon" className="w-8 h-8 rounded-none bg-white/10 hover:bg-white/20 text-white">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button onClick={handleDelete} size="icon" className="w-8 h-8 rounded-none bg-red-500/20 hover:bg-red-500/40 text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{selectedCalibration.U_Fabricante || 'N/A'} - {selectedCalibration.U_Modelo || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Nº Documento</p>
                    <p className="text-xl font-black text-white">{selectedCalibration.DocNum || selectedCalibration.DocEntry}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-x-12 gap-y-6 mt-8 pt-8 border-t border-white/5">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Fornecedor</p>
                    <p className="text-[10px] font-bold uppercase truncate">{selectedCalibration.U_DesForn || '-'}</p>
                    <p className="text-[9px] text-evo-teal font-black">{selectedCalibration.U_Forn}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Item / Equipamento</p>
                    <p className="text-[10px] font-bold uppercase">{selectedCalibration.U_Item || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Verificador</p>
                    <p className="text-[10px] font-bold uppercase">{selectedCalibration.U_DescVerificador || '-'}</p>
                    <p className="text-[9px] text-evo-teal font-black">Cód: {selectedCalibration.U_Verificador}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-0.5 flex-1 bg-evo-bg" />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-evo-dark/30">Histórico de Certificados</span>
                  <div className="h-0.5 flex-1 bg-evo-bg" />
                </div>

                <div className="overflow-x-auto border border-evo-bg">
                  <Table>
                    <TableHeader className="bg-evo-bg/50">
                      <TableRow className="hover:bg-transparent border-evo-bg">
                        <TableHead className="text-[9px] font-black uppercase tracking-widest px-4 whitespace-nowrap">Data Calib.</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-widest px-4 whitespace-nowrap">Vencimento</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-widest px-4 whitespace-nowrap">Certificado</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-widest px-4 whitespace-nowrap">Laboratório</TableHead>
                        <TableHead className="text-[9px] font-black uppercase tracking-widest px-4 whitespace-nowrap">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!selectedCalibration.QLT_CAL_DETCollection || selectedCalibration.QLT_CAL_DETCollection.length === 0) ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-20 text-[10px] font-black uppercase tracking-widest opacity-20">Nenhum certificado detalhado</TableCell></TableRow>
                      ) : selectedCalibration.QLT_CAL_DETCollection.map((line: any, idx: number) => (
                        <TableRow key={idx} className="border-evo-bg">
                          <TableCell className="px-4 py-3 text-[10px] font-bold">{line.U_DtCalib ? new Date(line.U_DtCalib).toLocaleDateString('pt-BR') : '-'}</TableCell>
                          <TableCell className="px-4 py-3 text-[10px] font-bold text-evo-dark/60">{line.U_DtVenc ? new Date(line.U_DtVenc).toLocaleDateString('pt-BR') : '-'}</TableCell>
                          <TableCell className="px-4 py-3 text-[10px] font-black uppercase text-evo-teal">{line.U_Certificado}</TableCell>
                          <TableCell className="px-4 py-3 text-[9px] font-bold uppercase text-evo-dark/40">{line.U_Lab}</TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge className={`rounded-none text-[8px] font-black uppercase tracking-widest ${line.U_StatusCal?.toLowerCase().includes('ok') || line.U_StatusCal?.toLowerCase().includes('aprovado') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {line.U_StatusCal || 'N/A'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid grid-cols-4 gap-4 mt-8">
                  <div className="bg-evo-bg p-4 flex flex-col items-center justify-center border-l-2 border-evo-teal">
                    <p className="text-[8px] font-black uppercase tracking-widest text-evo-dark/40 mb-1">Maior Erro</p>
                    <p className="text-sm font-black text-evo-dark">{selectedCalibration.QLT_CAL_DETCollection?.[0]?.U_MaiorErro || '-'}</p>
                  </div>
                  <div className="bg-evo-bg p-4 flex flex-col items-center justify-center border-l-2 border-evo-teal">
                    <p className="text-[8px] font-black uppercase tracking-widest text-evo-dark/40 mb-1">M. Incerteza</p>
                    <p className="text-sm font-black text-evo-dark">{selectedCalibration.QLT_CAL_DETCollection?.[0]?.U_MaiorIncer || '-'}</p>
                  </div>
                  <div className="bg-evo-bg p-4 flex flex-col items-center justify-center border-l-2 border-evo-teal">
                    <p className="text-[8px] font-black uppercase tracking-widest text-evo-dark/40 mb-1">Erro Encont.</p>
                    <p className="text-sm font-black text-evo-dark">{selectedCalibration.QLT_CAL_DETCollection?.[0]?.U_ErroEnc || '-'}</p>
                  </div>
                  <div className="bg-evo-bg p-4 flex flex-col items-center justify-center border-l-2 border-red-500">
                    <p className="text-[8px] font-black uppercase tracking-widest text-red-500/40 mb-1">Erro Admiss.</p>
                    <p className="text-sm font-black text-red-600">{selectedCalibration.QLT_CAL_DETCollection?.[0]?.U_ErroAdm || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-4">
              <div className="bg-evo-bg p-6 rounded-full">
                <FileText className="w-12 h-12 text-evo-dark/10" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-evo-dark/20">Dashboard de Calibração</p>
                <p className="text-xs font-bold text-evo-dark/40 uppercase tracking-widest">Selecione um instrumento na lista lateral para ver os detalhes e certificados.</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* CRUD Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border-evo-dark">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              {formData.DocEntry ? 'Editar Calibração' : 'Nova Calibração'}
            </DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-evo-dark/40">
              Preencha os dados do instrumento e do certificado de calibração.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 py-6">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal border-b border-evo-bg pb-2">Informações do Instrumento</h3>
              
              <div className="space-y-1">
                <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Código do Item (U_Item)</Label>
                <Input 
                  value={formData.U_Item} 
                  onChange={(e) => setFormData({...formData, U_Item: e.target.value})}
                  className="rounded-none border-evo-bg focus:border-evo-teal transition-colors text-xs font-bold"
                  placeholder="Ex: I000392"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Fabricante</Label>
                  <Input 
                    value={formData.U_Fabricante} 
                    onChange={(e) => setFormData({...formData, U_Fabricante: e.target.value})}
                    className="rounded-none border-evo-bg text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Modelo</Label>
                  <Input 
                    value={formData.U_Modelo} 
                    onChange={(e) => setFormData({...formData, U_Modelo: e.target.value})}
                    className="rounded-none border-evo-bg text-xs font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Centro de Custo (U_CCusto)</Label>
                <Input 
                  value={formData.U_CCusto} 
                  onChange={(e) => setFormData({...formData, U_CCusto: e.target.value})}
                  className="rounded-none border-evo-bg text-xs font-bold"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal border-b border-evo-bg pb-2">Identificação Adicional</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Cód Fornecedor (U_Forn)</Label>
                  <Input 
                    value={formData.U_Forn} 
                    onChange={(e) => setFormData({...formData, U_Forn: e.target.value})}
                    className="rounded-none border-evo-bg text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Cód Verificador (U_Verificador)</Label>
                  <Input 
                    value={formData.U_Verificador} 
                    onChange={(e) => setFormData({...formData, U_Verificador: e.target.value})}
                    className="rounded-none border-evo-bg text-xs font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Nome Fornecedor (U_DesForn)</Label>
                <Input 
                  value={formData.U_DesForn} 
                  onChange={(e) => setFormData({...formData, U_DesForn: e.target.value})}
                  className="rounded-none border-evo-bg text-xs font-bold opacity-70"
                  disabled
                  placeholder="Preenchido via OData futuramente"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-evo-bg pb-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-evo-teal">Detalhamento da Calibração (Certificado)</h3>
              <Button onClick={addLine} variant="ghost" size="sm" className="h-6 px-3 text-[8px] font-black uppercase tracking-widest hover:bg-evo-teal/10 text-evo-teal">
                + Adicionar Certificado
              </Button>
            </div>

            {formData.QLT_CAL_DETCollection.map((line: any, idx: number) => (
              <div key={idx} className="bg-evo-bg/30 p-4 space-y-4 border border-evo-bg">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Data Calibração</Label>
                    <Input 
                      type="date"
                      value={line.U_DtCalib} 
                      onChange={(e) => updateLine(idx, 'U_DtCalib', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Vencimento</Label>
                    <Input 
                      type="date"
                      value={line.U_DtVenc} 
                      onChange={(e) => updateLine(idx, 'U_DtVenc', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Status</Label>
                    <Select value={line.U_StatusCal} onValueChange={(val) => updateLine(idx, 'U_StatusCal', val)}>
                      <SelectTrigger className="rounded-none border-evo-bg text-xs font-bold h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="Aprovado">Aprovado</SelectItem>
                        <SelectItem value="Reprovado">Reprovado</SelectItem>
                        <SelectItem value="Restrito">Restrito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Certificado</Label>
                    <Input 
                      value={line.U_Certificado} 
                      onChange={(e) => updateLine(idx, 'U_Certificado', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Laboratório</Label>
                    <Input 
                      value={line.U_Lab} 
                      onChange={(e) => updateLine(idx, 'U_Lab', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Maior Erro</Label>
                    <Input 
                      value={line.U_MaiorErro} 
                      onChange={(e) => updateLine(idx, 'U_MaiorErro', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Erro Enc</Label>
                    <Input 
                      value={line.U_ErroEnc} 
                      onChange={(e) => updateLine(idx, 'U_ErroEnc', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">Erro Adm</Label>
                    <Input 
                      value={line.U_ErroAdm} 
                      onChange={(e) => updateLine(idx, 'U_ErroAdm', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase tracking-widest opacity-50">M. Incerteza</Label>
                    <Input 
                      value={line.U_MaiorIncer} 
                      onChange={(e) => updateLine(idx, 'U_MaiorIncer', e.target.value)}
                      className="rounded-none border-evo-bg text-xs font-bold"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-8 gap-4">
            <Button onClick={() => setIsModalOpen(false)} variant="outline" className="rounded-none border-evo-dark text-[10px] font-black uppercase tracking-widest">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="rounded-none bg-evo-teal hover:bg-evo-teal/90 text-evo-dark text-[10px] font-black uppercase tracking-widest">
              {isSaving ? 'Salvando...' : (formData.DocEntry ? 'Atualizar Registro' : 'Criar Registro')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
