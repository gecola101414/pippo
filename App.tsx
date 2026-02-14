
import React, { useState, useCallback } from 'react';
import { Tender } from './types';
import { findTenders } from './services/geminiService';
import SearchForm from './components/SearchForm';
import ResultsDisplay from './components/ResultsDisplay';
import { BuildingOfficeIcon } from './components/Icons';

const App: React.FC = () => {
  const [comune, setComune] = useState<string>('');
  const [tipoGara, setTipoGara] = useState<string>('');
  const [importoMassimo, setImportoMassimo] = useState<string>('');
  
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState<boolean>(false);

  const handleSearch = useCallback(async () => {
    if (!comune || !tipoGara || !importoMassimo) {
      setError("Per favore, compila tutti i campi di ricerca.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setSearched(true);
    setTenders([]);

    try {
      const results = await findTenders(comune, tipoGara, importoMassimo);
      const resultsWithIds = results.map(tender => ({
        ...tender,
        id: crypto.randomUUID(),
      }));
      setTenders(resultsWithIds);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Si è verificato un errore inaspettato.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [comune, tipoGara, importoMassimo]);

  return (
    <div className="min-h-screen bg-gray-100 font-sans p-4 sm:p-6 md:p-8">
      <main className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
            <div className="flex justify-center items-center gap-4 mb-2">
                <BuildingOfficeIcon className="h-10 w-10 text-blue-600" />
                <h1 className="text-4xl md:text-5xl font-bold text-gray-800 tracking-tight">
                    Ricerca Gare Pubbliche
                </h1>
            </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Trova le opportunità di lavori pubblici nel comune di tuo interesse.
          </p>
        </header>
        
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-8 sticky top-4 z-10 border border-gray-200">
           <SearchForm
            comune={comune}
            setComune={setComune}
            tipoGara={tipoGara}
            setTipoGara={setTipoGara}
            importoMassimo={importoMassimo}
            setImportoMassimo={setImportoMassimo}
            onSearch={handleSearch}
            isLoading={isLoading}
          />
        </div>

        <ResultsDisplay 
          isLoading={isLoading} 
          error={error} 
          tenders={tenders} 
          searched={searched} 
        />
      </main>
      <footer className="text-center mt-12 py-4">
        <p className="text-gray-500 text-sm">Powered by Gemini API</p>
      </footer>
    </div>
  );
};

export default App;
