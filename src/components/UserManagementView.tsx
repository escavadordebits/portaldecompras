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
import { Loader2, UserPlus, Shield, User, Trash2, Edit2, Search, Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function UserManagementView() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import Excel States
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importedUsersPreview, setImportedUsersPreview] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
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

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', selectedUser.id);
      await updateDoc(userRef, {
        role: selectedUser.role,
        status: selectedUser.status,
        sector: selectedUser.sector || '',
        sapEmail: selectedUser.sapEmail,
        sapCompany: selectedUser.sapCompany,
        modules: selectedUser.modules || {
          procurement: true,
          salesOrders: true,
          quotations: true,
          negotiations: true,
          quality: true,
          maintenance: true,
          calibration: true,
          costs: true,
          approvals: true
        }
      });
      toast.success('Usuário e permissões atualizados com sucesso!');
      setIsEditDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error('Erro ao atualizar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este acesso?')) return;
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

  // Download official Excel template for initial load
  const downloadTemplate = () => {
    const templateData = [
      {
        'E-mail Plataforma': 'admin.demo@empresa.com.br',
        'E-mail SAP': 'admin.demo@empresa.com.br',
        'Empresa SAP (CompanyDB)': 'SBO_COMPANY_PROD',
        'Nível de Acesso (admin/user)': 'admin',
        'Status (approved/pending/blocked)': 'approved',
        'Compras (SIM/NAO)': 'SIM',
        'Pedidos Venda (SIM/NAO)': 'SIM',
        'Cotações Venda (SIM/NAO)': 'SIM',
        'Negociações (SIM/NAO)': 'SIM',
        'Aprovações (SIM/NAO)': 'SIM',
        'Qualidade (SIM/NAO)': 'SIM',
        'Manutenção (SIM/NAO)': 'SIM',
        'Calibração (SIM/NAO)': 'SIM',
        'Gestão de Custos (SIM/NAO)': 'SIM',
        'Setor': 'TI e Inovação'
      },
      {
        'E-mail Plataforma': 'comercial.silva@empresa.com.br',
        'E-mail SAP': 'comercial.silva@empresa.com.br',
        'Empresa SAP (CompanyDB)': 'SBO_COMPANY_PROD',
        'Nível de Acesso (admin/user)': 'user',
        'Status (approved/pending/blocked)': 'approved',
        'Compras (SIM/NAO)': 'SIM',
        'Pedidos Venda (SIM/NAO)': 'SIM',
        'Cotações Venda (SIM/NAO)': 'SIM',
        'Negociações (SIM/NAO)': 'SIM',
        'Aprovações (SIM/NAO)': 'SIM',
        'Qualidade (SIM/NAO)': 'NAO',
        'Manutenção (SIM/NAO)': 'NAO',
        'Calibração (SIM/NAO)': 'NAO',
        'Gestão de Custos (SIM/NAO)': 'NAO',
        'Setor': 'Comercial'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 32 }, // E-mail Plataforma
      { wch: 32 }, // E-mail SAP
      { wch: 25 }, // Empresa SAP
      { wch: 25 }, // Nível de Acesso
      { wch: 25 }, // Status
      { wch: 18 }, // Compras
      { wch: 18 }, // Pedidos Venda
      { wch: 18 }, // Cotações Venda
      { wch: 18 }, // Negociações
      { wch: 18 }, // Aprovações
      { wch: 18 }, // Qualidade
      { wch: 18 }, // Manutenção
      { wch: 18 }, // Calibração
      { wch: 18 }, // Gestão de Custos
      { wch: 22 }, // Setor
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template_Usuarios');
    XLSX.writeFile(workbook, 'Template_Carga_Inicial_Usuarios.xlsx');
    toast.success('Template Excel baixado com sucesso!');
  };

  // Handle spreadsheet file parsing
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    // Reset input value so re-selecting the file works properly
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

        rawJson.forEach((row, idx) => {
          // Normalize email field from various potential column names
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
            return; // Skip invalid or empty email rows
          }

          const sapEmail = String(
            row['E-mail SAP'] || 
            row['Email SAP'] || 
            row['sapEmail'] || 
            email
          ).trim();

          const sapCompany = String(
            row['Empresa SAP (CompanyDB)'] || 
            row['Empresa SAP'] || 
            row['CompanyDB'] || 
            row['sapCompany'] || 
            'SBO_COMPANY_PROD'
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
            costs: parseBoolean(row['Gestão de Custos (SIM/NAO)'] ?? row['Gestão de Custos'] ?? row['Custos'] ?? row['costs'], true),
          };

          parsedList.push({
            email,
            sapEmail,
            sapCompany,
            sector,
            role,
            status,
            modules,
            rowNum: idx + 2
          });
        });

        if (parsedList.length === 0) {
          toast.error('Nenhum usuário válido com e-mail foi encontrado na planilha.');
        } else {
          toast.success(`${parsedList.length} usuários identificados na planilha.`);
        }

        setImportedUsersPreview(parsedList);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao ler arquivo Excel/CSV.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Submit batch user creation to Firestore
  const handleProcessImport = async () => {
    if (importedUsersPreview.length === 0) {
      toast.error('Selecione uma planilha com dados válidos.');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of importedUsersPreview) {
        try {
          const docId = item.email.toLowerCase().trim().replace(/[^a-z0-9@_.-]/g, '_');
          const userRef = doc(db, 'users', docId);

          await setDoc(userRef, {
            email: item.email,
            sapEmail: item.sapEmail,
            sapCompany: item.sapCompany,
            sector: item.sector || '',
            role: item.role,
            status: item.status,
            modules: item.modules,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });

          successCount++;
        } catch (err) {
          console.error(`Erro ao salvar usuário ${item.email}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Carga concluída! ${successCount} usuários cadastrados/atualizados.${failCount > 0 ? ` (${failCount} falhas)` : ''}`);
        setIsImportDialogOpen(false);
        setImportedUsersPreview([]);
        setImportFileName('');
        await fetchUsers();
      } else {
        toast.error(`Falha ao gravar os usuários na base de dados. (${failCount} erro(s))`);
      }
    } catch (error) {
      toast.error('Ocorreu um erro durante a carga inicial.');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.sapEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.sector?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-evo-dark uppercase">Gestão de Usuários</h1>
          <div className="h-1.5 w-16 bg-evo-teal rounded-full" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-evo-dark/30 mt-3 italic">Portal Administration & RBAC</p>
        </div>
        <div className="flex flex-wrap gap-3">
           <div className="relative w-56">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-evo-dark/30 w-4 h-4" />
             <Input 
               placeholder="FILTRAR USUÁRIOS..." 
               className="pl-10 h-11 rounded-none border-evo-bg bg-white text-[10px] font-bold uppercase tracking-widest"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>

           <Button 
             onClick={downloadTemplate} 
             variant="outline" 
             className="h-11 rounded-none border-evo-bg px-4 uppercase text-[10px] font-bold tracking-widest hover:bg-evo-bg/50 flex items-center gap-2"
           >
             <Download className="w-3.5 h-3.5 text-evo-teal" /> Template Excel
           </Button>

           <Button 
             onClick={() => setIsImportDialogOpen(true)} 
             className="h-11 rounded-none evo-button-primary px-5 uppercase text-[10px] font-black tracking-widest flex items-center gap-2 shadow-lg"
           >
             <Upload className="w-3.5 h-3.5" /> Importar Excel
           </Button>

           <Button onClick={fetchUsers} variant="outline" className="h-11 rounded-none border-evo-bg px-4 uppercase text-[10px] font-bold tracking-widest hover:bg-evo-bg">
             Sincronizar
           </Button>
        </div>
      </div>

      <Card className="evo-card border-none overflow-hidden">
        <CardHeader className="bg-evo-dark px-8 py-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Usuários Registrados na Plataforma</CardTitle>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/20 mt-1">Total de {users.length} acessos configurados</p>
          </div>
          <Badge className="bg-evo-teal text-white border-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
            RBAC Ativo
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-evo-teal w-10 h-10" /></div>
          ) : (
            <Table>
              <TableHeader className="bg-evo-bg/20">
                <TableRow className="border-evo-bg hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase px-8 py-4">Status</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">E-mail Plataforma</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Setor</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Vínculo SAP</TableHead>
                  <TableHead className="text-[10px] font-black uppercase">Nível Acesso</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right px-8">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-evo-bg transition-colors hover:bg-evo-teal/5 group">
                    <TableCell className="px-8 py-6">
                      <Badge className={`rounded-none uppercase text-[8px] font-bold tracking-widest ${
                        user.status === 'approved' ? 'bg-green-500' : 
                        user.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
                      } text-white border-none`}>
                        {user.status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-evo-bg flex items-center justify-center rounded">
                           <User className="w-4 h-4 text-evo-dark/40" />
                         </div>
                         <p className="text-xs font-bold text-evo-dark">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-none border-evo-dark/10 text-evo-dark text-[9px] font-bold uppercase tracking-wider bg-evo-bg/30">
                        {user.sector || 'NÃO DEFINIDO'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-tight text-evo-dark">{user.sapEmail || 'NÃO CONFIGURADO'}</p>
                        <p className="text-[9px] font-bold text-evo-teal/60 uppercase tracking-widest">{user.sapCompany || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-none border-evo-teal/20 text-evo-teal text-[9px] font-black uppercase tracking-widest flex items-center gap-2 w-fit">
                        {user.role === 'admin' ? <Shield className="w-3 h-3" /> : null}
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-8">
                       <div className="flex justify-end gap-2">
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           className="h-8 w-8 text-evo-dark/40 hover:text-evo-teal hover:bg-evo-teal/10 rounded-none transition-all"
                           onClick={() => {
                             setSelectedUser(user);
                             setIsEditDialogOpen(true);
                           }}
                         >
                           <Edit2 className="w-3.5 h-3.5" />
                         </Button>
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           className="h-8 w-8 text-evo-dark/40 hover:text-red-500 hover:bg-red-50/50 rounded-none transition-all"
                           onClick={() => handleDeleteUser(user.id)}
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={6} className="py-20 text-center text-xs font-black uppercase tracking-widest text-evo-dark/20 italic">
                        Nenhum usuário encontrado na base de dados.
                     </TableCell>
                   </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* MODAL EDIT USER */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-none border-none shadow-2xl p-0 overflow-hidden max-w-xl max-h-[85vh] flex flex-col">
          <div className="bg-evo-dark px-8 py-5 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-white uppercase font-black tracking-tight flex items-center gap-3 text-base">
                <Edit2 className="w-5 h-5 text-evo-teal" /> Editar Configurações de Acesso
              </DialogTitle>
              <CardDescription className="text-white/40 uppercase text-[9px] font-bold tracking-[0.2em]">Sincronização de perfis e permissões</CardDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Nível de Permissão</Label>
                <Select 
                  value={selectedUser?.role} 
                  onValueChange={(val) => setSelectedUser({...selectedUser, role: val})}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/30 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="user" className="text-xs uppercase font-bold">Standard User</SelectItem>
                    <SelectItem value="admin" className="text-xs uppercase font-bold">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Estado da Conta</Label>
                <Select 
                  value={selectedUser?.status} 
                  onValueChange={(val) => setSelectedUser({...selectedUser, status: val})}
                >
                  <SelectTrigger className="rounded-none border-evo-bg bg-evo-bg/30 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none font-sans">
                    <SelectItem value="pending" className="text-xs uppercase font-bold">Pendente</SelectItem>
                    <SelectItem value="approved" className="text-xs uppercase font-bold">Aprovado</SelectItem>
                    <SelectItem value="blocked" className="text-xs uppercase font-bold">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-evo-bg">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Setor / Departamento</Label>
                <Input 
                  value={selectedUser?.sector || ''}
                  onChange={(e) => setSelectedUser({...selectedUser, sector: e.target.value})}
                  placeholder="TI, Comercial, Suprimentos..."
                  className="rounded-none border-evo-bg h-11 text-xs font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">E-mail Vinculado no SAP</Label>
                <Input 
                  value={selectedUser?.sapEmail || ''}
                  onChange={(e) => setSelectedUser({...selectedUser, sapEmail: e.target.value})}
                  placeholder="manager@empresa.com"
                  className="rounded-none border-evo-bg h-11 text-xs font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Base de Dados SAP (CompanyDB)</Label>
                <Input 
                  value={selectedUser?.sapCompany || ''}
                  onChange={(e) => setSelectedUser({...selectedUser, sapCompany: e.target.value})}
                  placeholder="SBO_COMPANY_PROD"
                  className="rounded-none border-evo-bg h-11 text-xs font-bold"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-evo-bg">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">Módulos Permitidos para este Usuário</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'procurement', label: 'Compras / Suprimentos' },
                    { id: 'salesOrders', label: 'Pedidos de Venda' },
                    { id: 'quotations', label: 'Cotações de Venda' },
                    { id: 'negotiations', label: 'Negociações' },
                    { id: 'approvals', label: 'Centro de Aprovações' },
                    { id: 'quality', label: 'Qualidade (QLDADE)' },
                    { id: 'maintenance', label: 'Manutenção (CAB)' },
                    { id: 'calibration', label: 'Calibração' },
                    { id: 'costs', label: 'Gestão de Custos' }
                  ].map((mod) => {
                    const currentMods = selectedUser?.modules || {
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
                    const isChecked = currentMods[mod.id] !== false;
                    return (
                      <div key={mod.id} className="flex items-center space-x-2 bg-evo-bg/20 p-2 border border-evo-bg">
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
                        <Label htmlFor={`user-mod-${mod.id}`} className="text-[10px] font-black uppercase tracking-tight cursor-pointer">
                          {mod.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="bg-evo-bg/50 p-4 sm:p-6 border-t border-evo-bg flex-shrink-0">
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-none uppercase text-[10px] font-bold tracking-widest h-11">Cancelar</Button>
            <Button 
              onClick={handleUpdateUser} 
              disabled={isSubmitting}
              className="evo-button-primary h-11 px-10 rounded-none shadow-xl"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL BATCH IMPORT EXCEL */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="rounded-none border-none shadow-2xl p-0 overflow-hidden sm:max-w-4xl max-h-[85vh] flex flex-col">
          <div className="bg-evo-dark px-8 py-5 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-white uppercase font-black tracking-tight flex items-center gap-3 text-base">
                <FileSpreadsheet className="w-5 h-5 text-evo-teal" /> Carga Inicial de Usuários (Excel / CSV)
              </DialogTitle>
              <CardDescription className="text-white/40 uppercase text-[9px] font-bold tracking-[0.2em]">
                Importação em lote de permissões e perfis de acesso
              </CardDescription>
            </DialogHeader>
          </div>

          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
            {/* Step 1: File selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                  1. Selecionar Arquivo de Planilha (.XLSX / .XLS / .CSV)
                </Label>
                <Button 
                  type="button"
                  variant="ghost" 
                  onClick={downloadTemplate}
                  className="text-[10px] font-bold uppercase tracking-widest text-evo-teal hover:bg-evo-teal/10 h-7 px-3"
                >
                  <Download className="w-3 h-3 mr-1" /> Baixar Modelo
                </Button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-evo-bg hover:border-evo-teal/50 bg-evo-bg/10 p-6 sm:p-8 text-center cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-10 h-10 text-evo-teal mx-auto mb-3" />
                <p className="text-xs font-black uppercase text-evo-dark">
                  {importFileName ? importFileName : 'Clique aqui para selecionar a planilha'}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-evo-dark/40 mt-1">
                  Suporta arquivos XLSX, XLS ou CSV formatados
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
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-evo-dark/60 tracking-widest">
                    2. Pré-visualização da Carga ({importedUsersPreview.length} Usuários Válidos)
                  </Label>
                  <Badge className="bg-green-500 text-white rounded-none text-[8px] font-bold uppercase tracking-widest">
                    Pronto para Importar
                  </Badge>
                </div>

                <div className="max-h-56 overflow-y-auto border border-evo-bg">
                  <Table>
                    <TableHeader className="bg-evo-bg/30 sticky top-0 bg-white z-10">
                      <TableRow className="border-evo-bg">
                        <TableHead className="text-[9px] font-black uppercase py-2">Linha</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">E-mail Plataforma</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">E-mail SAP</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Setor</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Acesso</TableHead>
                        <TableHead className="text-[9px] font-black uppercase py-2">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importedUsersPreview.map((user, idx) => (
                        <TableRow key={idx} className="border-evo-bg hover:bg-evo-teal/5 text-xs">
                          <TableCell className="font-mono text-[9px] text-evo-dark/40 py-2">#{user.rowNum}</TableCell>
                          <TableCell className="font-bold py-2">{user.email}</TableCell>
                          <TableCell className="text-evo-dark/60 py-2">{user.sapEmail}</TableCell>
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
              className="rounded-none uppercase text-[10px] font-bold tracking-widest h-11"
            >
              Cancelar
            </Button>
            
            <Button 
              onClick={handleProcessImport} 
              disabled={isImporting || importedUsersPreview.length === 0}
              className="evo-button-primary h-11 px-8 rounded-none shadow-xl flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processando Carga...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Realizar Carga ({importedUsersPreview.length} Usuários)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

