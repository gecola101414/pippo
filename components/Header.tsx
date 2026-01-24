
import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';

interface HeaderProps {
  userEmail: string;
  remainingDays: number | null;
  serverDate: Date | null;
  onAnalyzeRisks: () => void;
  isAnalyzingRisks: boolean;
  onImport: () => void;
  onExport: () => void;
  onSaveToDrive?: () => void;
  onShare: () => void;
  isProjectLoaded: boolean;
  isAdmin: boolean;
  onGenerateLicense: () => void;
  isViewOnly: boolean;
  isShareMode: boolean;
  isDemoMode: boolean;
  isSessionExpired: boolean;
  sessionSecondsRemaining: number;
  projectName?: string;
  onUpdateProjectName?: (name: string) => void;
  lastSavedTime: string | null;
}

const NavButton: React.FC<{
    onClick?: () => void;
    disabled?: boolean;
    isDanger?: boolean;
    children: React.ReactNode;
    title?: string;
}> = ({ onClick, disabled, isDanger, children, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center space-x-1.5 px-3 py-2 text-sm rounded-md transition-colors
      ${
        isDanger 
          ? 'font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {children}
  </button>
);

const Header: React.FC<HeaderProps> = ({ 
    userEmail, 
    onAnalyzeRisks,
    isAnalyzingRisks,
    onImport,
    onExport,
    onSaveToDrive,
    onShare,
    isProjectLoaded,
    isViewOnly,
    projectName,
    onUpdateProjectName,
    lastSavedTime
}) => {
  const [tempProjectName, setTempProjectName] = useState(projectName || "Nuovo Progetto");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectName) setTempProjectName(projectName);
  }, [projectName]);

  const handleNameBlur = () => {
      if (onUpdateProjectName && tempProjectName.trim() !== "") {
          onUpdateProjectName(tempProjectName);
      } else {
          setTempProjectName(projectName || "Nuovo Progetto");
      }
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-30 no-print border-b border-gray-200 dark:border-gray-700 h-20 flex-shrink-0">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center space-x-4 flex-wrap">
            <div className="mr-4 flex flex-col justify-center group relative">
                <div className="flex items-center">
                    {isProjectLoaded && !isViewOnly ? (
                        <>
                        <input 
                            ref={nameInputRef}
                            type="text" 
                            value={tempProjectName}
                            onChange={(e) => setTempProjectName(e.target.value)}
                            onBlur={handleNameBlur}
                            className="font-bold text-lg text-gray-800 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 focus:outline-none transition-colors w-64 truncate"
                        />
                        <button onClick={() => nameInputRef.current?.focus()} className="ml-2 text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        </>
                    ) : (
                        <h1 className="font-bold text-lg text-gray-800 dark:text-gray-100 truncate w-64" title={tempProjectName}>{tempProjectName}</h1>
                    )}
                </div>
                {lastSavedTime && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic">
                        Ultimo salvataggio: {format(new Date(lastSavedTime), 'dd/MM/yyyy HH:mm')}
                    </p>
                )}
            </div>

            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2 hidden sm:block"></div>

            <NavButton onClick={onImport} title="Importa file di progetto">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="hidden md:inline">Importa</span>
            </NavButton>
            
            <NavButton onClick={onExport} disabled={!isProjectLoaded} title="Esporta in JSON">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span className="hidden md:inline">Salva File</span>
            </NavButton>

            {onSaveToDrive && (
                <NavButton onClick={onSaveToDrive} disabled={!isProjectLoaded} title="Salva su Google Drive">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 1.985C8.825 1.985 5.86 3.165 3.58 5.115L6.69 10.515C7.94 8.795 9.87 7.745 12.01 7.745C15.53 7.745 18.57 9.855 19.95 12.925L23.06 7.525C20.91 4.195 16.74 1.985 12.01 1.985ZM9.49 11.995L6.37 17.395C7.88 18.995 9.9 19.995 12.14 19.995C15.35 19.995 18.17 18.215 19.7 15.545L16.59 10.145C15.75 11.235 14.07 11.995 12.14 11.995C11.16 11.995 10.26 11.665 9.49 11.995ZM4.91 6.895L1.8 12.295C2.33 15.635 4.5 18.395 7.42 19.995L10.53 14.595C7.8 13.995 5.76 11.755 4.91 6.895Z" /></svg>
                    <span className="hidden md:inline">Drive</span>
                </NavButton>
            )}

            <NavButton onClick={onAnalyzeRisks} disabled={!isProjectLoaded || isAnalyzingRisks} title="Analisi Rischi AI">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isAnalyzingRisks ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="hidden md:inline">Rischi AI</span>
            </NavButton>
        </div>

        <div className="flex items-center space-x-4">
             <div className="text-right">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Chronos AI</p>
                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Accesso Libero</p>
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
