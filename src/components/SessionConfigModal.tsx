import React, { useState, useEffect } from 'react';
import { X, Clock, Globe, User, CheckCircle2, RotateCcw, FolderKanban } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

export function resolveEffectiveRequireClientForWo(
  userEmail?: string,
  userProfile?: any
): {
  effective: boolean;
  source: 'user' | 'global';
  globalValue: boolean;
  userValue: boolean | null;
} {
  let activeProfile = userProfile;
  let emailKey = (userEmail || userProfile?.email || '').toLowerCase().trim();
  if (!emailKey && typeof window !== 'undefined') {
    try {
      const rawSession = sessionStorage.getItem('sap_portal_active_user');
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        emailKey = (parsed?.email || '').toLowerCase().trim();
        if (!activeProfile) activeProfile = parsed;
      }
    } catch {}
  }

  const savedGlobal = typeof window !== 'undefined'
    ? localStorage.getItem('sap_portal_global_require_client_for_wo')
    : null;
  const globalValue = savedGlobal === 'true';

  let userValue: boolean | null = null;
  const savedUserLocal =
    emailKey && typeof window !== 'undefined'
      ? localStorage.getItem(`sap_portal_user_require_client_wo_${emailKey}`)
      : null;

  if (savedUserLocal === 'true') {
    userValue = true;
  } else if (savedUserLocal === 'false') {
    userValue = false;
  } else if (
    activeProfile?.requireClientForWo === true ||
    activeProfile?.requireClientForWo === 'true'
  ) {
    userValue = true;
  } else if (
    activeProfile?.requireClientForWo === false ||
    activeProfile?.requireClientForWo === 'false'
  ) {
    userValue = false;
  }

  if (userValue !== null) {
    return {
      effective: userValue,
      source: 'user',
      globalValue,
      userValue
    };
  }

  return {
    effective: globalValue,
    source: 'global',
    globalValue,
    userValue: null
  };
}

interface SessionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userProfile?: any;
}

export const SessionConfigModal: React.FC<SessionConfigModalProps> = ({
  isOpen,
  onClose,
  userEmail = '',
  userProfile
}) => {
  const emailKey = (userEmail || userProfile?.email || '').toLowerCase().trim();

  const [globalMinutes, setGlobalMinutes] = useState<number>(15);
  const [userMinutes, setUserMinutes] = useState<string>('');
  const [globalRequireClientWo, setGlobalRequireClientWo] = useState<boolean>(false);
  const [userRequireClientWo, setUserRequireClientWo] = useState<'inherit' | 'true' | 'false'>('inherit');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const savedGlobal = Number(localStorage.getItem('sap_portal_global_timeout_minutes'));
    setGlobalMinutes(!isNaN(savedGlobal) && savedGlobal >= 1 ? savedGlobal : 15);

    const savedUserLocal = emailKey ? localStorage.getItem(`sap_portal_user_timeout_${emailKey}`) : null;
    const profileUserMins = userProfile?.inactivityTimeoutMinutes;
    const effectiveUser = savedUserLocal
      ? Number(savedUserLocal)
      : profileUserMins
      ? Number(profileUserMins)
      : 0;

    setUserMinutes(effectiveUser > 0 ? String(effectiveUser) : '');

    const woResolved = resolveEffectiveRequireClientForWo(emailKey, userProfile);
    setGlobalRequireClientWo(woResolved.globalValue);
    setUserRequireClientWo(
      woResolved.userValue === true
        ? 'true'
        : woResolved.userValue === false
        ? 'false'
        : 'inherit'
    );
  }, [isOpen, emailKey, userProfile]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const validGlobal = Math.max(1, Math.min(480, Number(globalMinutes) || 15));
      localStorage.setItem('sap_portal_global_timeout_minutes', String(validGlobal));
      localStorage.setItem('sap_portal_global_require_client_for_wo', String(globalRequireClientWo));

      try {
        await setDoc(
          doc(db, 'settings', 'global_config'),
          {
            inactivityTimeoutMinutes: validGlobal,
            requireClientForWo: globalRequireClientWo,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      } catch {}

      const parsedUser = userMinutes.trim() ? Number(userMinutes) : 0;
      const validUser = !isNaN(parsedUser) && parsedUser > 0 ? Math.min(480, parsedUser) : null;
      const validUserWo: boolean | null =
        userRequireClientWo === 'true'
          ? true
          : userRequireClientWo === 'false'
          ? false
          : null;

      if (emailKey) {
        if (validUser) {
          localStorage.setItem(`sap_portal_user_timeout_${emailKey}`, String(validUser));
        } else {
          localStorage.removeItem(`sap_portal_user_timeout_${emailKey}`);
        }

        if (validUserWo !== null) {
          localStorage.setItem(`sap_portal_user_require_client_wo_${emailKey}`, String(validUserWo));
        } else {
          localStorage.removeItem(`sap_portal_user_require_client_wo_${emailKey}`);
        }

        try {
          const rawSession = sessionStorage.getItem('sap_portal_active_user');
          if (rawSession) {
            const parsed = JSON.parse(rawSession);
            if ((parsed?.email || '').toLowerCase().trim() === emailKey) {
              parsed.inactivityTimeoutMinutes = validUser;
              parsed.requireClientForWo = validUserWo;
              sessionStorage.setItem('sap_portal_active_user', JSON.stringify(parsed));
            }
          }
        } catch {}

        if (userProfile?.id) {
          try {
            await setDoc(
              doc(db, 'users', userProfile.id),
              {
                inactivityTimeoutMinutes: validUser,
                requireClientForWo: validUserWo,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );
          } catch {}
        }
      }

      window.dispatchEvent(
        new CustomEvent('sap_timeout_config_updated', {
          detail: {
            globalTimeoutMinutes: validGlobal,
            globalRequireClientForWo: globalRequireClientWo,
            email: emailKey,
            userTimeoutMinutes: validUser,
            userRequireClientForWo: validUserWo
          }
        })
      );

      toast.success('Configurações de sessão e busca por WO salvas com sucesso!');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const activeEffectiveMinutes =
    userMinutes.trim() && Number(userMinutes) > 0
      ? Number(userMinutes)
      : Number(globalMinutes) || 15;

  const activeEffectiveRequireClientWo =
    userRequireClientWo === 'true'
      ? true
      : userRequireClientWo === 'false'
      ? false
      : globalRequireClientWo;

  return (
    <div className="fixed inset-0 bg-[#121926]/75 backdrop-blur-sm z-[140] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-[#121926] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0ea5e9]/20 border border-[#0ea5e9]/40 flex items-center justify-center text-[#38bdf8]">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">
                Configurações Globais e por Usuário
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">
                Tempo de sessão e obrigatoriedade de Cliente na busca por WO
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Summary Banner */}
          <div className="p-4 rounded-2xl bg-[#f0f9ff] border border-[#bae6fd] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0284c7] block">
                Tempo Efetivo Aplicado Agora
              </span>
              <span className="text-lg font-black text-[#0f172a]">
                {activeEffectiveMinutes} minutos
              </span>
              <span className="text-[11px] text-slate-600 block mt-0.5 font-medium">
                {userMinutes.trim() && Number(userMinutes) > 0
                  ? 'Prioridade: Configuração Individual do Usuário (Ignora Global)'
                  : 'Prioridade: Configuração Global Padrão'}
              </span>
            </div>
            <CheckCircle2 size={28} className="text-[#0ea5e9]" />
          </div>

          {/* Global Setting */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Globe size={14} className="text-[#0ea5e9]" />
                Tempo Global do Sistema (Minutos)
              </label>
              <span className="text-[10px] font-bold text-slate-400">Padrão: 15 min</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Aplicado a todos os usuários que não possuem um tempo específico configurado em seu perfil.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={1}
                max={480}
                value={globalMinutes}
                onChange={e => setGlobalMinutes(Number(e.target.value) || 15)}
                className="w-28 px-3 py-2 rounded-xl border border-slate-300 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
              />
              <div className="flex gap-1.5">
                {[15, 30, 60].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGlobalMinutes(preset)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                      Number(globalMinutes) === preset
                        ? 'bg-[#0ea5e9] text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Per-User Setting */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <User size={14} className="text-emerald-600" />
                Tempo Individual do Usuário ({emailKey || 'Atual'})
              </label>
              {userMinutes.trim() && Number(userMinutes) > 0 && (
                <button
                  type="button"
                  onClick={() => setUserMinutes('')}
                  className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                >
                  <RotateCcw size={11} /> Usar Global
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Uma vez definido no usuário, este tempo <strong>ignora a configuração global</strong>. Deixe em branco para seguir o tempo global.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min={0}
                max={480}
                placeholder={`Usando Global (${globalMinutes} min)`}
                value={userMinutes}
                onChange={e => setUserMinutes(e.target.value)}
                className="w-44 px-3 py-2 rounded-xl border border-slate-300 text-sm font-black text-slate-900 placeholder:text-slate-400 placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex gap-1.5">
                {[15, 30, 45, 60].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setUserMinutes(String(preset))}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                      Number(userMinutes) === preset
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Require Client for WO Search (Global vs User) */}
          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block">
                  Obrigatoriedade de Cliente ao Pesquisar por WO
                </span>
                <span className="text-sm font-black text-slate-900">
                  {activeEffectiveRequireClientWo
                    ? 'Cliente Obrigatório ao informar WO'
                    : 'Não Obrigatório (Busca Livre por WO)'}
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5 font-medium">
                  {userRequireClientWo !== 'inherit'
                    ? 'Prioridade: Configuração Individual do Usuário (Ignora Global)'
                    : 'Prioridade: Configuração Global Padrão'}
                </span>
              </div>
              <FolderKanban size={24} className="text-emerald-600 shrink-0" />
            </div>

            {/* Global WO Client Rule */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Globe size={14} className="text-[#0ea5e9]" />
                Regra Global — Exigir Cliente ao Pesquisar WO
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Define para todo o sistema se o preenchimento do Cliente/Razão Social é obrigatório ao filtrar por WO.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setGlobalRequireClientWo(false)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${
                    !globalRequireClientWo
                      ? 'bg-[#0ea5e9] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Não Obrigatório (Livre por WO)
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalRequireClientWo(true)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase transition-all ${
                    globalRequireClientWo
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Exigir Cliente (Obrigatório)
                </button>
              </div>
            </div>

            {/* Per-User WO Client Rule */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <User size={14} className="text-emerald-600" />
                  Regra Individual do Usuário ({emailKey || 'Atual'})
                </label>
                {userRequireClientWo !== 'inherit' && (
                  <button
                    type="button"
                    onClick={() => setUserRequireClientWo('inherit')}
                    className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Usar Global
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Uma vez definido no usuário, <strong>ignora a configuração global</strong>.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setUserRequireClientWo('inherit')}
                  className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                    userRequireClientWo === 'inherit'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Seguir Global
                </button>
                <button
                  type="button"
                  onClick={() => setUserRequireClientWo('false')}
                  className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                    userRequireClientWo === 'false'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Não Obrigatório (Livre)
                </button>
                <button
                  type="button"
                  onClick={() => setUserRequireClientWo('true')}
                  className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                    userRequireClientWo === 'true'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Exigir Cliente
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-xs font-black uppercase tracking-wider shadow-md transition-all"
          >
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </div>
      </div>
    </div>
  );
};

