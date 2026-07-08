import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Props {
    onClose: () => void;
}

export default function EmergencyContactsManager({ onClose }: Props) {
    const { citizenProfile, addEmergencyContact, removeEmergencyContact } = useAppStore();
    const { t } = useTranslation();

    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newRel, setNewRel] = useState('');
    const [newPriority, setNewPriority] = useState<1 | 2>(1);

    const contacts = citizenProfile?.emergencyContacts || [];

    const handleSave = () => {
        if (!newName || !newPhone) return;
        addEmergencyContact({
            name: newName,
            phone: newPhone,
            relationship: newRel || 'Family',
            priority: newPriority,
        });
        setNewName('');
        setNewPhone('');
        setNewRel('');
        setNewPriority(1);
        setIsAdding(false);
    };

    return (
        <div className="flex flex-col w-full bg-transparent">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                        <span className="material-symbols-outlined text-lg">emergency</span>
                    </div>
                    <div>
                        <h2 className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight uppercase tracking-wider">{t('emergencyContacts', 'Emergency Contacts')}</h2>
                        <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 font-medium">{t('sosAlertsWillBeSentHere', 'SOS Alerts will be sent here')}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    aria-label={t('close', 'Close')}
                >
                    <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">close</span>
                </button>
                {contacts.length < 5 && !isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-1 bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md shadow-red-500/20 active:scale-95 transition-all shrink-0 ml-2"
                    >
                        <span className="material-symbols-outlined text-[14px]">add</span> {t('add', 'Add')}
                    </button>
                )}
            </div>

            <div className="p-4 flex flex-col gap-3">
                {/* Added Contacts */}
                <div className="space-y-3">
                    {contacts.map((contact) => (
                        <div key={contact.id} className="bg-[#f3eee5] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-[14px] p-4 flex items-center justify-between shadow-sm relative overflow-hidden">
                            {/* Decorative background element for contacts */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-bold text-[#1e293b] dark:text-white text-[14px]">{contact.name}</p>
                                    {contact.priority === 1 && (
                                        <span className="text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded-[4px] font-black uppercase tracking-widest leading-none">{t('primary', 'PRIMARY')}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-[#4b5563] dark:text-gray-300 font-mono font-medium">{contact.phone}</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">• {contact.relationship}</span>
                                </div>
                            </div>
                            <button onClick={() => removeEmergencyContact(contact.id)} className="relative z-10 p-2 bg-white dark:bg-black/20 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 shadow-sm transition-colors border border-black/5 dark:border-white/10 shrink-0">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    ))}
                    {contacts.length === 0 && !isAdding && (
                        <div className="text-center py-8 bg-[#e9ecef] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-[14px] shadow-sm">
                            <span className="material-symbols-outlined text-[#9ca3af] text-3xl mb-1">group_add</span>
                            <p className="text-[12px] text-[#6b7280] font-bold">{t('noContactsListed', 'No contacts listed.')}</p>
                            <p className="text-[10px] text-[#9ca3af] mt-1 font-medium px-4 leading-relaxed">{t('addTrustedFamilyForSos', 'Add trusted family or friends to notify them during an SOS.')}</p>
                        </div>
                    )}
                </div>

                {/* Add Form */}
                {isAdding && (
                    <div className="bg-[#f3eee5] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-4 shadow-sm relative overflow-hidden mt-1">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
                        <h3 className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 mt-1">{t('addNewContact', 'Add New Contact')}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] text-[#4b5563] font-bold dark:text-slate-300 mb-1.5">{t('nameLabel', 'NAME')}</label>
                                <input
                                    type="text"
                                    placeholder={t('contactNameExample', 'e.g. Rahul Sharma')}
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-[#e3e6e8] dark:bg-black/20 border-transparent rounded-[10px] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-[#4b5563] font-bold dark:text-slate-300 mb-1.5">{t('mobileNumberLabel', 'MOBILE NUMBER')}</label>
                                <input
                                    type="tel"
                                    placeholder={t('phonePrefixExample', '+91')}
                                    value={newPhone}
                                    onChange={e => setNewPhone(e.target.value)}
                                    className="w-full bg-[#e3e6e8] dark:bg-black/20 border-transparent rounded-[10px] px-3 py-2.5 text-[13px] font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[11px] text-[#4b5563] font-bold dark:text-slate-300 mb-1.5">{t('relationLabel', 'RELATION')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('relationExample', 'Brother...')}
                                        value={newRel}
                                        onChange={e => setNewRel(e.target.value)}
                                        className="w-full bg-[#e3e6e8] dark:bg-black/20 border-transparent rounded-[10px] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
                                    />
                                </div>
                                <div className="w-[100px]">
                                    <label className="block text-[11px] text-[#4b5563] font-bold dark:text-slate-300 mb-1.5">{t('priorityLabel', 'PRIORITY')}</label>
                                    <select
                                        value={newPriority}
                                        onChange={e => setNewPriority(Number(e.target.value) as 1 | 2)}
                                        className="w-full bg-[#e3e6e8] dark:bg-black/20 border-transparent rounded-[10px] px-3 py-2.5 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors appearance-none"
                                    >
                                        <option value={1}>{t('priority1', 'Pri 1')}</option>
                                        <option value={2}>{t('priority2', 'Pri 2')}</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 pt-3">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="flex-1 py-3 rounded-xl text-[12px] font-bold text-slate-600 dark:text-gray-400 bg-[#e3e6e8] dark:bg-white/5 active:scale-[0.98] transition-all"
                                >
                                    {t('cancel', 'Cancel')}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!newName || !newPhone}
                                    className="flex-1 py-3 rounded-xl text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50 transition-all shadow-md shadow-red-500/20"
                                >
                                    {t('save', 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
