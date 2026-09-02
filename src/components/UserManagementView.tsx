import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, 
  UserPlus, 
  Shield, 
  User, 
  Trash2, 
  Edit2, 
  Search, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Key,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';

interface ModulePermissions {
  procurement: boolean;
  salesOrders: boolean;
  quotations: boolean;
  negotiations: boolean;
  approvals: boolean;
  quality: boolean;
  maintenance: boolean;
  calibration: boolean;
  costs: boolean;
}

const DEFAULT_MODULES: ModulePermissions = {
  procurement: true,
  salesOrders: true,
  quotations: true,
  negotiations: true,
  approvals: true,
  quality: true,
  maintenance: true,
  calibration: true,
  costs: true
};

const MODULE_DEFINITIONS = [
  { id: 'procurement', label: 'Compras / Suprimentos' },
  { id: 'salesOrders', label: 'Pedidos de Venda' },
  { id: 'quotations', label: 'Cotações de Venda' },
  { id: 'negotiations', label: 'Negociações' },
  { id: 'approvals', label: 'Centro de Aprovações' },
  { id: 'quality', label: 'Qualidade (QLDADE)' },
  { id: 'maintenance', label: 'Manutenção (CAB)' },
  { id: 'calibration', label: 'Calibração' },
  { id: 'costs', label: 'Gestão de Receitas' }
];

export default function UserManagementView() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Edit User Dialog
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create User Dialog (Manual Single User)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [newUser, setNewUser] = useState<any>({
    email: '',
    password: '',
    sapEmail: '',
    sapCompany: 'SBO_QUALITECH_IRML',
    sector: '',
    role: 'user',
    status: 'approved',
    modules: { ...DEFAULT_MODULES }
  });

  // Import Excel States
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importedUsersPreview, setImportedUsersPreview] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [overwritePasswords, setOverwritePasswords] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const userData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userData);
    } catch (error) {
      toast.error('Erro ao buscar usuários do sistema.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomPassword = (length = 8) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copiado para a área de transferência!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Update existing user in Firestore
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', selectedUser.id);
      const updateData: any = {
        role: selectedUser.role,
        status: selectedUser.status,
        sector: selectedUser.sector || '',
        sapEmail: selectedUser.sapEmail || '',
        sapCompany: selectedUser.sapCompany || '',
        password: selectedUser.password || '',
        modules: selectedUser.modules || { ...DEFAULT_MODULES },
        updatedAt: serverTimestamp()
      };

      await updateDoc(userRef, updateData);
      toast.success('Cadastro e permissões do usuário atualizados com sucesso!');
      setIsEditDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create single user manually
  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.email.includes('@')) {
      toast.error('Informe um e-mail válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedEmail = newUser.email.trim().toLowerCase();
      
      // Check if user already exists
      const existingUser = users.find(u => (u.email || '').toLowerCase().trim() === normalizedEmail);
      
      const docId = existingUser ? existingUser.id : normalizedEmail.replace(/[^a-z0-9@_.-]/g, '_');
      const userRef = doc(db, 'users', docId);

      const payload = {
        email: newUser.email.trim(),
        password: newUser.password || '',
        sapEmail: newUser.sapEmail?.trim() || newUser.email.trim(),
        sapCompany: newUser.sapCompany?.trim() || 'SBO_QUALITECH_IRML',
        sector: newUser.sector?.trim() || '',
        role: newUser.role || 'user',
        status: newUser.status || 'approved',
        modules: newUser.modules || { ...DEFAULT_MODULES },
        updatedAt: serverTimestamp(),
        ...(!existingUser ? { createdAt: serverTimestamp() } : {})
      };

      await setDoc(userRef, payload, { merge: true });
      toast.success(existingUser ? 'Usuário existente atualizado com sucesso!' : 'Novo usuário cadastrado com sucesso!');
      setIsCreateDialogOpen(false);
      setNewUser({
        email: '',
        password: '',
        sapEmail: '',
        sapCompany: 'SBO_QUALITECH_IRML',
        sector: '',
        role: 'user',
        status: 'approved',
        modules: { ...DEFAULT_MODULES }
      });
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar novo usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete user from Firestore
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este acesso permanentemente?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      toast.success('Acesso removido com sucesso.');
      fetchUsers();
    } catch (error) {
      toast.error('Erro ao excluir usuário.');
    }
  };

  // Helper parsing functions for Excel batch import
  const parseBoolean = (val: any, defaultVal = true): boolean => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'boolean') return val;
    const str = String(val).trim().toUpperCase();
    if (['SIM', 'S', 'YES', 'Y', 'TRUE', '1', 'VERDADEIRO'].includes(str)) return true;
    if (['NÃO', 'NAO', 'N', 'NO', 'FALSE', '0', 'FALSO'].includes(str)) return false;
    return defaultVal;
  };

  const parseRole = (val: any): string => {
    if (!val) return 'user';
    const str = String(val).trim().toLowerCase();
    if (str.includes('admin') || str.includes('administrador')) return 'admin';
    return 'user';
  };

  const parseStatus = (val: any): string => {
    if (!val) return 'approved';
    const str = String(val).trim().toLowerCase();
    if (str.includes('pend') || str.includes('pendente')) return 'pending';
    if (str.includes('bloq') || str.includes('blocked') || str.includes('bloqueado')) return 'blocked';
    if (str.includes('aprov') || str.includes('approved') || str.includes('aprovado')) return 'approved';
    return 'approved';
  };

  // Download official Excel template for initial load / maintenance with Senha column
  const downloadTemplate = () => {
    const templateData = [
      {
        'E-mail Plataforma': 'admin.demo@empresa.com.br',
        'Senha': 'SenhaForte#2026',
        'E-mail SAP': 'manager',
        'Empresa SAP (CompanyDB)': 'SBO_QUALITECH_IRML',
        'Nível de Acesso (admin/user)': 'admin',
        'Status (approved/pending/blocked)': 'approved',
        'Setor': 'TI e Inovação',
        'Compras (SIM/NAO)': 'SIM',
        'Pedidos Venda (SIM/NAO)': 'SIM',
        'Cotações Venda (SIM/NAO)': 'SIM',
        'Negociações (SIM/NAO)': 'SIM',
        'Aprovações (SIM/NAO)': 'SIM',
        'Qualidade (SIM/NAO)': 'SIM',
        'Manutenção (SIM/NAO)': 'SIM',
        'Calibração (SIM/NAO)': 'SIM',
        'Gestão de Receitas (SIM/NAO)': 'SIM'
      },
      {
        'E-mail Plataforma': 'comercial.silva@empresa.com.br',
        'Senha': 'Mudar@1234',
        'E-mail SAP': 'comercial.silva@empresa.com.br',
        'Empresa SAP (CompanyDB)': 'SBO_QUALITECH_IRML',
        'Nível de Acesso (admin/user)': 'user',
        'Status (approved/pending/blocked)': 'approved',
        'Setor': 'Comercial',
        'Compras (SIM/NAO)': 'SIM',
        'Pedidos Venda (SIM/NAO)': 'SIM',
        'Cotações Venda (SIM/NAO)': 'SIM',
        'Negociações (SIM/NAO)': 'SIM',
        'Aprovações (SIM/NAO)': 'SIM',
        'Qualidade (SIM/NAO)': 'NAO',
        'Manutenção (SIM/NAO)': 'NAO',
        'Calibração (SIM/NAO)': 'NAO',
        'Gestão de Receitas (SIM/NAO)': 'NAO'
      },
      {
        'E-mail Plataforma': 'suprimentos.costa@empresa.com.br',
        'Senha': 'Mudar@1234',
        'E-mail SAP': 'suprimentos.costa@empresa.com.br',
        'Empresa SAP (CompanyDB)': 'SBO_QUALITECH_IRML',
        'Nível de Acesso (admin/user)': 'user',
        'Status (approved/pending/blocked)': 'approved',
        'Setor': 'Suprimentos',
        'Compras (SIM/NAO)': 'SIM',
        'Pedidos Venda (SIM/NAO)': 'NAO',
        'Cotações Venda (SIM/NAO)': 'NAO',
        'Negociações (SIM/NAO)': 'SIM',
        'Aprovações (SIM/NAO)': 'SIM',
        'Qualidade (SIM/NAO)': 'NAO',
        'Manutenção (SIM/NAO)': 'NAO',
        'Calibração (SIM/NAO)': 'NAO',
        'Gestão de Receitas (SIM/NAO)': 'SIM'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    worksheet['!cols'] = [
      { wch: 34 }, // E-mail Plataforma
      { wch: 18 }, // Senha
      { wch: 30 }, // E-mail SAP
      { wch: 26 }, // Empresa SAP
      { wch: 25 }, // Nível de Acesso
      { wch: 25 }, // Status
      { wch: 22 }, // Setor
      { wch: 18 }, // Compras
      { wch: 18 }, // Pedidos Venda
      { wch: 18 }, // Cotações Venda
      { wch: 18 }, // Negociações
      { wch: 18 }, // Aprovações
      { wch: 18 }, // Qualidade
      { wch: 18 }, // Manutenção
      { wch: 18 }, // Calibração
      { wch: 18 }, // Gestão de Receitas
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo_Carga_Usuarios');
    XLSX.writeFile(workbook, 'Modelo_Carga_Usuarios_Qualitech.xlsx');
    toast.success('Modelo Excel com campo Senha baixado com sucesso!');
  };

  // Export current users list to Excel
  const exportUsersToExcel = () => {
    if (users.length === 0) {
      toast.error('Nenhum usuário para exportar.');
      return;
    }

    const exportData = users.map(u => ({
      'E-mail Plataforma': u.email || '',
      'Senha': u.password || '',
      'E-mail SAP': u.sapEmail || '',
      'Empresa SAP (CompanyDB)': u.sapCompany || '',
      'Nível de Acesso (admin/user)': u.role || 'user',
      'Status (approved/pending/blocked)': u.status || 'approved',
      'Setor': u.sector || '',
      'Compras (SIM/NAO)': u.modules?.procurement !== false ? 'SIM' : 'NAO',
      'Pedidos Venda (SIM/NAO)': u.modules?.salesOrders !== false ? 'SIM' : 'NAO',
      'Cotações Venda (SIM/NAO)': u.modules?.quotations !== false ? 'SIM' : 'NAO',
      'Negociações (SIM/NAO)': u.modules?.negotiations !== false ? 'SIM' : 'NAO',
      'Aprovações (SIM/NAO)': u.modules?.approvals !== false ? 'SIM' : 'NAO',
      'Qualidade (SIM/NAO)': u.modules?.quality !== false ? 'SIM' : 'NAO',
      'Manutenção (SIM/NAO)': u.modules?.maintenance !== false ? 'SIM' : 'NAO',
      'Calibração (SIM/NAO)': u.modules?.calibration !== false ? 'SIM' : 'NAO',
      'Gestão de Receitas (SIM/NAO)': u.modules?.costs !== false ? 'SIM' : 'NAO',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios_Atuais');
    XLSX.writeFile(workbook, `Usuarios_Qualitech_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exportados ${users.length} usuários para Excel.`);
  };

  // Handle spreadsheet file parsing
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    e.target.value = '';

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          toast.error('O arquivo selecionado está vazio.');
          setImportedUsersPreview([]);
          return;
        }

        const parsedList: any[] = [];
        const existingEmailsMap = new Map<string, any>(
          users.map(u => [(u.email || '').toLowerCase().trim(), u])
        );

        rawJson.forEach((row, idx) => {
          const email = String(
            row['E-mail Plataforma'] || 
            row['Email Plataforma'] || 
            row['E-mail'] || 
            row['Email'] || 
            row['email'] || 
            row['EMAIL'] || 
            ''
          ).trim();

          if (!email || !email.includes('@')) {
            return;
          }

          const password = String(
            row['Senha'] || 
            row['senha'] || 
            row['SENHA'] || 
            row['Password'] || 
            row['password'] || 
            row['Senha Inicial'] || 
            row['Senha de Acesso'] || 
            ''
          ).trim();

          const sapEmail = String(
            row['E-mail SAP'] || 
            row['Email SAP'] || 
            row['sapEmail'] || 
            row['Usuario SAP'] ||
            email
          ).trim();

          const sapCompany = String(
            row['Empresa SAP (CompanyDB)'] || 
            row['Empresa SAP'] || 
            row['CompanyDB'] || 
            row['sapCompany'] || 
            'SBO_QUALITECH_IRML'
          ).trim();

          const sector = String(
            row['Setor'] || 
            row['SETOR'] || 
            row['setor'] || 
            row['Department'] || 
            row['Departamento'] || 
            ''
          ).trim();

          const role = parseRole(row['Nível de Acesso (admin/user)'] || row['Nível de Acesso'] || row['Role'] || row['role']);
          const status = parseStatus(row['Status (approved/pending/blocked)'] || row['Status'] || row['status']);

          const modules = {
            procurement: parseBoolean(row['Compras (SIM/NAO)'] ?? row['Compras'] ?? row['procurement'], true),
            salesOrders: parseBoolean(row['Pedidos Venda (SIM/NAO)'] ?? row['Pedidos Venda'] ?? row['salesOrders'], true),
            quotations: parseBoolean(row['Cotações Venda (SIM/NAO)'] ?? row['Cotações Venda'] ?? row['quotations'], true),
            negotiations: parseBoolean(row['Negociações (SIM/NAO)'] ?? row['Negociações'] ?? row['negotiations'], true),
            approvals: parseBoolean(row['Aprovações (SIM/NAO)'] ?? row['Aprovações'] ?? row['approvals'], true),
            quality: parseBoolean(row['Qualidade (SIM/NAO)'] ?? row['Qualidade'] ?? row['quality'], true),
            maintenance: parseBoolean(row['Manutenção (SIM/NAO)'] ?? row['Manutenção'] ?? row['maintenance'], true),
            calibration: parseBoolean(row['Calibração (SIM/NAO)'] ?? row['Calibração'] ?? row['calibration'], true),
            costs: parseBoolean(row['Gestão de Receitas (SIM/NAO)'] ?? row['Gestão de Receitas'] ?? row['Receitas'] ?? row['Gestão de Custos (SIM/NAO)'] ?? row['Gestão de Custos'] ?? row['Custos'] ?? row['costs'], true),
          };

          const isExisting = existingEmailsMap.has(email.toLowerCase());
          const existingRecord = existingEmailsMap.get(email.toLowerCase());

          parsedList.push({
            email,
            password,
            sapEmail,
            sapCompany,
            sector,
            role,
            status,
            modules,
            isExisting,
            existingId: existingRecord?.id,
            rowNum: idx + 2
          });
        });

        if (parsedList.length === 0) {
          toast.error('Nenhum usuário válido com e-mail foi encontrado na planilha.');
        } else {
          const newCount = parsedList.filter(p => !p.isExisting).length;
          const updateCount = parsedList.filter(p => p.isExisting).length;
          toast.success(`${parsedList.length} registros identificados (${newCount} novos, ${updateCount} a atualizar).`);
        }

        setImportedUsersPreview(parsedList);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao ler arquivo Excel/CSV.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Submit batch user creation/update to Firestore by email
  const handleProcessImport = async () => {
    if (importedUsersPreview.length === 0) {
      toast.error('Selecione uma planilha com dados válidos.');
      return;
    }

    setIsImporting(true);
    let createdCount = 0;
    let updatedCount = 0;
    let failCount = 0;

    try {
      for (const item of importedUsersPreview) {
        try {
          const normalizedEmail = item.email.toLowerCase().trim();
          
          // Determine document reference: if existing user was matched, use their docId; otherwise create one
          let targetDocId = item.existingId;
          
          if (!targetDocId) {
            // Check direct in existing users or create clean slug
            const existing = users.find(u => (u.email || '').toLowerCase().trim() === normalizedEmail);
            targetDocId = existing ? existing.id : normalizedEmail.replace(/[^a-z0-9@_.-]/g, '_');
          }

          const userRef = doc(db, 'users', targetDocId);

          const payload: any = {
            email: item.email,
            sapEmail: item.sapEmail,
            sapCompany: item.sapCompany,
            sector: item.sector || '',
            role: item.role,
            status: item.status,
            modules: item.modules,
            updatedAt: serverTimestamp()
          };

          // If password is provided, or if overwritePasswords is true and password exists
          if (item.password) {
            payload.password = item.password;
          }

          if (item.isExisting) {
            await setDoc(userRef, payload, { merge: true });
            updatedCount++;
          } else {
            payload.createdAt = serverTimestamp();
            await setDoc(userRef, payload, { merge: true });
            createdCount++;
          }
        } catch (err) {
          console.error(`Erro ao salvar usuário ${item.email}:`, err);
          failCount++;
        }
      }

      const totalSuccess = createdCount + updatedCount;
      if (totalSuccess > 0) {
        toast.success(
          `Carga realizada com sucesso! ${createdCount} novos usuários incluídos e ${updatedCount} atualizados.${failCount > 0 ? ` (${failCount} erros)` : ''}`
        );
        setIsImportDialogOpen(false);
        setImportedUsersPreview([]);
        setImportFileName('');
        await fetchUsers();
      } else {
        toast.error(`Falha ao gravar os usuários na base de dados (${failCount} erros).`);
      }
    } catch (error) {
      console.error(error);
      toast.error('Ocorreu um erro durante o processamento da carga.');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.sapEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.sector || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesStatus = filterStatus === 'all' || u.status === filterStatus;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
      id="user-management-container"
    >
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-evo-dark uppercase">Gestão e Carga de Usuários</h1>
          <div className="h-1.5 w-16 bg-evo-teal rounded-full mt-2" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-evo-dark/40 mt-2">
            Manutenção de Contas, Senhas e Permissões por Módulo
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          <Button 
            id="btn-new-user"
            onClick={() => {
              setNewUser({
                email: '',
                password: generateRandomPassword(),
                sapEmail: '',
                sapCompany: 'SBO_QUALITECH_IRML',
                sector: '',
                role: 'user',
                status: 'approved',
                modules: { ...DEFAULT_MODULES }
              });
              setIsCreateDialogOpen(true);
            }} 
            className="h-10 rounded-none bg-evo-teal hover:bg-evo-teal-dark text-white uppercase text-[10px] font-black tracking-widest flex items-center gap-2 shadow-md"
          >
            <UserPlus className="w-3.5 h-3.5" /> Novo Usuário
          </Button>

          <Button 
            id="btn-import-excel"
            onClick={() => setIsImportDialogOpen(true)} 
            className="h-10 rounded-none bg-evo-dark hover:bg-black text-white uppercase text-[10px] font-black tracking-widest flex items-center gap-2 shadow-md"
          >
            <Upload className="w-3.5 h-3.5 text-evo-teal" /> Carga Excel / CSV
          </Button>

          <Button 
            id="btn-template-excel"
            onClick={downloadTemplate} 
            variant="outline" 
            className="h-10 rounded-none border-evo-bg bg-white px-3.5 uppercase text-[10px] font-bold tracking-widest hover:bg-evo-bg/50 flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-evo-teal" /> Baixar Modelo
          </Button>

          <Button 
            id="btn-export-excel"
            onClick={exportUsersToExcel} 
            variant="outline" 
            className="h-10 rounded-none border-evo-bg bg-white px-3.5 uppercase text-[10px] font-bold tracking-widest hover:bg-evo-bg/50 flex items-center gap-2"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Exportar Base
          </Button>

          <Button 
            id="btn-refresh-users"
            onClick={fetchUsers} 
            variant="ghost" 
            className="h-10 rounded-none border border-evo-bg px-3 uppercase text-[10px] font-bold tracking-widest hover:bg-evo-bg"
            title="Atualizar lista"
          >
            <RefreshCw className="w-3.5 h-3.5 text-evo-dark/60" />
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 border border-evo-bg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-evo-dark/30 w-4 h-4" />
          <Input 
            id="input-search-users"
            placeholder="BUSCAR POR E-MAIL, SETOR, SAP OU PERMISSÃO..." 
            className="pl-10 h-10 rounded-none border-evo-bg bg-evo-bg/20 text-[11px] font-bold uppercase tracking-wider"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="h-10 rounded-none border-evo-bg text-[10px] font-bold uppercase w-36 bg-white">
              <SelectValue placeholder="Nível de Acesso" />
            </SelectTrigger>
            <SelectContent className="rounded-none font-sans">
              <SelectItem value="all" className="text-xs uppercase font-bold">Todos Perfis</SelectItem>
              <SelectItem value="admin" className="text-xs uppercase font-bold">Administrador</SelectItem>
              <SelectItem value="user" className="text-xs uppercase font-bold">Usuário Comum</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-10 rounded-none border-evo-bg text-[10px] font-bold uppercase w-36 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-none font-sans">
              <SelectItem value="all" className="text-xs uppercase font-bold">Todos Status</SelectItem>
              <SelectItem value="approved" className="text-xs uppercase font-bold">Aprovados</SelectItem>
              <SelectItem value="pending" className="text-xs uppercase font-bold">Pendentes</SelectItem>
              <SelectItem value="blocked" className="text-xs uppercase font-bold">Bloqueados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <Card className="evo-card border-none overflow-hidden shadow-xl" id="card-users-list">
        <CardHeader className="bg-evo-dark px-8 py-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">
              Usuários Registrados na Plataforma
            </CardTitle>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mt-0.5">
              Exibindo {filteredUsers.length} de {users.length} usuários cadastrados
            </p>
          </div>
          <Badge className="bg-evo-teal text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
            RBAC & Senhas Ativos
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-evo-teal w-10 h-10" />
              <p className="text-[10px] font-black uppercase tracking-widest text-evo-dark/40">Carregando usuários...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-evo-bg/30">
                  <TableRow className="border-evo-bg hover:bg-transparent">
                    <TableHead className="text-[10px] font-black uppercase px-6 py-4">Status</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">E-mail Plataforma</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Senha / Credencial</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Setor</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Vínculo SAP</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Acesso</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-right px-6">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const isPassVisible = !!visiblePasswords[user.id];
                    const hasPassword = !!user.password;
                    return (
                      <TableRow key={user.id} className="border-evo-bg transition-colors hover:bg-evo-teal/5 group">
                        <TableCell className="px-6 py-4">
                          <Badge className={`rounded-none uppercase text-[8px] font-bold tracking-widest ${
                            user.status === 'approved' ? 'bg-green-600' : 
                            user.status === 'pending' ? 'bg-amber-500' : 'bg-red-600'
                          } text-white border-none`}>
                            {user.status === 'approved' ? 'Aprovado' : user.status === 'pending' ? 'Pendente' : 'Bloqueado'}
                          </Badge>
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-evo-bg flex items-center justify-center rounded">
                              <User className="w-4 h-4 text-evo-dark/50" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-evo-dark">{user.email}</p>
                              {user.uid && <p className="text-[8px] font-mono text-evo-dark/30">UID: {user.uid.slice(0, 10)}...</p>}
                            </div>
                          </div>
                        </TableCell>

                        {/* Senha Maintenance Column */}
                        <TableCell>
                          {hasPassword ? (
                            <div className="flex items-center gap-1.5 bg-evo-bg/40 px-2.5 py-1 border border-evo-bg w-fit">
                              <Key className="w-3 h-3 text-evo-teal" />
                              <span className="font-mono text-xs text-evo-dark">
                                {isPassVisible ? user.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(user.id)}
                                className="text-evo-dark/40 hover:text-evo-dark p-0.5 ml-1"
                                title={isPassVisible ? "Ocultar senha" : "Ver senha"}
                              >
                                {isPassVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(user.password, `pass-${user.id}`)}
                                className="text-evo-dark/40 hover:text-evo-teal p-0.5"
                                title="Copiar senha"
                              >
                                {copiedId === `pass-${user.id}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[9px] font-mono text-evo-dark/30 italic">Não definida</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className="rounded-none border-evo-dark/15 text-evo-dark text-[9px] font-bold uppercase tracking-wider bg-evo-bg/30">
                            {user.sector || 'NÃO DEFINIDO'}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-tight text-evo-dark">{user.sapEmail || 'NÃO CONFIGURADO'}</p>
                            <p className="text-[8px] font-bold text-evo-teal uppercase tracking-wider">{user.sapCompany || '-'}</p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={`rounded-none text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 w-fit ${
                            user.role === 'admin' 
                              ? 'border-evo-teal bg-evo-teal/10 text-evo-teal font-bold' 
                              : 'border-evo-dark/20 text-evo-dark/70'
                          }`}>
                            {user.role === 'admin' ? <Shield className="w-3 h-3 text-evo-teal" /> : null}
                            {user.role === 'admin' ? 'ADMIN' : 'USUÁRIO'}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right px-6">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-evo-dark/60 hover:text-evo-teal hover:bg-evo-teal/10 rounded-none transition-all"
                              title="Editar usuário e senha"
                              onClick={() => {
                                setSelectedUser({
                                  ...user,
                                  modules: user.modules || { ...DEFAULT_MODULES }
                                });
                                setShowEditPassword(false);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-evo-dark/40 hover:text-red-600 hover:bg-red-50 rounded-none transition-all"
                              title="Excluir usuário"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-16 text-center text-xs font-black uppercase tracking-widest text-evo-dark/30 italic">
                        Nenhum usuário localizado com os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL 1: CREATE NEW USER MANUALLY */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="rounded-none border-none shadow-2xl p-0 overflow-hidden sm:max-w-2xl max-h-[85vh] flex flex-col">
          <div className="bg-evo-dark px-8 py-5 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-white uppercase font-black tracking-tight flex items-center gap-3 text-base">
                <UserPlus className="w-5 h-5 text-evo-teal" /> Novo Usuário na Plataforma
              </DialogTitle>
              <CardDescription className="text-white/40 uppercase text-[9px] font-bold tracking-[0.2em]">
                Cadastro individual com credenciais e permissões
              </CardDescription>
            </DialogHeader>
          </div>

          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  E-mail da Plataforma *
                </Label>
                <Input 
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="colaborador@empresa.com.br"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                  required
                />
              </div>

              {/* Password field with random generator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                    Senha de Acesso *
                  </Label>
                  <button
                    type="button"
                    onClick={() => setNewUser({ ...newUser, password: generateRandomPassword() })}
                    className="text-[9px] font-bold text-evo-teal uppercase hover:underline"
                  >
                    Gerar Senha
                  </button>
                </div>
                <div className="relative">
                  <Input 
                    type={showCreatePassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Defina ou gere a senha"
                    className="rounded-none border-evo-bg h-10 text-xs font-mono font-bold pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-evo-dark/40 hover:text-evo-dark"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-evo-bg">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Nível de Permissão</Label>
                <Select 
                  value={newUser.role} 
                  onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/20 text-xs font-bold h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="user" className="text-xs uppercase font-bold">Standard User (Usuário Comum)</SelectItem>
                    <SelectItem value="admin" className="text-xs uppercase font-bold">Administrator (Gestor do Portal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Estado da Conta</Label>
                <Select 
                  value={newUser.status} 
                  onValueChange={(val) => setNewUser({ ...newUser, status: val })}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/20 text-xs font-bold h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="approved" className="text-xs uppercase font-bold">Aprovado (Acesso Liberado)</SelectItem>
                    <SelectItem value="pending" className="text-xs uppercase font-bold">Pendente de Aprovação</SelectItem>
                    <SelectItem value="blocked" className="text-xs uppercase font-bold">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-evo-bg">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Setor / Departamento</Label>
                <Input 
                  value={newUser.sector}
                  onChange={(e) => setNewUser({ ...newUser, sector: e.target.value })}
                  placeholder="Ex: Comercial, TI, Suprimentos"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Usuário / E-mail SAP</Label>
                <Input 
                  value={newUser.sapEmail}
                  onChange={(e) => setNewUser({ ...newUser, sapEmail: e.target.value })}
                  placeholder="manager ou email@sap"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Banco SAP (CompanyDB)</Label>
                <Input 
                  value={newUser.sapCompany}
                  onChange={(e) => setNewUser({ ...newUser, sapCompany: e.target.value })}
                  placeholder="SBO_QUALITECH_IRML"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>
            </div>

            {/* Modules Checkboxes */}
            <div className="space-y-3 pt-4 border-t border-evo-bg">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  Permissões por Módulo
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allOn = { ...DEFAULT_MODULES };
                      setNewUser({ ...newUser, modules: allOn });
                    }}
                    className="text-[9px] font-bold text-evo-teal uppercase hover:underline"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-evo-dark/20">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      const allOff = Object.keys(DEFAULT_MODULES).reduce((acc, k) => ({ ...acc, [k]: false }), {});
                      setNewUser({ ...newUser, modules: allOff });
                    }}
                    className="text-[9px] font-bold text-evo-dark/50 uppercase hover:underline"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {MODULE_DEFINITIONS.map((mod) => {
                  const isChecked = newUser.modules?.[mod.id] !== false;
                  return (
                    <label key={mod.id} className="flex items-center space-x-2 bg-evo-bg/20 hover:bg-evo-bg/40 p-2.5 border border-evo-bg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={(e) => {
                          setNewUser({
                            ...newUser,
                            modules: { ...newUser.modules, [mod.id]: e.target.checked }
                          });
                        }}
                        className="w-4 h-4 text-evo-teal rounded border-gray-300 focus:ring-evo-teal cursor-pointer"
                      />
                      <span className="text-[10px] font-black uppercase tracking-tight text-evo-dark">
                        {mod.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="bg-evo-bg/50 p-4 sm:p-6 border-t border-evo-bg flex-shrink-0">
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="rounded-none uppercase text-[10px] font-bold tracking-widest h-10">
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateUser} 
              disabled={isSubmitting}
              className="evo-button-primary h-10 px-8 rounded-none shadow-xl"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Novo Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: EDIT USER & MAINTENANCE */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-none border-none shadow-2xl p-0 overflow-hidden sm:max-w-2xl max-h-[85vh] flex flex-col">
          <div className="bg-evo-dark px-8 py-5 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-white uppercase font-black tracking-tight flex items-center gap-3 text-base">
                <Edit2 className="w-5 h-5 text-evo-teal" /> Manutenção do Usuário: {selectedUser?.email}
              </DialogTitle>
              <CardDescription className="text-white/40 uppercase text-[9px] font-bold tracking-[0.2em]">
                Atualização de credenciais, senha e permissões
              </CardDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  E-mail da Plataforma
                </Label>
                <Input 
                  value={selectedUser?.email || ''} 
                  disabled 
                  className="rounded-none border-evo-bg bg-evo-bg/50 h-10 text-xs font-bold text-evo-dark/60"
                />
              </div>

              {/* Password field with random generator in Edit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                    Senha de Acesso (Manutenção)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setSelectedUser({ ...selectedUser, password: generateRandomPassword() })}
                    className="text-[9px] font-bold text-evo-teal uppercase hover:underline"
                  >
                    Gerar Nova Senha
                  </button>
                </div>
                <div className="relative">
                  <Input 
                    type={showEditPassword ? 'text' : 'password'}
                    value={selectedUser?.password || ''}
                    onChange={(e) => setSelectedUser({ ...selectedUser, password: e.target.value })}
                    placeholder="Digite a nova senha"
                    className="rounded-none border-evo-bg h-10 text-xs font-mono font-bold pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-evo-dark/40 hover:text-evo-dark"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-evo-bg">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Nível de Permissão</Label>
                <Select 
                  value={selectedUser?.role} 
                  onValueChange={(val) => setSelectedUser({ ...selectedUser, role: val })}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/20 text-xs font-bold h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="user" className="text-xs uppercase font-bold">Standard User (Usuário Comum)</SelectItem>
                    <SelectItem value="admin" className="text-xs uppercase font-bold">Administrator (Gestor do Portal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Estado da Conta</Label>
                <Select 
                  value={selectedUser?.status} 
                  onValueChange={(val) => setSelectedUser({ ...selectedUser, status: val })}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/20 text-xs font-bold h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="approved" className="text-xs uppercase font-bold">Aprovado (Liberado)</SelectItem>
                    <SelectItem value="pending" className="text-xs uppercase font-bold">Pendente</SelectItem>
                    <SelectItem value="blocked" className="text-xs uppercase font-bold">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-evo-bg">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Setor / Departamento</Label>
                <Input 
                  value={selectedUser?.sector || ''}
                  onChange={(e) => setSelectedUser({ ...selectedUser, sector: e.target.value })}
                  placeholder="TI, Comercial, Suprimentos..."
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">E-mail Vinculado no SAP</Label>
                <Input 
                  value={selectedUser?.sapEmail || ''}
                  onChange={(e) => setSelectedUser({ ...selectedUser, sapEmail: e.target.value })}
                  placeholder="manager@empresa.com"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Empresa SAP (CompanyDB)</Label>
                <Input 
                  value={selectedUser?.sapCompany || ''}
                  onChange={(e) => setSelectedUser({ ...selectedUser, sapCompany: e.target.value })}
                  placeholder="SBO_QUALITECH_IRML"
                  className="rounded-none border-evo-bg h-10 text-xs font-bold"
                />
              </div>
            </div>

            {/* Modules Checkboxes */}
            <div className="space-y-3 pt-4 border-t border-evo-bg">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  Módulos Permitidos para este Usuário
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser({ ...selectedUser, modules: { ...DEFAULT_MODULES } });
                    }}
                    className="text-[9px] font-bold text-evo-teal uppercase hover:underline"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-evo-dark/20">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      const allOff = Object.keys(DEFAULT_MODULES).reduce((acc, k) => ({ ...acc, [k]: false }), {});
                      setSelectedUser({ ...selectedUser, modules: allOff });
                    }}
                    className="text-[9px] font-bold text-evo-dark/50 uppercase hover:underline"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {MODULE_DEFINITIONS.map((mod) => {
                  const currentMods = selectedUser?.modules || { ...DEFAULT_MODULES };
                  const isChecked = currentMods[mod.id] !== false;
                  return (
                    <label key={mod.id} className="flex items-center space-x-2 bg-evo-bg/20 hover:bg-evo-bg/40 p-2.5 border border-evo-bg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        id={`user-mod-${mod.id}`}
                        checked={isChecked}
                        onChange={(e) => {
                          const updated = { ...currentMods, [mod.id]: e.target.checked };
                          setSelectedUser({ ...selectedUser, modules: updated });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-evo-teal focus:ring-evo-teal transition-all cursor-pointer"
                      />
                      <span className="text-[10px] font-black uppercase tracking-tight text-evo-dark cursor-pointer">
                        {mod.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="bg-evo-bg/50 p-4 sm:p-6 border-t border-evo-bg flex-shrink-0">
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-none uppercase text-[10px] font-bold tracking-widest h-10">
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdateUser} 
              disabled={isSubmitting}
              className="evo-button-primary h-10 px-10 rounded-none shadow-xl"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: BATCH IMPORT EXCEL (CARGA DE USUÁRIOS) */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="rounded-none border-none shadow-2xl p-0 overflow-hidden sm:max-w-4xl max-h-[85vh] flex flex-col">
          <div className="bg-evo-dark px-8 py-5 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-white uppercase font-black tracking-tight flex items-center gap-3 text-base">
                <FileSpreadsheet className="w-5 h-5 text-evo-teal" /> Carga em Lote de Usuários e Senhas (Excel / CSV)
              </DialogTitle>
              <CardDescription className="text-white/40 uppercase text-[9px] font-bold tracking-[0.2em]">
                Inclui novos usuários e atualiza os existentes de acordo com o e-mail
              </CardDescription>
            </DialogHeader>
          </div>

          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
            {/* Step 1: File selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  1. Selecionar Planilha (.XLSX / .XLS / .CSV) com Coluna Senha
                </Label>
                <Button 
                  type="button"
                  variant="ghost" 
                  onClick={downloadTemplate}
                  className="text-[10px] font-bold uppercase tracking-widest text-evo-teal hover:bg-evo-teal/10 h-7 px-3"
                >
                  <Download className="w-3 h-3 mr-1" /> Baixar Modelo Atualizado
                </Button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-evo-bg hover:border-evo-teal/50 bg-evo-bg/10 p-6 sm:p-8 text-center cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-10 h-10 text-evo-teal mx-auto mb-3" />
                <p className="text-xs font-black uppercase text-evo-dark">
                  {importFileName ? importFileName : 'Clique aqui para carregar a planilha'}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-evo-dark/40 mt-1">
                  Suporta colunas: E-mail Plataforma, Senha, E-mail SAP, Empresa SAP, Nível de Acesso, Status, Setor, Módulos
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Step 2: Preview table if data loaded */}
            {importedUsersPreview.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-evo-bg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                      2. Pré-visualização da Carga ({importedUsersPreview.length} Usuários Identificados)
                    </Label>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 border border-green-200">
                        {importedUsersPreview.filter(p => !p.isExisting).length} Novos Usuários
                      </span>
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 border border-blue-200">
                        {importedUsersPreview.filter(p => p.isExisting).length} Usuários Existentes (Atualização)
                      </span>
                    </div>
                  </div>

                  <Badge className="bg-evo-teal text-white rounded-none text-[8px] font-bold uppercase tracking-widest self-start sm:self-auto">
                    Pronto para Processar
                  </Badge>
                </div>

                <div className="max-h-60 overflow-y-auto border border-evo-bg">
                  <Table>
                    <TableHeader className="bg-evo-bg/30 sticky top-0 bg-white z-10">
                      <TableRow className="border-evo-bg">
                        <TableHead className="text-[9px] font-black uppercase py-2">Linha</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Operação</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">E-mail Plataforma</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Senha</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Setor</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Acesso</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importedUsersPreview.map((user, idx) => (
                        <TableRow key={idx} className="border-evo-bg hover:bg-evo-teal/5 text-xs">
                          <TableCell className="font-mono text-[9px] text-evo-dark/40 py-2">#{user.rowNum}</TableCell>
                          <TableCell className="py-2">
                            {user.isExisting ? (
                              <Badge className="bg-blue-100 text-blue-800 border-none rounded-none text-[8px] uppercase font-black tracking-wider">
                                Atualizar
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800 border-none rounded-none text-[8px] uppercase font-black tracking-wider">
                                Novo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-bold py-2">{user.email}</TableCell>
                          <TableCell className="font-mono text-[9px] text-evo-teal py-2">
                            {user.password ? `${user.password.slice(0, 3)}***` : <span className="text-evo-dark/30 italic">Sem alteração</span>}
                          </TableCell>
                          <TableCell className="font-semibold text-evo-dark py-2">{user.sector || '-'}</TableCell>
                          <TableCell className="uppercase text-[9px] font-bold py-2">{user.role}</TableCell>
                          <TableCell className="py-2">
                            <Badge className="text-[8px] uppercase font-bold rounded-none bg-evo-teal/20 text-evo-teal border-none">
                              {user.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="bg-evo-bg/50 p-4 sm:p-6 border-t border-evo-bg flex items-center justify-between flex-shrink-0">
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportedUsersPreview([]);
                setImportFileName('');
              }} 
              className="rounded-none uppercase text-[10px] font-bold tracking-widest h-10"
            >
              Cancelar
            </Button>
            
            <Button 
              onClick={handleProcessImport} 
              disabled={isImporting || importedUsersPreview.length === 0}
              className="evo-button-primary h-10 px-8 rounded-none shadow-xl flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processando Carga...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Executar Carga ({importedUsersPreview.length} Usuários)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
