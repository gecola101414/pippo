
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { analyzeBillOfQuantities, analyzePrimusPdf, getProjectInsight, getRiskAnalysis } from './services/geminiService';
import { fetchServerDateHeader } from './services/licenseService';
import { saveToGoogleDrive } from './services/googleDriveService';
import { WorkGroup, ProjectDocument, WorkItem, Risk, Expense, Dependency, Team, Worker, SavedProject, ContractConfig, SalEntry } from './types';
import GanttChart from './components/GanttChart';
import Loader from './components/Loader';
import Header from './components/Header';
import ProjectSummary from './components/ProjectSummary';
import ComputoDetailView from './components/ComputoDetailView';
import ChatAssistantButton from './components/ChatAssistantButton';
import ChatModal from './components/ChatModal';
import RiskAnalysisPanel from './components/RiskAnalysisPanel';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { it } from 'date-fns/locale/it';
import ShareModal from './components/ShareModal';
import TaskModal from './components/TaskModal';
import MeasurementsView from './components/MeasurementsView';
import CostsView from './components/CostsView';
import { recalculateSchedule } from './services/scheduleService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TeamManagementView from './components/TeamManagementView';
import ReportsView from './components/ReportsView';
import PortfolioView from './components/PortfolioView';
import UserManualView from './components/UserManualView';
import AccountingView from './components/AccountingView';

export type View = 'dashboard' | 'timeline' | 'summary' | 'measurements' | 'sal-report' | 'costs' | 'teams' | 'reports' | 'help' | 'accounting';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

const colorPalette = [
  '#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#D0021B',
  '#9013FE', '#B8E986', '#7ED321', '#BD10E0', '#417505',
  '#E67E22', '#1ABC9C', '#3498DB', '#9B59B6', '#E74C3C',
];

const sanitizeDocuments = (documents: ProjectDocument[]): ProjectDocument[] => {
  return documents.map((doc, index) => ({
    ...doc,
    isVisible: doc.isVisible ?? true, 
    isFrozen: doc.isFrozen ?? false, 
    isLocked: doc.isLocked ?? false, 
    dependencies: doc.dependencies ?? [],
    salMarkers: index === 0 ? (doc.salMarkers ?? []) : undefined,
    workGroups: doc.workGroups.map(wg => ({
      ...wg,
      progress: wg.progress ?? 0,
      isSecurityCost: wg.isSecurityCost ?? false,
      accountingType: wg.accountingType ?? 'measure',
      items: wg.items.map(item => ({
        ...item,
        measurements: item.measurements?.map(m => ({
            ...m,
            id: m.id || crypto.randomUUID() 
        })) ?? [],
        annotations: item.annotations || [],
        variations: item.variations || [],
        laborRate: item.laborRate || 0,
        laborValue: item.laborValue || 0
      }))
    }))
  }));
};

const sanitizeExpenses = (expenses: any[]): Expense[] => {
  return expenses.map(e => ({
    ...e,
    insertionDate: e.insertionDate || new Date(e.date).toISOString()
  }));
};

const generateDemoData = (): { documents: ProjectDocument[], expenses: Expense[], teams: Team[], workers: Worker[] } => {
  let currentDate = new Date();
  const createWorkGroupFromItems = (name: string, duration: number, items: WorkItem[], color: string, isSecurity: boolean = false): WorkGroup => {
    const startDate = new Date(currentDate);
    const endDate = addDays(startDate, duration - 1);
    currentDate = addDays(endDate, 2);
    const value = items.reduce((acc, item) => acc + item.total, 0);
    return {
      id: `${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 9)}`,
      name, value, duration, color,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      progress: 0, items, isSecurityCost: isSecurity, accountingType: 'measure'
    };
  };

  const module1_workGroups: WorkGroup[] = [
    createWorkGroupFromItems('Opere Edili Interne', 15, [{ articleCode: 'EDL.01.A', description: 'Demolizione tramezzi.', quantity: 150, unit: 'm²', unitPrice: 25, total: 3750, measurements: [], annotations: [], variations: [], laborRate: 35, laborValue: 1312.5 }], colorPalette[0]),
    createWorkGroupFromItems('Impianti Tecnologici', 25, [{ articleCode: 'IMP.02.A', description: 'Realizzazione impianto elettrico.', quantity: 1, unit: 'corpo', unitPrice: 20000, total: 20000, measurements: [], annotations: [], variations: [], laborRate: 45, laborValue: 9000 }], colorPalette[1]),
    createWorkGroupFromItems('Oneri Sicurezza', 40, [{ articleCode: 'SIC.01', description: 'Oneri per la sicurezza.', quantity: 1, unit: 'corpo', unitPrice: 2500, total: 2500, measurements: [], annotations: [], variations: [] }], '#10B981', true)
  ];
  
  const project1: ProjectDocument = { fileName: 'Modulo 1: Ristrutturazione', workGroups: module1_workGroups, totalValue: module1_workGroups.reduce((acc, wg) => acc + wg.value, 0), isVisible: true, isFrozen: false, isLocked: false };
  return { documents: sanitizeDocuments([project1]), expenses: [], teams: [], workers: [] };
};

const App: React.FC = () => {
  // Accesso Libero: isLoggedIn e isAdmin sempre true
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>('Utente Chronos');
  const [remainingDays, setRemainingDays] = useState<number | null>(9999);
  const [serverDate, setServerDate] = useState<Date | null>(new Date());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projectName, setProjectName] = useState<string>("Nuovo Cantiere");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [contractConfig, setContractConfig] = useState<ContractConfig | undefined>(undefined);
  const [sals, setSals] = useState<SalEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [isShareMode, setIsShareMode] = useState<boolean>(false);
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [isAnalyzingRisks, setIsAnalyzingRisks] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareableLink, setShareableLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTask, setSelectedTask] = useState<WorkGroup | null>(null);
  const [isEconomicViewVisible, setIsEconomicViewVisible] = useState<boolean>(false);

  useEffect(() => {
      const loadedProjects = localStorage.getItem('chronos_projects');
      if (loadedProjects) {
          try {
              const parsed = JSON.parse(loadedProjects);
              if (Array.isArray(parsed)) setSavedProjects(parsed);
          } catch (e) { console.error(e); }
      }
      const loadedResources = localStorage.getItem('chronos_global_resources');
      if (loadedResources) {
          try {
              const parsed = JSON.parse(loadedResources);
              if (parsed.teams) setTeams(parsed.teams);
              if (parsed.workers) setWorkers(parsed.workers);
          } catch (e) { console.error(e); }
      }
  }, []);

  const saveCurrentProject = useCallback(() => {
      if (!currentProjectId) return;
      const existingProject = savedProjects.find(p => p.id === currentProjectId);
      const projectData: SavedProject = {
          id: currentProjectId,
          name: projectName,
          location: existingProject?.location, 
          status: existingProject?.status || 'active',
          lastModified: new Date().toISOString(),
          contractConfig: contractConfig, 
          data: { projectDocuments, expenses, teams, workers, sals }
      };
      setSavedProjects(prev => {
          const filtered = prev.filter(p => p.id !== currentProjectId);
          const updated = [...filtered, projectData].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  }, [currentProjectId, projectName, projectDocuments, expenses, teams, workers, savedProjects, contractConfig, sals]);

  useEffect(() => {
      if (currentProjectId) {
          const timer = setTimeout(() => { saveCurrentProject(); }, 2000); 
          return () => clearTimeout(timer);
      }
  }, [projectDocuments, expenses, projectName, currentProjectId, saveCurrentProject, teams, workers, contractConfig, sals]);

  const handleReset = useCallback(() => {
    localStorage.clear();
    window.location.reload();
  }, []);

  const handleEnterDemoMode = () => {
    const demoData = generateDemoData();
    setProjectDocuments(demoData.documents);
    setProjectName("Progetto Demo: Chronos AI");
    setCurrentProjectId('demo-project');
    setActiveView('dashboard');
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

    const processAndAddGroups = (processedGroups: Omit<WorkGroup, 'startDate' | 'endDate' | 'progress'>[], fileName: string) => {
        if (processedGroups.length === 0) return;
        let lastEndDate = new Date();
        const finalWorkGroups = processedGroups.map((group) => {
          const startDate = new Date(lastEndDate);
          const endDate = addDays(startDate, group.duration - 1);
          lastEndDate = addDays(endDate, 1);
          return { ...group, id: `doc${projectDocuments.length}-${group.id}`, progress: 0, startDate: format(startDate, 'yyyy-MM-dd'), endDate: format(endDate, 'yyyy-MM-dd'), isSecurityCost: false, accountingType: 'measure' as const };
        });
        const newDocument: ProjectDocument = { fileName, workGroups: finalWorkGroups, totalValue: finalWorkGroups.reduce((acc, group) => acc + group.value, 0), isVisible: true, isFrozen: false, isLocked: false };
        setProjectDocuments(prev => [...prev, newDocument]);
        setProjectName(prev => (prev === "Nuovo Cantiere" || !prev) ? fileNameWithoutExt : prev);
        setActiveView('timeline');
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
            const jsonData = JSON.parse(content);
            setProjectDocuments(sanitizeDocuments(jsonData.projectDocuments));
            setExpenses(sanitizeExpenses(jsonData.expenses || []));
            setProjectName(jsonData.projectName || "Progetto Importato");
            setSals(jsonData.sals || []);
            setActiveView('dashboard');
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
            const base64String = content.split(',')[1];
            const analyzedData = await analyzePrimusPdf(base64String);
            processAndAddGroups(analyzedData, fileNameWithoutExt);
        } else {
            const analyzedData = await analyzeBillOfQuantities(content);
            processAndAddGroups(analyzedData, fileNameWithoutExt);
        }
      } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
    };
    if (file.name.toLowerCase().endsWith('.pdf')) reader.readAsDataURL(file);
    else reader.readAsText(file);
  }, [projectDocuments]);

  const handleWorkGroupsUpdate = useCallback((updater: React.SetStateAction<WorkGroup[]>, updatedGroupId?: string) => {
    setProjectDocuments(prevDocs => {
      const allCurrentGroups = prevDocs.flatMap(doc => doc.workGroups);
      const tempUpdatedGroups = typeof updater === 'function' ? updater(allCurrentGroups) : updater;
      let finalUpdatedGroups = tempUpdatedGroups;
      if (updatedGroupId) {
        const allDependencies = prevDocs.flatMap(doc => doc.dependencies || []);
        finalUpdatedGroups = recalculateSchedule(tempUpdatedGroups, allDependencies, updatedGroupId);
      }
      const updatedGroupsMap = new Map<string, WorkGroup>();
      finalUpdatedGroups.forEach(group => updatedGroupsMap.set(group.id, group));
      return prevDocs.map(doc => ({ ...doc, workGroups: doc.workGroups.map(group => updatedGroupsMap.get(group.id) || group) }));
    });
  }, []);
  
  const handleDependenciesChange = useCallback((updater: (prev: Dependency[]) => Dependency[]) => {
      setProjectDocuments(prevDocs => {
          if (prevDocs.length === 0) return prevDocs;
          const newDocs = [...prevDocs];
          const masterDoc = { ...newDocs[0] };
          masterDoc.dependencies = updater(masterDoc.dependencies ?? []);
          newDocs[0] = masterDoc;
          return newDocs;
      });
  }, []);

  const handleSendMessage = async (message: string) => {
    setChatMessages(prev => [...prev, { sender: 'user', text: message }]);
    setIsChatLoading(true);
    try {
      const aiResponse = await getProjectInsight(projectDocuments, expenses, message);
      setChatMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
    } catch (err) { setChatMessages(prev => [...prev, { sender: 'ai', text: 'Errore assistente.' }]); }
    finally { setIsChatLoading(false); }
  };

  const handleOpenProject = (project: SavedProject) => {
      setProjectDocuments(project.data.projectDocuments);
      setExpenses(project.data.expenses);
      setProjectName(project.name);
      if(project.contractConfig) setContractConfig(project.contractConfig);
      setSals(project.data.sals || []);
      setCurrentProjectId(project.id);
      setActiveView('dashboard');
  };

  const handleCreateProject = () => {
      setProjectDocuments([]); setExpenses([]); setProjectName("Nuovo Cantiere"); setContractConfig(undefined); setSals([]);
      const newId = crypto.randomUUID();
      setCurrentProjectId(newId);
      setActiveView('dashboard');
      setTimeout(() => { fileInputRef.current?.click(); }, 100);
  };

  const isProjectLoaded = projectDocuments.length > 0 || currentProjectId !== null;

  const projectSummaryStats = useMemo(() => {
    if (!isProjectLoaded) return null;
    const grandTotal = projectDocuments.reduce((acc, doc) => acc + doc.workGroups.reduce((gAcc, group) => gAcc + group.items.reduce((iAcc, item) => iAcc + (item.quantity * item.unitPrice), 0), 0), 0);
    const earnedValue = projectDocuments.reduce((acc, doc) => acc + doc.workGroups.reduce((gAcc, group) => gAcc + group.items.reduce((iAcc, item) => iAcc + ((item.measurements || []).reduce((mAcc, m) => mAcc + m.quantity, 0) * item.unitPrice), 0), 0), 0);
    return { grandTotal, earnedValue, overallProgress: grandTotal > 0 ? (earnedValue / grandTotal) * 100 : 0, totalCosts: expenses.reduce((acc, e) => acc + e.amount, 0) };
  }, [projectDocuments, expenses, isProjectLoaded]);

  if (!currentProjectId && !isShareMode) {
      return <PortfolioView projects={savedProjects} globalTeams={teams} globalWorkers={workers} onOpenProject={handleOpenProject} onCreateProject={handleCreateProject} onDeleteProject={id => setSavedProjects(p => p.filter(x => x.id !== id))} onArchiveProject={id => setSavedProjects(p => p.map(x => x.id === id ? {...x, status: 'archived'} : x))} onRestoreProject={id => setSavedProjects(p => p.map(x => x.id === id ? {...x, status: 'active'} : x))} onLoadDemo={handleEnterDemoMode} onUpdateProjectMeta={(id, name, loc) => setSavedProjects(p => p.map(x => x.id === id ? {...x, name, location: loc} : x))} onLogout={handleReset} />;
  }
  
  const renderContent = () => {
    switch(activeView) {
      case 'dashboard': return <Dashboard projectSummary={projectSummaryStats} risks={risks} onViewChange={setActiveView} documentCount={projectDocuments.length} onImport={() => fileInputRef.current?.click()} isProjectLoaded={isProjectLoaded} isDemoMode={false} />;
      case 'timeline': return <GanttChart workGroups={projectDocuments.flatMap(d => d.workGroups)} dependencies={projectDocuments.flatMap(d => d.dependencies ?? [])} expenses={expenses} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} onBarDoubleClick={setSelectedTask} isEconomicViewVisible={isEconomicViewVisible} onToggleEconomicView={() => setIsEconomicViewVisible(prev => !prev)} projectName={projectName} />;
      case 'summary': return <ComputoDetailView documents={projectDocuments} />;
      case 'measurements': return <MeasurementsView documents={projectDocuments} projectName={projectName} teams={teams} workers={workers} />;
      case 'costs': return <CostsView expenses={expenses} workGroups={projectDocuments.flatMap(d => d.workGroups)} onAddExpense={e => setExpenses(p => [...p, {...e, id: crypto.randomUUID(), insertionDate: new Date().toISOString()}])} onUpdateExpense={e => setExpenses(p => p.map(x => x.id === e.id ? e : x))} onDeleteExpense={id => setExpenses(p => p.filter(x => x.id !== id))} isViewOnly={false} earnedValue={projectSummaryStats?.earnedValue ?? 0} />;
      case 'teams': return <TeamManagementView teams={teams} workers={workers} onAddTeam={t => setTeams(p => [...p, t])} onUpdateTeam={t => setTeams(p => p.map(x => x.id === t.id ? t : x))} onDeleteTeam={id => setTeams(p => p.filter(x => x.id !== id))} onAddWorker={w => setWorkers(p => [...p, w])} onUpdateWorker={w => setWorkers(p => p.map(x => x.id === w.id ? w : x))} onDeleteWorker={id => setWorkers(p => p.filter(x => x.id !== id))} isViewOnly={false} />;
      case 'accounting': return <AccountingView documents={projectDocuments} projectName={projectName} contractConfig={contractConfig} onUpdateContractConfig={setContractConfig} sals={sals} onUpdateSals={setSals} />;
      case 'help': return <UserManualView />;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-sans">
      <input type="file" ref={fileInputRef} onChange={e => e.target.files && Array.from(e.target.files).forEach(handleFileUpload)} multiple accept=".txt,.json,.pdf" className="hidden" />
      <div className="flex h-screen">
          <Sidebar activeView={activeView} onViewChange={setActiveView} isProjectLoaded={isProjectLoaded} onLogout={handleReset} isViewOnly={false} onExitProject={() => setCurrentProjectId(null)} />
          <div className="flex-1 flex flex-col ml-64">
            <Header userEmail={userEmail} remainingDays={9999} serverDate={serverDate} onAnalyzeRisks={async () => { setIsAnalyzingRisks(true); const r = await getRiskAnalysis(projectDocuments); setRisks(r); setIsAnalyzingRisks(false); }} isAnalyzingRisks={isAnalyzingRisks} onImport={() => fileInputRef.current?.click()} onExport={() => {}} onShare={() => setIsShareModalOpen(true)} isProjectLoaded={isProjectLoaded} isAdmin={true} onGenerateLicense={() => {}} isViewOnly={false} isShareMode={false} isDemoMode={false} isSessionExpired={false} sessionSecondsRemaining={3600} projectName={projectName} onUpdateProjectName={setProjectName} lastSavedTime={lastSavedTime} />
            <main className="flex-grow p-4 md:p-6 overflow-y-auto">
              <div className="max-w-7xl mx-auto">
                  <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden min-h-[400px] flex flex-col">{renderContent()}</div>
              </div>
            </main>
          </div>
      </div>
      {isProjectLoaded && <ChatAssistantButton onClick={() => setIsChatOpen(true)} />}
      <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} messages={chatMessages} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
      <TaskModal isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} group={selectedTask} allWorkGroups={projectDocuments.flatMap(d => d.workGroups)} dependencies={projectDocuments.flatMap(d => d.dependencies ?? [])} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} isViewOnly={false} isLocked={false} teams={teams} workers={workers} />
      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} link={shareableLink} />
    </div>
  );
};

export default App;
