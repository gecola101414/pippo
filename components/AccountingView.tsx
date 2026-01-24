
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectDocument, ContractConfig, SalEntry } from '../types';
import { format, parseISO, startOfDay, isAfter, endOfDay, isValid } from 'date-fns';
import { it } from 'date-fns/locale/it';

declare const jspdf: any;

interface AccountingViewProps {
  documents: ProjectDocument[];
  projectName?: string;
  contractConfig?: ContractConfig;
  onUpdateContractConfig: (config: ContractConfig) => void;
  sals?: SalEntry[];
  onUpdateSals: (sals: SalEntry[]) => void;
  onToggleGroupSecurity?: (groupId: string) => void; 
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 2 });

// Helper per arrotondamento rigoroso a 2 decimali (Ledger Math)
const round2 = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

interface AccountingEntry {
    id: string; 
    progressiveIndex: number; 
    date: string;
    articleCode: string;
    description: string; 
    measurementNote: string; 
    unit: string;
    quantity: number;
    unitPrice: number;
    debit: number; 
    progressive: number; 
    groupName: string; 
    docName: string;
    cumulativePercentage?: number; 
    factor?: number;
    length?: number;
    width?: number;
    height?: number;
    isSecurityCost: boolean; 
    laborAmount: number; 
    accountingType: 'measure' | 'body';
}

interface SummaryEntry {
    articleCode: string;
    wbsName: string; 
    description: string;
    unit: string;
    unitPrice: number;
    estimatedQuantity: number; 
    totalQuantity: number; 
    totalAmount: number;
    progressPercent: number; 
    accountingType: 'measure' | 'body';
}

const useOnClickOutside = (ref: React.RefObject<HTMLElement>, handler: (event: MouseEvent | TouchEvent) => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

// ... Filter Components ...
const FilterIcon: React.FC<{ isActive: boolean, onClick: (e: React.MouseEvent) => void }> = ({ isActive, onClick }) => (
    <button onClick={onClick} className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-gray-400'}`} title="Filtra">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>
    </button>
);

const TextFilterPopover: React.FC<{ value: string, onChange: (val: string) => void, onClose: () => void, placeholder?: string }> = ({ value, onChange, onClose, placeholder }) => {
    const ref = useRef<HTMLDivElement>(null);
    useOnClickOutside(ref, onClose);
    return (
        <div ref={ref} className="absolute top-full mt-1 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-fade-in">
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Cerca..."} className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white" autoFocus />
            <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-gray-700"><button onClick={() => { onChange(''); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2">Pulisci</button><button onClick={onClose} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Chiudi</button></div>
        </div>
    );
};

const DateFilterPopover: React.FC<{ dateFrom: string, dateTo: string, onChange: (from: string, to: string) => void, onClose: () => void }> = ({ dateFrom, dateTo, onChange, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useOnClickOutside(ref, onClose);
    return (
        <div ref={ref} className="absolute top-full mt-1 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-fade-in">
            <div className="space-y-2"><div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dal:</label><input type="date" value={dateFrom} onChange={e => onChange(e.target.value, dateTo)} className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" /></div><div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Al:</label><input type="date" value={dateTo} onChange={e => onChange(dateFrom, e.target.value)} className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" /></div></div>
            <div className="flex justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-700"><button onClick={() => { onChange('', ''); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2">Pulisci</button><button onClick={onClose} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Applica</button></div>
        </div>
    );
};

const AccountingView: React.FC<AccountingViewProps> = ({ 
    documents, 
    projectName, 
    contractConfig, 
    onUpdateContractConfig, 
    sals = [], 
    onUpdateSals, 
    onToggleGroupSecurity 
}) => {
  const [activeTab, setActiveTab] = useState<'libretto' | 'register' | 'summary' | 'sal_technical' | 'payment_cert' | 'settings'>('libretto');
  
  const contentRef = useRef<HTMLDivElement>(null);
  const certificateRef = useRef<HTMLDivElement>(null);

  const [localConfig, setLocalConfig] = useState<ContractConfig>(contractConfig || { 
      discountPercent: 0, 
      withholdingTaxPercent: 0.5, 
      vatPercent: 22, 
      contractorName: '', 
      contractCode: '',
      contractDate: '',
      advancePaymentPercent: 20, 
      excludeLaborFromDiscount: false 
  });

  useEffect(() => {
      onUpdateContractConfig(localConfig);
  }, [localConfig, onUpdateContractConfig]);

  const [activeSalId, setActiveSalId] = useState<string | null>(null); 
  
  useEffect(() => {
      if (!activeSalId && sals.length > 0) {
          const sorted = [...sals].sort((a,b) => b.number - a.number);
          setActiveSalId(sorted[0].id);
      }
  }, [sals, activeSalId]);

  const salReferenceDate = useMemo(() => {
      if (activeSalId) {
          const sal = sals.find(s => s.id === activeSalId);
          return sal ? sal.date : format(new Date(), 'yyyy-MM-dd');
      }
      return format(new Date(), 'yyyy-MM-dd');
  }, [activeSalId, sals]);

  const [filters, setFilters] = useState({ code: '', wbs: '', description: '', dateFrom: '', dateTo: '' });
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // 0. Calculate BoQ Totals
  const boqTotals = useMemo(() => {
      const map = new Map<string, number>();
      documents.forEach(doc => {
          doc.workGroups.forEach(wg => {
              wg.items.forEach(item => {
                  const current = map.get(item.articleCode) || 0;
                  map.set(item.articleCode, current + item.quantity);
              });
          });
      });
      return map;
  }, [documents]);

  // 1. GLOBAL INDEXING & REGISTRY
  const { accountingRegistry, globalMeasurementMap } = useMemo(() => {
      let entries: AccountingEntry[] = [];
      let tempIndexCounter = 1;

      documents.forEach(doc => {
          if (doc.isFrozen) return; 
          doc.workGroups.forEach(group => {
              const isBody = group.accountingType === 'body';
              const isSecurity = group.isSecurityCost || false;

              if (isBody) {
                  const groupMeasurements = group.items.flatMap(item => (item.measurements || []).map(m => ({
                      ...m,
                      monetaryValue: m.quantity * item.unitPrice,
                      laborValue: (m.quantity * item.unitPrice) * ((item.laborRate || 0) / 100)
                  })));

                  const byDate: Record<string, { totalValue: number, totalLabor: number, ids: string[] }> = {};
                  groupMeasurements.forEach(m => {
                      if (!byDate[m.date]) byDate[m.date] = { totalValue: 0, totalLabor: 0, ids: [] };
                      byDate[m.date].totalValue += m.monetaryValue;
                      byDate[m.date].totalLabor += m.laborValue;
                      byDate[m.date].ids.push(m.id);
                  });

                  Object.entries(byDate).forEach(([date, data]) => {
                      const dailyPercentage = group.value > 0 ? data.totalValue / group.value : 0;
                      entries.push({
                          id: `${group.id}-${date}`, 
                          progressiveIndex: tempIndexCounter++, 
                          date: date,
                          articleCode: `A.CORPO.${group.id.substring(0,5)}`.toUpperCase(), 
                          description: group.name, 
                          measurementNote: 'Avanzamento a corpo calcolato su percentuale',
                          unit: '%',
                          quantity: dailyPercentage, 
                          unitPrice: group.value, 
                          debit: data.totalValue, 
                          progressive: 0,
                          groupName: group.name,
                          docName: doc.fileName,
                          isSecurityCost: isSecurity,
                          laborAmount: data.totalLabor,
                          accountingType: 'body'
                      });
                  });

              } else {
                  group.items.forEach(item => {
                      if (item.measurements) {
                          item.measurements.forEach(m => {
                              const debit = m.quantity * item.unitPrice;
                              const laborAmt = debit * ((item.laborRate || 0) / 100);
                              entries.push({
                                  id: m.id,
                                  progressiveIndex: tempIndexCounter++, 
                                  date: m.date,
                                  articleCode: item.articleCode,
                                  description: item.description,
                                  measurementNote: m.note,
                                  unit: item.unit,
                                  quantity: m.quantity,
                                  unitPrice: item.unitPrice,
                                  debit: debit,
                                  progressive: 0, 
                                  groupName: group.name,
                                  docName: doc.fileName,
                                  factor: m.factor, length: m.length, width: m.width, height: m.height,
                                  isSecurityCost: isSecurity,
                                  laborAmount: laborAmt,
                                  accountingType: 'measure'
                              });
                          });
                      }
                  });
              }
          });
      });

      entries.sort((a, b) => { 
          const dateA = new Date(a.date).getTime(); 
          const dateB = new Date(b.date).getTime(); 
          if (dateA !== dateB) return dateA - dateB; 
          return 0;
      });

      const map = new Map<string, number>();
      let runningTotal = 0;
      const computedEntries = entries.map((entry, idx) => { 
          const actualIndex = idx + 1;
          map.set(entry.id, actualIndex);
          runningTotal += entry.debit; 
          return { ...entry, progressiveIndex: actualIndex, progressive: runningTotal }; 
      });

      return { accountingRegistry: computedEntries, globalMeasurementMap: map };
  }, [documents]);

  const calculateTotalsAtDate = (targetDate: string) => {
      const relevantEntries = accountingRegistry.filter(entry => 
          entry.date.localeCompare(targetDate) <= 0
      );

      const securityEntries = relevantEntries.filter(e => e.isSecurityCost);
      const security = round2(securityEntries.reduce((acc, curr) => acc + curr.debit, 0));

      const measureEntries = relevantEntries.filter(e => e.accountingType === 'measure' && !e.isSecurityCost);
      const measureTotal = round2(measureEntries.reduce((acc, curr) => acc + curr.debit, 0));

      const bodyEntries = relevantEntries.filter(e => e.accountingType === 'body' && !e.isSecurityCost);
      const bodyTotal = round2(bodyEntries.reduce((acc, curr) => acc + curr.debit, 0));

      const totalGross = round2(measureTotal + bodyTotal + security);

      const measureLabor = round2(measureEntries.reduce((acc, curr) => acc + curr.laborAmount, 0));
      const bodyLabor = round2(bodyEntries.reduce((acc, curr) => acc + curr.laborAmount, 0));
      const totalLabor = round2(measureLabor + bodyLabor);

      const worksTotal = round2(measureTotal + bodyTotal);
      const laborToExclude = localConfig.excludeLaborFromDiscount ? totalLabor : 0;
      const worksBase = round2(worksTotal - laborToExclude);
      
      const discount = round2(worksBase * (localConfig.discountPercent / 100));
      const netWorksAfterDiscount = round2(worksBase - discount);

      const totalNet = round2(netWorksAfterDiscount + laborToExclude + security);

      const bodyGroupsTotalValue = documents.flatMap(d => d.workGroups)
          .filter(g => g.accountingType === 'body' && !g.isSecurityCost)
          .reduce((acc, g) => acc + g.value, 0);
          
      const bodyPercentage = bodyGroupsTotalValue > 0 ? (bodyTotal / bodyGroupsTotalValue) * 100 : 0;

      const measureNet = round2(measureTotal - (localConfig.excludeLaborFromDiscount ? measureLabor : 0));
      const bodyNet = round2(bodyTotal - (localConfig.excludeLaborFromDiscount ? bodyLabor : 0));

      return { 
          totalGross, 
          measureTotal, measureLabor, measureNet,
          bodyTotal, bodyLabor, bodyNet, bodyPercentage,
          security, 
          totalLabor, 
          worksBase, 
          discount, 
          netWorksAfterDiscount,
          totalNet,
          entries: relevantEntries
      };
  };

  const currentSalData = useMemo(() => calculateTotalsAtDate(salReferenceDate), [salReferenceDate, accountingRegistry, localConfig, documents]);
  const filteredRegistry = currentSalData.entries;

  const salCumulativeValuesMap = useMemo(() => {
      const map = new Map<string, number>();
      sals.forEach(sal => {
          const totals = calculateTotalsAtDate(sal.date);
          map.set(sal.id, totals.totalNet);
      });
      return map;
  }, [sals, accountingRegistry, localConfig, documents]);

  const previousSalObject = useMemo(() => {
      if (!activeSalId || sals.length === 0) return null;
      const sortedSals = [...sals].sort((a, b) => a.number - b.number);
      const activeIndex = sortedSals.findIndex(s => s.id === activeSalId);
      
      if (activeIndex > 0) {
          return sortedSals[activeIndex - 1];
      }
      return null;
  }, [activeSalId, sals]);

  const paymentCertData = useMemo(() => {
      const currentNet = currentSalData.totalNet;
      let previousNet = 0;
      if (previousSalObject) {
          previousNet = salCumulativeValuesMap.get(previousSalObject.id) || 0;
      }
      const rataAcconto = round2(currentNet - previousNet); 
      const retentionAmount = round2(rataAcconto * (localConfig.withholdingTaxPercent / 100));
      const advancePercent = localConfig.advancePaymentPercent || 0;
      const recoveryAmount = round2(rataAcconto * (advancePercent / 100));
      const taxableCertified = round2(rataAcconto - retentionAmount - recoveryAmount);
      const vatAmount = round2(taxableCertified * (localConfig.vatPercent / 100));
      const totalPayable = round2(taxableCertified + vatAmount);
      
      return { currentNet, previousNet, rataAcconto, retentionAmount, recoveryAmount, taxableCertified, vatAmount, totalPayable };
  }, [currentSalData, previousSalObject, salCumulativeValuesMap, localConfig]);

  const filteredLibretto = useMemo(() => {
      const runningQuantities = new Map<string, number>();
      return filteredRegistry.map(entry => {
          let currentTotal = 0;
          let estimatedTotal = 0;

          if (entry.accountingType === 'body') {
              currentTotal = (runningQuantities.get(entry.articleCode) || 0) + entry.quantity; 
              estimatedTotal = 1; 
          } else {
              currentTotal = (runningQuantities.get(entry.articleCode) || 0) + entry.quantity;
              estimatedTotal = boqTotals.get(entry.articleCode) || 0;
          }
          
          runningQuantities.set(entry.articleCode, currentTotal);
          return { ...entry, cumulativePercentage: estimatedTotal > 0 ? (currentTotal / estimatedTotal) * 100 : 0 };
      });
  }, [filteredRegistry, boqTotals]);

  const accountingSummary = useMemo(() => {
      const summaryMap = new Map<string, SummaryEntry>();
      filteredRegistry.forEach(entry => {
          if (!summaryMap.has(entry.articleCode)) {
              summaryMap.set(entry.articleCode, { 
                  articleCode: entry.articleCode, 
                  wbsName: entry.groupName, 
                  description: entry.accountingType === 'body' ? entry.groupName : entry.description, 
                  unit: entry.unit, 
                  unitPrice: entry.unitPrice, 
                  estimatedQuantity: 0, 
                  totalQuantity: 0, 
                  totalAmount: 0, 
                  progressPercent: 0, 
                  accountingType: entry.accountingType 
              });
          }
          const current = summaryMap.get(entry.articleCode)!;
          current.totalQuantity += entry.quantity;
          current.totalAmount += entry.debit;
      });
      return Array.from(summaryMap.values()).map(item => {
          if (item.accountingType === 'body') {
              return { 
                  ...item, 
                  estimatedQuantity: 1, 
                  progressPercent: item.totalQuantity * 100 
              };
          } else {
              const estimated = boqTotals.get(item.articleCode) || 0;
              return { 
                  ...item, 
                  estimatedQuantity: estimated, 
                  progressPercent: estimated > 0 ? (item.totalQuantity / estimated) * 100 : 0 
              };
          }
      }).sort((a, b) => a.articleCode.localeCompare(b.articleCode));
  }, [filteredRegistry, boqTotals]);

  const applyFilters = (entry: any) => {
      const codeMatch = entry.articleCode.toLowerCase().includes(filters.code.toLowerCase());
      const wbsMatch = (entry.groupName || entry.wbsName).toLowerCase().includes(filters.wbs.toLowerCase());
      const descMatch = (entry.description + (entry.measurementNote || '')).toLowerCase().includes(filters.description.toLowerCase());
      let dateMatch = true;
      if (entry.date) {
          const d = parseISO(entry.date);
          if (filters.dateFrom && d < startOfDay(parseISO(filters.dateFrom))) dateMatch = false;
          if (filters.dateTo && d > endOfDay(parseISO(filters.dateTo))) dateMatch = false;
      }
      return codeMatch && wbsMatch && descMatch && dateMatch;
  };

  // --- PDF GENERATION LOGIC ---
  const handleDownloadPDF = async () => {
      setIsGeneratingPdf(true);
      try {
          const { jsPDF } = jspdf;
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'mm',
              format: 'a4'
          });

          // 1. FRONTESPIZIO (Copertina dedicata)
          const printFrontespizio = (doc: any, title: string) => {
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              const margin = 20;

              // Cornice decorativa
              doc.setLineWidth(1);
              doc.setDrawColor(40, 40, 40);
              doc.rect(margin, margin, pageWidth - (margin * 2), pageHeight - (margin * 2));
              
              // Cornice interna sottile
              doc.setLineWidth(0.2);
              doc.rect(margin + 2, margin + 2, pageWidth - (margin * 2) - 4, pageHeight - (margin * 2) - 4);

              let yPos = 50;

              // LOGO & TITOLO SOFTWARE
              doc.setFontSize(28);
              doc.setFont('times', 'bold');
              doc.setTextColor(40, 40, 40);
              doc.text("CHRONOS AI", pageWidth / 2, yPos, { align: 'center' });
              yPos += 10;
              doc.setFontSize(10);
              doc.setFont('times', 'italic');
              doc.setTextColor(100);
              doc.text("Sistema di Direzione Lavori & Contabilità", pageWidth / 2, yPos, { align: 'center' });

              yPos += 40;

              // TITOLO DOCUMENTO
              doc.setFontSize(24);
              doc.setFont('times', 'bold');
              doc.setTextColor(79, 70, 229); // Indigo
              doc.text(title.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
              
              if (activeSalId) {
                  yPos += 10;
                  const sal = sals.find(s => s.id === activeSalId);
                  doc.setFontSize(14);
                  doc.setTextColor(60);
                  doc.text(sal ? `Riferimento: SAL N. ${sal.number}` : '', pageWidth / 2, yPos, { align: 'center' });
              }

              yPos += 40;

              // BOX DATI CONTRATTO
              const boxX = margin + 15;
              const boxWidth = pageWidth - (margin * 2) - 30;
              const boxY = yPos;
              const lineHeight = 12;
              
              doc.setDrawColor(200);
              doc.setLineWidth(0.5);
              doc.line(boxX, boxY, boxX + boxWidth, boxY); // Top line

              yPos += 15;
              
              const printRow = (label: string, value: string) => {
                  doc.setFontSize(11);
                  doc.setFont('times', 'bold');
                  doc.setTextColor(80);
                  doc.text(label, boxX, yPos);
                  
                  doc.setFont('times', 'normal');
                  doc.setTextColor(0);
                  // Handle long text wrapping for value
                  const splitValue = doc.splitTextToSize(value, boxWidth / 2);
                  doc.text(splitValue, boxX + (boxWidth / 2), yPos);
                  
                  yPos += (splitValue.length * 6) + 6;
                  doc.setDrawColor(230);
                  doc.line(boxX, yPos - 4, boxX + boxWidth, yPos - 4); // Separator
              };

              printRow("Committente / Progetto:", projectName || "---");
              printRow("Impresa Appaltatrice:", localConfig.contractorName || "---");
              printRow("Codice CIG / CUP:", localConfig.contractCode || "---");
              printRow("Data Contratto:", localConfig.contractDate ? format(parseISO(localConfig.contractDate), 'dd/MM/yyyy') : "---");
              printRow("Data Emissione Documento:", format(new Date(), 'dd/MM/yyyy'));

              // FIRME
              yPos = pageHeight - 60;
              doc.setFontSize(10);
              doc.setFont('times', 'normal');
              
              doc.text("L'Impresa Appaltatrice", margin + 30, yPos, { align: 'center' });
              doc.line(margin + 10, yPos + 15, margin + 50, yPos + 15);
              
              doc.text("Il Direttore dei Lavori", pageWidth - margin - 30, yPos, { align: 'center' });
              doc.line(pageWidth - margin - 50, yPos + 15, pageWidth - margin - 10, yPos + 15);
          };

          // 2. TESTALINO PER PAGINE SUCCESSIVE
          const printHeader = (doc: any, title: string) => {
              const pageWidth = doc.internal.pageSize.getWidth();
              const margin = 15;
              const headerHeight = 25;
              const topPos = 10;

              doc.setDrawColor(50);
              doc.setLineWidth(0.3);
              
              // Box
              doc.rect(margin, topPos, pageWidth - (margin * 2), headerHeight);
              
              // Dividers
              doc.line(margin + 40, topPos, margin + 40, topPos + headerHeight);
              doc.line(pageWidth - margin - 50, topPos, pageWidth - margin - 50, topPos + headerHeight);

              // Left: Small Logo
              doc.setFontSize(12);
              doc.setFont('times', 'bold');
              doc.text("CHRONOS AI", margin + 20, topPos + 10, { align: 'center' });
              doc.setFontSize(7);
              doc.setFont('times', 'italic');
              doc.text("Contabilità Lavori", margin + 20, topPos + 16, { align: 'center' });

              // Center: Info
              doc.setFontSize(8);
              doc.setFont('times', 'bold');
              doc.text("PROGETTO:", margin + 45, topPos + 8);
              doc.setFont('times', 'normal');
              doc.text(projectName || "---", margin + 45, topPos + 13);
              
              doc.setFont('times', 'bold');
              doc.text("IMPRESA:", margin + 45, topPos + 20);
              doc.setFont('times', 'normal');
              doc.text(localConfig.contractorName || "---", margin + 60, topPos + 20);

              // Right: Doc Info
              doc.setFontSize(9);
              doc.setFont('times', 'bold');
              doc.text(title, pageWidth - margin - 45, topPos + 8);
              
              doc.setFontSize(8);
              doc.setFont('times', 'normal');
              doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - margin - 45, topPos + 15);
              doc.text(`Pag. ${doc.internal.getNumberOfPages()}`, pageWidth - margin - 45, topPos + 20);
          };

          const setupAutoTable = (head: string[][], body: any[]) => {
              return {
                  startY: 40, // Start after header on subsequent pages
                  head: head,
                  body: body,
                  theme: 'grid',
                  styles: { font: 'times', fontSize: 9, cellPadding: 1.5, lineColor: [200, 200, 200] },
                  headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
                  margin: { top: 40, bottom: 20, left: 15, right: 15 },
                  didDrawPage: (data: any) => {
                      // Skip header on first page (Frontespizio is there)
                      // Actually, we add a page after frontespizio, so table starts on page 2.
                      // data.pageNumber starts at 1 for the first page of the document.
                      if (data.pageNumber > 1) {
                          printHeader(pdf, getDocumentTitle());
                      }
                  }
              };
          };

          const getDocumentTitle = () => {
              switch(activeTab) {
                  case 'libretto': return "Libretto delle Misure";
                  case 'register': return "Registro di Contabilità";
                  case 'summary': return "Sommario del Registro";
                  case 'sal_technical': return "Stato Avanzamento Lavori";
                  case 'payment_cert': return "Certificato di Pagamento";
                  default: return "Documento";
              }
          };
          
          const doc = pdf;
          const docTitle = getDocumentTitle();

          // --- STEP 1: CREATE COVER PAGE ---
          printFrontespizio(doc, docTitle);
          
          // --- STEP 2: ADD NEW PAGE FOR CONTENT ---
          doc.addPage();

          // --- STEP 3: RENDER CONTENT ---
          if (activeTab === 'libretto') {
              const tableBody = filteredLibretto.filter(applyFilters).map(entry => [
                  entry.progressiveIndex,
                  format(parseISO(entry.date), 'dd/MM/yy'),
                  entry.groupName,
                  entry.articleCode,
                  entry.description + (entry.measurementNote ? `\nNota: ${entry.measurementNote}` : ''),
                  entry.unit,
                  entry.factor || '', entry.length || '', entry.width || '', entry.height || '',
                  numberFormatter.format(entry.quantity)
              ]);

              pdf.autoTable({
                  ...setupAutoTable([['N.', 'Data', 'WBS', 'Codice', 'Descrizione', 'UM', 'Fat', 'Lun', 'Lar', 'Alt', 'Q.tà']], tableBody),
                  columnStyles: {
                      0: { cellWidth: 10, halign: 'center' },
                      1: { cellWidth: 15, halign: 'center' },
                      2: { cellWidth: 20 },
                      3: { cellWidth: 20, fontStyle: 'bold' },
                      4: { cellWidth: 'auto' },
                      5: { cellWidth: 10, halign: 'center' },
                      6: { cellWidth: 8, halign: 'center' },
                      7: { cellWidth: 8, halign: 'center' },
                      8: { cellWidth: 8, halign: 'center' },
                      9: { cellWidth: 8, halign: 'center' },
                      10: { cellWidth: 15, halign: 'right', fontStyle: 'bold' }
                  }
              });
          } 
          else if (activeTab === 'register') {
              const tableBody = filteredRegistry.filter(applyFilters).map(entry => [
                  entry.progressiveIndex,
                  format(parseISO(entry.date), 'dd/MM/yy'),
                  entry.articleCode,
                  entry.description,
                  entry.unit,
                  numberFormatter.format(entry.quantity),
                  currencyFormatter.format(entry.unitPrice),
                  currencyFormatter.format(entry.debit),
                  currencyFormatter.format(entry.progressive)
              ]);

              pdf.autoTable({
                  ...setupAutoTable([['N.', 'Data', 'Codice', 'Descrizione', 'UM', 'Q.tà', 'Prezzo', 'Importo', 'Progr.']], tableBody),
                  columnStyles: {
                      7: { halign: 'right', fontStyle: 'bold' },
                      8: { halign: 'right', fontStyle: 'bold', fillColor: [245, 245, 245] }
                  }
              });
          }
          else if (activeTab === 'summary') {
              const tableBody = accountingSummary.filter(applyFilters).map(item => [
                  item.articleCode,
                  item.description,
                  item.unit,
                  currencyFormatter.format(item.unitPrice),
                  numberFormatter.format(item.estimatedQuantity),
                  numberFormatter.format(item.totalQuantity),
                  currencyFormatter.format(item.totalAmount),
                  percentFormatter.format(item.progressPercent / 100)
              ]);

              pdf.autoTable({
                  ...setupAutoTable([['Codice', 'Descrizione', 'UM', 'Prezzo', 'Prev.', 'Totale', 'Importo', '%']], tableBody),
                  columnStyles: {
                      6: { halign: 'right', fontStyle: 'bold' },
                      7: { halign: 'right' }
                  }
              });
          }
          else if (activeTab === 'sal_technical') {
              const rows: any[] = [
                  [{content: 'A) LAVORI A MISURA', colSpan: 3, styles: {fillColor: [220, 220, 220], fontStyle: 'bold'}}],
                  ['Totale Lavori a Misura (Lordo)', currencyFormatter.format(currentSalData.measureTotal), ''],
              ];
              
              if (localConfig.excludeLaborFromDiscount) {
                  rows.push(['- di cui Manodopera (non soggetta a ribasso)', `-${currencyFormatter.format(currentSalData.measureLabor)}`, currencyFormatter.format(currentSalData.measureLabor)]);
              }
              rows.push(['= Importo Lavori a Misura (Netto da ribassare)', currencyFormatter.format(currentSalData.measureNet), '']);
              
              rows.push([{content: 'B) LAVORI A CORPO', colSpan: 3, styles: {fillColor: [220, 220, 220], fontStyle: 'bold'}}]);
              rows.push(['Totale Lavori a Corpo (Lordo)', currencyFormatter.format(currentSalData.bodyTotal), '']);
              if (localConfig.excludeLaborFromDiscount) {
                  rows.push(['- di cui Manodopera (non soggetta a ribasso)', `-${currencyFormatter.format(currentSalData.bodyLabor)}`, currencyFormatter.format(currentSalData.bodyLabor)]);
              }
              rows.push(['= Importo Lavori a Corpo (Netto da ribassare)', currencyFormatter.format(currentSalData.bodyNet), '']);

              rows.push([{content: 'C) ONERI SICUREZZA', colSpan: 3, styles: {fillColor: [220, 220, 220], fontStyle: 'bold'}}]);
              rows.push(['Totale Oneri Sicurezza (non soggetti a ribasso)', '', currencyFormatter.format(currentSalData.security)]);

              rows.push([{content: 'D) RIEPILOGO GENERALE', colSpan: 3, styles: {fillColor: [220, 220, 220], fontStyle: 'bold'}}]);
              rows.push(['Sommano Lavori soggetti a ribasso (A netto + B netto)', currencyFormatter.format(currentSalData.measureNet + currentSalData.bodyNet), '']);
              rows.push(['- Ribasso d\'Asta del ' + localConfig.discountPercent + '%', `-${currencyFormatter.format((currentSalData.measureNet + currentSalData.bodyNet) * (localConfig.discountPercent / 100))}`, '']);
              rows.push(['= Totale Lavori Netto (Ribassato)', currencyFormatter.format(currentSalData.netWorksAfterDiscount), currencyFormatter.format(currentSalData.netWorksAfterDiscount)]);

              rows.push([{content: 'E) TOTALE GENERALE NETTO', colSpan: 2, styles: {fillColor: [220, 220, 220], fontStyle: 'bold'}}, {content: currencyFormatter.format(paymentCertData.currentNet), styles: {fontStyle: 'bold', fillColor: [200, 255, 200]}}]);

              pdf.autoTable({
                  ...setupAutoTable([['Descrizione', 'Parziali / Calcoli', 'Totali / Netti']], rows),
                  columnStyles: {
                      0: { cellWidth: 'auto' },
                      1: { cellWidth: 40, halign: 'right' },
                      2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
                  }
              });
              
              // Signatures
              const finalY = (pdf as any).lastAutoTable.finalY + 30;
              pdf.text("L'Impresa", 40, finalY);
              pdf.line(30, finalY + 10, 80, finalY + 10);
              pdf.text("Il Direttore dei Lavori", 140, finalY);
              pdf.line(130, finalY + 10, 180, finalY + 10);
          }
          else if (activeTab === 'payment_cert') {
              const rows: any[] = [
                  ['1. Totale Netto Lavori (da SAL Cumulativo)', currencyFormatter.format(paymentCertData.currentNet)],
              ];

              if (previousSalObject) {
                  rows.push([`Dedurre SAL precedente n. ${previousSalObject.number} (Netto Cumulativo)`, `-${currencyFormatter.format(paymentCertData.previousNet)}`]);
              } else {
                  rows.push(['Nessun SAL precedente da dedurre', '-']);
              }

              rows.push(['2. Rata di Acconto Lorda', currencyFormatter.format(paymentCertData.rataAcconto)]);
              rows.push([`Ritenuta a garanzia (${localConfig.withholdingTaxPercent}%)`, `-${currencyFormatter.format(paymentCertData.retentionAmount)}`]);
              rows.push([`Recupero Anticipazione (${localConfig.advancePaymentPercent}%)`, `-${currencyFormatter.format(paymentCertData.recoveryAmount)}`]);
              rows.push(['3. Imponibile Certificato', currencyFormatter.format(paymentCertData.taxableCertified)]);
              rows.push([`I.V.A. (${localConfig.vatPercent}%)`, currencyFormatter.format(paymentCertData.vatAmount)]);
              rows.push([{content: 'TOTALE DA PAGARE', styles: {fontStyle: 'bold', fontSize: 12}}, {content: currencyFormatter.format(paymentCertData.totalPayable), styles: {fontStyle: 'bold', fontSize: 12}}]);

              pdf.autoTable({
                  ...setupAutoTable([['Descrizione', 'Importi']], rows),
                  columnStyles: {
                      1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }
                  }
              });

              // Certificate Text
              const textY = (pdf as any).lastAutoTable.finalY + 20;
              pdf.setFontSize(10);
              pdf.text("Si certifica che i lavori sono stati eseguiti a regola d'arte e in conformità al contratto.", 15, textY);
              pdf.text(`Luogo e Data: ${projectName}, ${format(new Date(), 'dd/MM/yyyy')}`, 15, textY + 10);

              pdf.text("Il Direttore dei Lavori", 140, textY + 40);
              pdf.line(130, textY + 50, 190, textY + 50);
          }

          pdf.save(`${activeTab}_${format(new Date(), 'yyyyMMdd')}.pdf`);

      } catch (error) {
          console.error("PDF Gen Error", error);
          alert("Errore generazione PDF: " + error);
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  const handleAddNewSal = () => {
      const nextNumber = sals.length > 0 ? Math.max(...sals.map(s => s.number)) + 1 : 1;
      const newSal: SalEntry = {
          id: crypto.randomUUID(),
          number: nextNumber,
          date: format(new Date(), 'yyyy-MM-dd'),
          description: `SAL N. ${nextNumber} a tutto il ${format(new Date(), 'dd/MM/yyyy')}`,
          totalAmount: 0,
          isLocked: false
      };
      const updatedSals = [...sals, newSal];
      onUpdateSals(updatedSals);
      setActiveSalId(newSal.id);
  };

  const handleDeleteSal = (id: string) => {
      const sorted = [...sals].sort((a,b) => a.number - b.number);
      const isLast = sorted[sorted.length - 1].id === id;
      if (!isLast) { alert("Puoi eliminare solo l'ultimo SAL."); return; }
      if (confirm("Eliminare definitivamente questo SAL?")) {
          const updated = sals.filter(s => s.id !== id);
          onUpdateSals(updated);
          setActiveSalId(updated.length > 0 ? updated[updated.length - 1].id : null);
      }
  };

  const handleUpdateSalDate = (id: string, newDate: string) => {
      const updated = sals.map(s => s.id === id ? { ...s, date: newDate, description: `SAL N. ${s.number} a tutto il ${format(parseISO(newDate), 'dd/MM/yyyy')}` } : s);
      onUpdateSals(updated);
  };

  const handleToggleSalLock = (id: string) => {
      const updated = sals.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s);
      onUpdateSals(updated);
  };

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-100px)] flex flex-col">
        {/* HEADER & SAL SELECTOR */}
        <div className="flex justify-between items-center mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Contabilità Lavori</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {activeSalId 
                        ? `Analisi corrente: SAL N. ${sals.find(s => s.id === activeSalId)?.number} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}`
                        : "Nessun SAL selezionato. Visualizzazione completa."
                    }
                </p>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Seleziona SAL:</span>
                    <select 
                        value={activeSalId || ''} 
                        onChange={e => setActiveSalId(e.target.value || null)}
                        className="p-2 bg-gray-100 dark:bg-gray-700 border-none rounded-lg text-sm font-bold text-indigo-700 dark:text-indigo-300 focus:ring-2 focus:ring-indigo-500"
                    >
                        {sals.length === 0 && <option value="">-- Nessun SAL --</option>}
                        {[...sals].sort((a,b) => b.number - a.number).map(sal => (
                            <option key={sal.id} value={sal.id}>
                                SAL N. {sal.number} ({format(parseISO(sal.date), 'dd/MM/yy')}) {sal.isLocked ? '🔒' : ''}
                            </option>
                        ))}
                    </select>
                    {activeTab === 'settings' && (
                        <button onClick={handleAddNewSal} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200" title="Nuovo SAL">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                        </button>
                    )}
                </div>
                {/* PDF Button */}
                {['libretto', 'register', 'summary', 'sal_technical', 'payment_cert'].includes(activeTab) && (
                    <button 
                        onClick={handleDownloadPDF}
                        disabled={isGeneratingPdf} 
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow hover:bg-indigo-700 disabled:bg-gray-400 flex items-center gap-2 self-end"
                    >
                        {isGeneratingPdf ? 'Generazione...' : 'Scarica PDF'} 
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                )}
            </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex space-x-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg overflow-x-auto mb-4 flex-shrink-0">
            {[
                {id: 'libretto', label: 'Libretto Misure'},
                {id: 'register', label: 'Registro Contabilità'},
                {id: 'summary', label: 'Sommario'},
                {id: 'sal_technical', label: 'Riepilogo SAL'},
                {id: 'payment_cert', label: 'Certificato Pagamento'},
                {id: 'settings', label: 'Impostazioni & SAL'}
            ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap capitalize ${activeTab === tab.id ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{tab.label}</button>
            ))}
        </div>

        {/* CONTENT AREA */}
        <div className="flex-grow bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col relative">
            {/* View Render Logic based on activeTab - reused from existing component but stripped of wrapper refs/styles for clean integration */}
            {activeTab === 'settings' && (
                /* ... Settings Render Logic (identical to previous) ... */
                <div className="p-8 max-w-5xl mx-auto w-full overflow-y-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Section 1: Anagrafica & Contratto */}
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                Dati Generali Contratto
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impresa Appaltatrice</label>
                                    <input type="text" value={localConfig.contractorName || ''} onChange={e => setLocalConfig({...localConfig, contractorName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" placeholder="Es. Edilizia Rossi Srl" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Codice CIG/CUP</label>
                                        <input type="text" value={localConfig.contractCode || ''} onChange={e => setLocalConfig({...localConfig, contractCode: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" placeholder="Es. 1234567890" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Data Contratto</label>
                                        <input type="date" value={localConfig.contractDate || ''} onChange={e => setLocalConfig({...localConfig, contractDate: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Parametri Economici */}
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
                                Parametri Economici
                            </h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ribasso d'Asta (%)</label>
                                    <input type="number" min="0" step="0.01" value={localConfig.discountPercent} onChange={e => setLocalConfig({...localConfig, discountPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white text-right font-mono" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ritenuta Garanzia (%)</label>
                                    <input type="number" min="0" step="0.1" value={localConfig.withholdingTaxPercent} onChange={e => setLocalConfig({...localConfig, withholdingTaxPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white text-right font-mono" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Aliquota IVA (%)</label>
                                    <input type="number" min="0" step="1" value={localConfig.vatPercent} onChange={e => setLocalConfig({...localConfig, vatPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white text-right font-mono" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Recupero Anticip. (%)</label>
                                    <input type="number" min="0" max="20" step="1" value={localConfig.advancePaymentPercent || 20} onChange={e => setLocalConfig({...localConfig, advancePaymentPercent: Math.min(20, Math.max(0, parseFloat(e.target.value) || 0))})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white text-right font-mono" />
                                    <p className="text-[10px] text-gray-500 mt-1">Max 20% secondo Codice Appalti</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center space-x-3 bg-white dark:bg-gray-600 p-3 rounded-lg border border-gray-200 dark:border-gray-500">
                                <input 
                                    type="checkbox" 
                                    id="laborDiscount"
                                    checked={localConfig.excludeLaborFromDiscount}
                                    onChange={e => setLocalConfig({...localConfig, excludeLaborFromDiscount: e.target.checked})}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="laborDiscount" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Scorpora Costo Manodopera dal Ribasso
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: SAL Management Table */}
                    <div className="mt-8 bg-white dark:bg-gray-700/20 p-6 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Cronologia SAL (Stati Avanzamento Lavori)
                            </h3>
                            <button 
                                onClick={handleAddNewSal}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                Nuovo SAL
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3 w-20 text-center">N°</th>
                                        <th className="px-4 py-3 w-40">Data Chiusura</th>
                                        <th className="px-4 py-3">Descrizione</th>
                                        <th className="px-4 py-3 w-32 text-right">Valore Netto Cum.</th>
                                        <th className="px-4 py-3 w-24 text-center">Stato</th>
                                        <th className="px-4 py-3 w-32 text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                    {sals.length === 0 ? (
                                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 italic">Nessun SAL creato. Le misure verranno visualizzate "a data odierna".</td></tr>
                                    ) : (
                                        [...sals].sort((a,b) => a.number - b.number).map((sal, index) => {
                                            // Get the Cumulative Net Value from the source-of-truth map
                                            const netValue = salCumulativeValuesMap.get(sal.id) || 0;
                                            
                                            return (
                                            <tr key={sal.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-4 py-3 text-center font-bold">{sal.number}</td>
                                                <td className="px-4 py-3">
                                                    <input 
                                                        type="date" 
                                                        value={sal.date} 
                                                        disabled={sal.isLocked}
                                                        onChange={(e) => handleUpdateSalDate(sal.id, e.target.value)}
                                                        className={`w-full bg-transparent border-none focus:ring-0 p-0 text-sm ${sal.isLocked ? 'text-gray-500' : 'text-gray-900 dark:text-white'}`}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">{sal.description}</td>
                                                <td className="px-4 py-3 text-right font-mono font-medium text-gray-800 dark:text-white bg-indigo-50 dark:bg-indigo-900/10">
                                                    {currencyFormatter.format(netValue)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button 
                                                        onClick={() => handleToggleSalLock(sal.id)}
                                                        className={`p-1.5 rounded-full transition-colors ${sal.isLocked ? 'text-red-600 bg-red-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                                                        title={sal.isLocked ? "Sblocca SAL" : "Blocca SAL"}
                                                    >
                                                        {sal.isLocked ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" /></svg>
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {/* Allow deleting only the last SAL to maintain sequence */}
                                                    {index === sals.length - 1 && !sal.isLocked && (
                                                        <button 
                                                            onClick={() => handleDeleteSal(sal.id)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                                                            title="Elimina SAL"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        )})
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Render the tables on screen for viewing only */}
            {activeTab === 'libretto' && (
                <div ref={contentRef} className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex-grow overflow-auto">
                         <table className="w-full text-xs text-left border-collapse">
                            {/* ... Header ... */}
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold border-b dark:border-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 w-16 text-center border-r dark:border-gray-600 align-top">N.</th>
                                    <th className="p-3 w-24 border-r dark:border-gray-600 align-top">Data</th>
                                    <th className="p-3 w-32 border-r dark:border-gray-600 align-top">WBS</th>
                                    <th className="p-3 w-32 border-r dark:border-gray-600 align-top">Codice</th>
                                    <th className="p-3 border-r dark:border-gray-600 align-top">Descrizione & Note</th>
                                    <th className="p-3 w-12 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-800 align-top">U.M.</th>
                                    <th className="p-3 w-16 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-800 align-top">Fatt.</th>
                                    <th className="p-3 w-16 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-800 align-top">Lung.</th>
                                    <th className="p-3 w-16 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-800 align-top">Larg.</th>
                                    <th className="p-3 w-16 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-800 align-top">H/P</th>
                                    <th className="p-3 w-24 text-right bg-indigo-50 dark:bg-indigo-900/20 align-top">Quantità</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredLibretto.filter(applyFilters).length === 0 ? (
                                     <tr><td colSpan={11} className="text-center py-10 italic text-gray-500">Nessuna misurazione.</td></tr>
                                ) : (
                                    filteredLibretto.filter(applyFilters).map((entry) => (
                                        <tr key={entry.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${entry.accountingType === 'body' ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}`}>
                                            <td className="p-3 text-center font-bold text-gray-500 dark:text-gray-400 border-r dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 align-top">{entry.progressiveIndex}</td>
                                            <td className="p-3 border-r dark:border-gray-600 font-mono text-gray-600 dark:text-gray-300 align-top">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                            <td className="p-3 border-r dark:border-gray-600 align-top text-xs text-gray-600 dark:text-gray-300 uppercase font-semibold break-words max-w-[150px]">{entry.groupName}</td>
                                            <td className="p-3 border-r dark:border-gray-600 align-top">
                                                <div className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">{entry.articleCode}</div>
                                            </td>
                                            <td className="p-3 border-r dark:border-gray-600 text-gray-800 dark:text-gray-200">
                                                <div className="text-xs text-gray-900 dark:text-gray-100 mb-2 font-medium text-justify leading-snug">{entry.description}</div>
                                                <div className="font-normal text-sm text-indigo-700 dark:text-indigo-300 italic border-t border-gray-200 dark:border-gray-600 pt-1">{entry.measurementNote || '-'}</div>
                                            </td>
                                            <td className="p-3 text-center border-r dark:border-gray-600 text-gray-600 font-medium bg-gray-50/30 align-bottom">{entry.unit}</td>
                                            
                                            <td className="p-3 text-center border-r dark:border-gray-600 text-gray-600 font-mono align-bottom">{entry.factor || '-'}</td>
                                            <td className="p-3 text-center border-r dark:border-gray-600 text-gray-600 font-mono align-bottom">{entry.length || '-'}</td>
                                            <td className="p-3 text-center border-r dark:border-gray-600 text-gray-600 font-mono align-bottom">{entry.width || '-'}</td>
                                            <td className="p-3 text-center border-r dark:border-gray-600 text-gray-600 font-mono align-bottom">{entry.height || '-'}</td>
                                            
                                            <td className={`p-3 text-right font-bold font-mono bg-indigo-50/30 dark:bg-indigo-900/10 align-bottom ${entry.quantity < 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                                                {entry.accountingType === 'body' 
                                                    ? percentFormatter.format(entry.quantity) 
                                                    : numberFormatter.format(entry.quantity)
                                                }
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                         </table>
                    </div>
                </div>
            )}

            {activeTab === 'register' && (
                <div ref={contentRef} className="flex-grow overflow-auto p-4 md:p-6">
                    <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300 border-collapse">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 w-20 text-center bg-yellow-50 dark:bg-yellow-900/20 border-r border-yellow-200 dark:border-yellow-900 align-top">Rif. M.</th>
                                <th className="px-4 py-3 w-24 align-top relative">Data</th>
                                <th className="px-4 py-3 w-32 align-top relative">WBS</th>
                                <th className="px-4 py-3 align-top relative">Descrizione</th>
                                <th className="px-4 py-3 w-16 text-center align-top">U.M.</th>
                                <th className="px-4 py-3 text-right w-24 align-top">Q.tà</th>
                                <th className="px-4 py-3 text-right w-24 align-top">Prezzo</th>
                                <th className="px-4 py-3 text-right w-32 align-top">Importo</th>
                                <th className="px-4 py-3 text-right w-32 bg-gray-200 dark:bg-gray-600 align-top">Progressivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {filteredRegistry.filter(applyFilters).map((entry, idx) => (
                                <tr key={idx} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.isSecurityCost ? 'bg-green-50 dark:bg-green-900/20' : entry.accountingType === 'body' ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}`}>
                                    <td className="px-4 py-2 text-center font-bold text-gray-700 dark:text-gray-300 bg-yellow-50/50 dark:bg-yellow-900/10 border-r border-gray-100 dark:border-gray-700">{entry.progressiveIndex}</td>
                                    <td className="px-4 py-2">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                    <td className="px-4 py-2 text-xs text-gray-500 uppercase font-bold">{entry.groupName} {entry.isSecurityCost && '🔒'}</td>
                                    <td className="px-4 py-2 max-w-md">
                                        <div className="truncate font-medium">{entry.description}</div>
                                        {entry.accountingType === 'body' && <div className="text-xs text-gray-500 italic">Valore calcolato su percentuale</div>}
                                    </td>
                                    <td className="px-4 py-2 text-center text-xs text-gray-500">{entry.unit}</td>
                                    <td className="px-4 py-2 text-right font-medium">
                                        {entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity)}
                                    </td>
                                    <td className="px-4 py-2 text-right">{currencyFormatter.format(entry.unitPrice)}</td>
                                    <td className={`px-4 py-2 text-right font-bold ${entry.debit < 0 ? 'text-red-500' : ''}`}>{currencyFormatter.format(entry.debit)}</td>
                                    <td className="px-4 py-2 text-right font-bold bg-gray-50 dark:bg-gray-700/30 text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(entry.progressive)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'summary' && (
                <div ref={contentRef} className="flex-grow overflow-auto p-4 md:p-6" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                    <table className="w-full text-[12px] text-left text-gray-600 dark:text-gray-300 border-collapse">
                        <thead className="text-[12px] text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 border-r dark:border-gray-600 align-top font-bold">Articolo</th>
                                <th className="px-4 py-3 border-r dark:border-gray-600 align-top font-bold">Descrizione</th>
                                <th className="px-4 py-3 w-16 text-center border-r dark:border-gray-600 align-top font-bold">U.M.</th>
                                <th className="px-4 py-3 w-24 text-right border-r dark:border-gray-600 align-top font-bold">Prezzo</th>
                                <th className="px-4 py-3 w-24 text-right border-r dark:border-gray-600 align-top font-bold">Q.tà Prev.</th>
                                <th className="px-4 py-3 w-24 text-right border-r dark:border-gray-600 align-top font-bold bg-green-50 dark:bg-green-900/10">Q.tà Tot.</th>
                                <th className="px-4 py-3 w-32 text-right border-r dark:border-gray-600 align-top font-bold bg-green-50 dark:bg-green-900/10">Importo</th>
                                <th className="px-4 py-3 w-20 text-right align-top font-bold">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {accountingSummary.filter(applyFilters).map((item) => (
                                <tr key={item.articleCode} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${item.accountingType === 'body' ? 'bg-purple-50/20' : ''}`}>
                                    <td className="px-4 py-2 font-mono font-semibold text-indigo-900 dark:text-indigo-400 border-r dark:border-gray-600">{item.articleCode}</td>
                                    <td className="px-4 py-2 border-r dark:border-gray-600 max-w-md truncate" title={item.description}>{item.description}</td>
                                    <td className="px-4 py-2 text-center border-r dark:border-gray-600">{item.unit}</td>
                                    <td className="px-4 py-2 text-right border-r dark:border-gray-600">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-4 py-2 text-right border-r dark:border-gray-600">
                                        {item.accountingType === 'body' ? '100%' : numberFormatter.format(item.estimatedQuantity)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white border-r dark:border-gray-600 bg-green-50/30 dark:bg-green-900/10">
                                        {item.accountingType === 'body' ? percentFormatter.format(item.totalQuantity) : numberFormatter.format(item.totalQuantity)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white border-r dark:border-gray-600 bg-green-50/30 dark:bg-green-900/10">{currencyFormatter.format(item.totalAmount)}</td>
                                    <td className="px-4 py-2 text-right">{percentFormatter.format(item.progressPercent / 100)}</td>
                                </tr>
                            ))}
                            {accountingSummary.length > 0 && (
                                <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                                    <td colSpan={6} className="px-4 py-3 text-right">TOTALE</td>
                                    <td className="px-4 py-3 text-right">{currencyFormatter.format(accountingSummary.reduce((acc, i) => acc + i.totalAmount, 0))}</td>
                                    <td></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'sal_technical' && (
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex justify-center">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl text-[12px] relative" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                        {/* Header ... */}
                        <div className="text-center mb-6 border-b-2 border-black pb-2">
                            <h1 className="text-xl font-bold uppercase tracking-widest mb-1">Stato Avanzamento Lavori</h1>
                            <h2 className="text-lg">Riepilogo Tecnico Contabile N. {sals.find(s => s.id === activeSalId)?.number || '(Bozza)'}</h2>
                        </div>
                        
                        {/* Project Info ... */}
                        <div className="grid grid-cols-2 gap-4 mb-6 text-[12px]">
                             <div><p className="font-bold uppercase mb-1">Lavori</p><p className="border-b border-gray-300 pb-1 mb-2">{projectName}</p></div>
                             <div><p className="font-bold uppercase mb-1">Data</p><p className="border-b border-gray-300 pb-1 mb-2">{format(parseISO(salReferenceDate), 'dd/MM/yyyy')}</p></div>
                        </div>

                        <table className="w-full mb-6 border-collapse border border-black text-[12px]">
                            <thead><tr className="bg-gray-200 uppercase"><th className="border border-black p-1.5 text-left font-bold">Descrizione</th><th className="border border-black p-1.5 text-right w-28 font-bold">Parziali/Calcoli</th><th className="border border-black p-1.5 text-right w-28 font-bold">Totali/Netti</th></tr></thead>
                            <tbody>
                                {/* SEZIONE A: LAVORI A MISURA */}
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>A) LAVORI A MISURA</td></tr>
                                <tr>
                                    <td className="border border-black p-1.5 pl-4">Totale Lavori a Misura (Lordo)</td>
                                    <td className="border border-black p-1.5 text-right font-medium">{currencyFormatter.format(currentSalData.measureTotal)}</td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>
                                {localConfig.excludeLaborFromDiscount && (
                                    <tr>
                                        <td className="border border-black p-1.5 pl-8 italic">
                                            - di cui Manodopera (non soggetta a ribasso)
                                        </td>
                                        <td className="border border-black p-1.5 text-right text-red-600">
                                            - {currencyFormatter.format(currentSalData.measureLabor)}
                                        </td>
                                        <td className="border border-black p-1.5 text-right font-bold">
                                            {currencyFormatter.format(currentSalData.measureLabor)}
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td className="border border-black p-1.5 pl-4 font-semibold">
                                        = Importo Lavori a Misura (Netto da ribassare)
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-semibold bg-blue-50">
                                        {currencyFormatter.format(currentSalData.measureNet)}
                                    </td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>

                                {/* SEZIONE B: LAVORI A CORPO */}
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>B) LAVORI A CORPO</td></tr>
                                <tr>
                                    <td className="border border-black p-1.5 pl-4">
                                        Totale Lavori a Corpo (Lordo)
                                        <span className="text-[10px] text-gray-500 block">
                                            (Avanzamento calcolato: {currentSalData.bodyPercentage.toFixed(2)}%)
                                        </span>
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-medium">{currencyFormatter.format(currentSalData.bodyTotal)}</td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>
                                {localConfig.excludeLaborFromDiscount && (
                                    <tr>
                                        <td className="border border-black p-1.5 pl-8 italic">
                                            - di cui Manodopera (non soggetta a ribasso)
                                        </td>
                                        <td className="border border-black p-1.5 text-right text-red-600">
                                            - {currencyFormatter.format(currentSalData.bodyLabor)}
                                        </td>
                                        <td className="border border-black p-1.5 text-right font-bold">
                                            {currencyFormatter.format(currentSalData.bodyLabor)}
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td className="border border-black p-1.5 pl-4 font-semibold">
                                        = Importo Lavori a Corpo (Netto da ribassare)
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-semibold bg-blue-50">
                                        {currencyFormatter.format(currentSalData.bodyNet)}
                                    </td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>

                                {/* SEZIONE C: SICUREZZA */}
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>C) ONERI SICUREZZA</td></tr>
                                <tr>
                                    <td className="border border-black p-1.5 pl-4">Totale Oneri Sicurezza (non soggetti a ribasso)</td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                    <td className="border border-black p-1.5 text-right font-bold">{currencyFormatter.format(currentSalData.security)}</td>
                                </tr>

                                {/* SEZIONE D: CALCOLO RIBASSO E RIEPILOGO */}
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>D) RIEPILOGO GENERALE</td></tr>
                                
                                <tr>
                                    <td className="border border-black p-1.5 pl-4">
                                        Sommano Lavori soggetti a ribasso (A netto + B netto)
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-bold">
                                        {currencyFormatter.format(currentSalData.measureNet + currentSalData.bodyNet)}
                                    </td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1.5 pl-4 italic">
                                        - Ribasso d'Asta del {localConfig.discountPercent}%
                                    </td>
                                    <td className="border border-black p-1.5 text-right text-red-600">
                                        - {currencyFormatter.format((currentSalData.measureNet + currentSalData.bodyNet) * (localConfig.discountPercent / 100))}
                                    </td>
                                    <td className="border border-black p-1.5 bg-gray-50"></td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1.5 pl-4 font-bold text-indigo-900 bg-indigo-50">
                                        = Totale Lavori Netto (Ribassato)
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-bold text-indigo-900 bg-indigo-50">
                                        {currencyFormatter.format(currentSalData.netWorksAfterDiscount)}
                                    </td>
                                    {/* CRITICAL CHANGE: Move the Net Works result to the RIGHT column */}
                                    <td className="border border-black p-1.5 text-right font-bold text-indigo-900 bg-indigo-50">
                                        {currencyFormatter.format(currentSalData.netWorksAfterDiscount)}
                                    </td>
                                </tr>

                                {/* SEZIONE E: TOTALE GENERALE */}
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>E) TOTALE GENERALE NETTO (Somma colonna Totali)</td></tr>
                                <tr className="font-bold text-sm">
                                    <td className="border border-black p-2 uppercase">TOTALE NETTO SAL CUMULATIVO</td>
                                    <td className="border border-black p-2 bg-gray-50"></td>
                                    {/* Now strictly the sum of the right column components: Labor + Security + Net Works */}
                                    <td className="border border-black p-2 text-right bg-green-100 border-green-500 border-2">
                                        {currencyFormatter.format(
                                            (localConfig.excludeLaborFromDiscount ? (currentSalData.measureLabor + currentSalData.bodyLabor) : 0) + 
                                            currentSalData.security + 
                                            currentSalData.netWorksAfterDiscount
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="mt-6 text-center text-[10px] italic text-gray-500">Il presente atto certifica esclusivamente l'avanzamento fisico ed economico dei lavori al netto del ribasso d'asta. Gli importi sono cumulativi dall'inizio del cantiere alla data del SAL.</div>
                        <div className="mt-12 pt-4 grid grid-cols-2 gap-16 text-center"><div><p className="text-[10px] uppercase font-bold mb-8">L'Impresa</p><div className="border-b border-black w-2/3 mx-auto"></div></div><div><p className="text-[10px] uppercase font-bold mb-8">Il Direttore dei Lavori</p><div className="border-b border-black w-2/3 mx-auto"></div></div></div>
                    </div>
                </div>
            )}

            {activeTab === 'payment_cert' && (
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex justify-center">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl text-[12px] relative" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                        <div className="text-center mb-8 border-b-2 border-black pb-4">
                            <h1 className="text-xl font-bold uppercase tracking-widest mb-1">Certificato di Pagamento</h1>
                            <h2 className="text-lg">Rata di Acconto N. {sals.find(s => s.id === activeSalId)?.number || '(Bozza)'}</h2>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-8 mb-8 text-[12px]">
                             <div><p className="font-bold uppercase mb-1">CIG/CUP</p><p className="border-b border-gray-300 pb-1 mb-3">{localConfig.contractCode || '-'}</p></div>
                             <div><p className="font-bold uppercase mb-1">Impresa</p><p className="border-b border-gray-300 pb-1 mb-3">{localConfig.contractorName || '-'}</p></div>
                        </div>

                        <table className="w-full mb-8 border-collapse border border-black text-[12px]">
                            <thead><tr className="bg-gray-200 uppercase"><th className="border border-black p-2 text-left font-bold">Descrizione</th><th className="border border-black p-2 text-right w-32 font-bold">Importi</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td className="border border-black p-2 font-bold">1. Totale Netto Lavori (da SAL Cumulativo)</td>
                                    <td className="border border-black p-2 text-right font-bold">{currencyFormatter.format(paymentCertData.currentNet)}</td>
                                </tr>
                                
                                {previousSalObject ? (
                                    <tr>
                                        <td className="border border-black p-2 pl-4 text-gray-600">
                                            Dedurre SAL precedente n. {previousSalObject.number} del {format(parseISO(previousSalObject.date), 'dd/MM/yyyy')} (Netto Cumulativo)
                                        </td>
                                        <td className="border border-black p-2 text-right text-red-600">
                                            - {currencyFormatter.format(paymentCertData.previousNet)}
                                        </td>
                                    </tr>
                                ) : (
                                    <tr>
                                        <td className="border border-black p-2 pl-4 text-gray-400 italic">Nessun SAL precedente da dedurre</td>
                                        <td className="border border-black p-2 text-right text-gray-400">-</td>
                                    </tr>
                                )}

                                <tr className="bg-gray-50">
                                    <td className="border border-black p-2 font-bold">2. Rata di Acconto Lorda (Delta SAL)</td>
                                    <td className="border border-black p-2 text-right font-bold">{currencyFormatter.format(paymentCertData.rataAcconto)}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-2 pl-4">Ritenuta a garanzia ({localConfig.withholdingTaxPercent}%)</td>
                                    <td className="border border-black p-2 text-right text-red-600">- {currencyFormatter.format(paymentCertData.retentionAmount)}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-2 pl-4">Recupero Anticipazione ({localConfig.advancePaymentPercent}%)</td>
                                    <td className="border border-black p-2 text-right text-red-600">- {currencyFormatter.format(paymentCertData.recoveryAmount)}</td>
                                </tr>
                                <tr className="bg-gray-100">
                                    <td className="border border-black p-2 font-bold uppercase">3. Imponibile Certificato</td>
                                    <td className="border border-black p-2 text-right font-bold">{currencyFormatter.format(paymentCertData.taxableCertified)}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-2 pl-4">I.V.A. ({localConfig.vatPercent}%)</td>
                                    <td className="border border-black p-2 text-right">{currencyFormatter.format(paymentCertData.vatAmount)}</td>
                                </tr>
                                <tr className="bg-gray-200 text-base">
                                    <td className="border border-black p-3 font-bold uppercase">TOTALE DA PAGARE</td>
                                    <td className="border border-black p-3 text-right font-bold">{currencyFormatter.format(paymentCertData.totalPayable)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="mt-8 text-xs">
                            <p className="mb-2">Si certifica che i lavori sono stati eseguiti a regola d'arte e in conformità al contratto. Il presente certificato è emesso ai fini della liquidazione della rata di acconto spettante all'impresa.</p>
                            <p className="font-bold">Luogo e Data: __________________, {format(new Date(), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="mt-16 text-right"><p className="text-sm font-bold uppercase mb-12">Il Direttore dei Lavori</p><div className="border-b border-black w-64 ml-auto"></div></div>
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};

export default AccountingView;
