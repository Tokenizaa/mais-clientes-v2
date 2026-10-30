/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

import { Sidebar, ScreenTab } from './components/Sidebar';
import { SearchScreen } from './components/SearchScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ExportScreen } from './components/ExportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { LogsScreen } from './components/LogsScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ProjectsScreen } from './components/ProjectsScreen';
import { CredentialsScreen } from './components/CredentialsScreen';
import { AuthScreen } from './components/AuthScreen';
import { PlaceRecord, ScrapeJob } from './shared/types';
import { Menu, ChevronRight, Activity, Database, FileSpreadsheet } from 'lucide-react';

import { createClient } from '@supabase/supabase-js';

// Supabase Auth initialization
let supabase: any = null;

try {
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL || processEnv?.VITE_SUPABASE_URL || '')?.trim();
  const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || processEnv?.VITE_SUPABASE_ANON_KEY || '')?.trim();
  
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
} catch (e) {
  console.error('Supabase client initialization error:', e);
}

import { apiFetch, getAuthToken } from './utils/api.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('dashboard');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(() => Boolean(window.sessionStorage.getItem('mapscrape_session_token')));
  const [authUser, setAuthUser] = useState<{ id: string; email: string; name: string; role: 'admin' | 'user' } | null>(() => {
    try { 
      const userJson = window.sessionStorage.getItem('mapscrape_user'); 
      return userJson ? JSON.parse(userJson) : null; 
    } catch { return null; }
  });
  const [apiKeyError, setApiKeyError] = useState('');

  useEffect(() => {
    // Initialize Supabase Auth session if client available
    if (!supabase) return;
    
    let active = true;
    
    // Restore session from Supabase
    supabase.auth.getSession().then(async ({ data, error }: { data: any; error: any }) => {
      if (!active) return;
      
      if (data?.session?.user?.id) {
        const userId = data.session.user.id;
        window.sessionStorage.setItem('mapscrape_user_id', userId);
        
        // Look up the user profile in our database
        try {
          const profileResponse = await apiFetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            cache: 'no-store',
          });
          
          if (!profileResponse.ok) {
            // Fall back to reading from sessionStorage if API call fails
            const userJson = window.sessionStorage.getItem('mapscrape_user');
            if (userJson) {
              setAuthUser(JSON.parse(userJson));
            }
          } else {
            const profile = await profileResponse.json();
            if (profile.user) {
              setAuthUser(profile.user);
              window.sessionStorage.setItem('mapscrape_user', JSON.stringify(profile.user));
            }
          }
        } catch (err) {
          // Fall back to sessionStorage
          const userJson = window.sessionStorage.getItem('mapscrape_user');
          if (userJson) {
            setAuthUser(JSON.parse(userJson));
          }
        }
      } else {
        // No session - clear any stored auth state
        window.sessionStorage.removeItem('mapscrape_session_token');
        window.sessionStorage.removeItem('mapscrape_user');
        setAuthUser(null);
      }
    });
    
    // Listen for auth state changes
    const unsubscribe = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (!active) return;
      
      if (session?.user?.id) {
        const userId = session.user.id;
        window.sessionStorage.setItem('mapscrape_user_id', userId);
        
        // Fetch user profile
        try {
          const profileResponse = await apiFetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          });
          
          if (!profileResponse.ok) {
            // Fall back
          } else {
            const profile = await profileResponse.json();
            if (profile.user) {
              setAuthUser(profile.user);
              window.sessionStorage.setItem('mapscrape_user', JSON.stringify(profile.user));
              window.sessionStorage.setItem('mapscrape_session_token', session.access_token);
            }
          }
        } catch (err) {
          // Fall back
        }
      } else {
        // User signed out
        window.sessionStorage.removeItem('mapscrape_session_token');
        window.sessionStorage.removeItem('mapscrape_user');
        setAuthUser(null);
        setHasApiKey(false);
      }
    });
    
    return () => {
      active = false;
      unsubscribe();
    };
  }, [supabase]);

  const [isConnectingApi, setIsConnectingApi] = useState(false);

  const handleConnectApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = apiKeyInput.trim();
    if (!key) return;
    setIsConnectingApi(true);
    setApiKeyError('');
    window.sessionStorage.setItem('mapscrape_api_key', key);
    try {
      const response = await apiFetch('/api/v1/jobs', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Chave de API inválida ou revogada.' : `Falha de autenticação (HTTP ${response.status}).`);
      setHasApiKey(true);
      setApiKeyInput('');
      // Load history and places after connecting
      // These will be loaded below
    } catch (error) {
      window.sessionStorage.removeItem('mapscrape_api_key');
      setHasApiKey(false);
      setApiKeyError(error instanceof Error ? error.message : 'Não foi possível validar a chave.');
    } finally {
      setIsConnectingApi(false);
    }
  };

  const handleDisconnectApiKey = () => {
    window.sessionStorage.removeItem('mapscrape_api_key');
    window.sessionStorage.removeItem('mapscrape_session_token');
    window.sessionStorage.removeItem('mapscrape_user');
    window.sessionStorage.removeItem('mapscrape_user_id');
    setAuthUser(null);
    setHasApiKey(false);
    setJobs([]);
    setPlaces([]);
    setTotalPlaces(0);
    setApiKeyInput('');
  };

  const handleAuthenticated = (token: string, user: { id: string; email: string; name: string; role: 'admin' | 'user' }) => {
    window.sessionStorage.removeItem('mapscrape_api_key');
    window.sessionStorage.setItem('mapscrape_session_token', token);
    window.sessionStorage.setItem('mapscrape_user', JSON.stringify(user));
    setAuthUser(user);
    setHasApiKey(true);
    setApiKeyError('');
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Active or most recent job
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [preselectedProject, setPreselectedProject] = useState<string>('');
  const [preselectedCategory, setPreselectedCategory] = useState<string>('');

  // History list
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  // Results state
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [totalPlaces, setTotalPlaces] = useState<number>(0);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('collected_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);

  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load past searches history
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/jobs');
      if (res.ok) {
        const data = await res.json();
        const jobs = data && data.data ? data.data : data;
        setJobs(Array.isArray(jobs) ? jobs : []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  // Load places for table
  const loadPlaces = useCallback(async (jobIdOverride?: string) => {
    setIsLoadingPlaces(true);
    try {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(pageSize),
        sortBy,
        sortOrder,
      });

      const effectiveJobId = jobIdOverride || selectedJobId;
      if (effectiveJobId) params.append('jobId', effectiveJobId);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await apiFetch(`/api/v1/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const leads = data && data.data ? data.data : data;
        setPlaces(Array.isArray(leads) ? leads : leads?.places ?? []);
        setTotalPlaces(data && data.pagination ? data.pagination.total : data?.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to load places:', err);
    } finally {
      setIsLoadingPlaces(false);
    }
  }, [currentPage, pageSize, sortBy, sortOrder, selectedJobId, searchQuery, categoryFilter]);

  // Initial load - only load data if user is authenticated
  useEffect(() => {
    if (!hasApiKey) {
      // User not authenticated - show auth screen will be handled by parent
      return;
    }
    loadHistory();
    loadPlaces();
  }, [hasApiKey, loadHistory, loadPlaces]);

  // Poll persistent job state. Serverless instances do not share in-memory SSE clients.
  const subscribeToJobStream = useCallback((jobId: string) => {
    if (progressPollRef.current) clearInterval(progressPollRef.current);

    let consecutiveErrors = 0;
    const pollStatus = async () => {
      try {
        const res = await apiFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.text();
          const message = `HTTP ${res.status}: ${body.slice(0, 160)}`;
          if (res.status === 404 || res.status === 401 || res.status === 403) {
            if (progressPollRef.current) clearInterval(progressPollRef.current);
            progressPollRef.current = null;
            setIsScraping(false);
            setCurrentJob((current) => current ? {
              ...current, status: 'failed',
              status_message: res.status === 404
                ? 'A API não encontrou esta coleta. Atualize o histórico e tente novamente.'
                : 'Sua sessão expirou ou não tem permissão para consultar esta coleta.',
              current_step: 'Consulta interrompida',
            } : current);
            console.error('Consulta de progresso encerrada:', message);
            await loadHistory();
            return;
          }
          throw new Error(message);
        }

        const body = await res.json();
        const updatedJob = (body && body.data ? body.data : body) as ScrapeJob & { isRunning?: boolean };
        consecutiveErrors = 0;
        setCurrentJob(updatedJob);
        setIsScraping(updatedJob.status === 'running');
        await loadHistory();
        await loadPlaces(jobId);

        if (updatedJob.status !== 'running') {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
        }
      } catch (err) {
        consecutiveErrors++;
        console.error('Falha ao consultar progresso da coleta:', err);
        if (consecutiveErrors >= 5) {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
          setIsScraping(false);
          await loadHistory();
        }
      }
    };

    void pollStatus();
    progressPollRef.current = setInterval(() => { void pollStatus(); }, 2000);
  }, [loadHistory, loadPlaces]);

  // Clean up progress polling on unmount
  useEffect(() => {
    return () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, []);

  // Handlers
  const handleStartScrape = async (projectName: string, categoryName: string, segment: string, location: string, limit: number) => {
    try {
      const res = await apiFetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, categoryName, segment, location, limit }),
      });

      const contentType = res.headers.get('content-type') || '';
      const responseText = await res.text();
      let data: { data?: { jobId?: string }; jobId?: string; error?: string; message?: string } | null = null;

      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const detail = data?.error || data?.message ||
          (responseText.trim().startsWith('<')
            ? 'O servidor retornou uma página HTML em vez de JSON. Verifique o roteamento da API na Vercel.'
            : responseText.trim().slice(0, 240));
        alert(`Falha ao iniciar coleta (HTTP ${res.status}): ${detail || res.statusText}`);
        return;
      }

      const jobId = data?.data?.jobId ?? data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        alert(`Resposta inválida do servidor (HTTP ${res.status}). Esperava JSON com jobId; Content-Type: ${contentType || 'ausente'}.`);
        return;
      }

      setPlaces([]);
      setTotalPlaces(0);
      setCurrentPage(1);
      setSelectedPlaceIds(new Set());
      setIsScraping(true);
      setSelectedJobId(jobId);
      subscribeToJobStream(jobId);
      loadHistory();
    } catch (err: any) {
      alert(`Falha na comunicação com o servidor: ${err.message}`);
    }
  };

  const handleStopScrape = async () => {
    if (!currentJob || currentJob.status !== 'running') return;
    try {
      const response = await apiFetch(`/api/v1/jobs/${encodeURIComponent(currentJob.id)}/stop`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        throw new Error(body?.error || `Falha ao solicitar interrupção (HTTP ${response.status}).`);
      }

      // Keep polling until the worker confirms it has actually stopped.
      setCurrentJob((job) => job && job.id === currentJob.id ? {
        ...job,
        status_message: 'Pedido recebido. Encerrando a coleta com segurança...',
        current_step: 'Interrompendo...',
      } : job);
      await loadHistory();
    } catch (err: any) {
      console.error('Stop error:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível interromper a coleta.');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/v1/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedJobId === jobId) {
          setSelectedJobId(undefined);
        }
        if (currentJob?.id === jobId) {
          setCurrentJob(null);
        }
        await loadHistory();
        await loadPlaces();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleToggleSelectPlace = (id: string) => {
    const next = new Set(selectedPlaceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPlaceIds(next);
  };

  const handleToggleSelectAll = (allIds: string[]) => {
    const next = new Set(selectedPlaceIds);
    const allSelected = allIds.every((id) => next.has(id));
    if (allSelected) {
      allIds.forEach((id) => next.delete(id));
    } else {
      allIds.forEach((id) => next.add(id));
    }
    setSelectedPlaceIds(next);
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const tabLabels: Record<ScreenTab, string> = {
    dashboard: 'Visão geral',
    projects: 'Projetos',
    credentials: 'Credenciais de API',
    search: 'Pesquisar',
    results: 'Resultados',
    export: 'Exportar CSV',
    history: 'Histórico',
    logs: 'Auditoria & Logs',
  };

  // If user is not authenticated, show AuthScreen
  if (!hasApiKey) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        totalPlaces={totalPlaces}
        selectedCount={selectedPlaceIds.size}
        isScrapingActive={isScraping}
        currentJob={currentJob}
        onStopScrape={handleStopScrape}
        isAdmin={authUser?.role === 'admin'}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="lg:pl-72 flex-1 flex flex-col min-w-0">
        {/* Minimalist Linear / Stripe Top Bar */}
        <header className="h-16 px-4 sm:px-8 border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Contextual Breadcrumb trail */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-zinc-400">MapScrape</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <span className="font-medium text-zinc-100 text-base">{tabLabels[currentTab]}</span>
            </div>
          </div>

          {/* Top Actions & Quick Indicators */}
          <div className="flex items-center gap-3">
            {isScraping && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>Coleta ativa</span>
              </div>
            )}

            {totalPlaces > 0 && currentTab !== 'results' && (
              <button
                type="button"
                onClick={() => setCurrentTab('results')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-850 text-xs font-medium transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>{totalPlaces} salvos</span>
              </button>
            )}

            {selectedPlaceIds.size > 0 && currentTab !== 'export' && (
              <button
                type="button"
                onClick={() => setCurrentTab('export')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm shadow-emerald-950/40"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Exportar ({selectedPlaceIds.size})</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          {hasApiKey ? (
            <div className="mb-4 flex justify-end">
              <span className="mr-3 text-xs text-zinc-400">{authUser?.name || authUser?.email || 'Sessão de API'}</span><button type="button" onClick={handleDisconnectApiKey} className="text-xs text-zinc-400 hover:text-zinc-100">Sair da conta</button>
            </div>
          ) : (
            <div className="mb-4 flex justify-end">
              <span className="mr-3 text-xs text-zinc-400">Não autenticado</span>
            </div>
          )}
          {currentTab === 'dashboard' && <DashboardScreen totalPlaces={totalPlaces} jobs={jobs} currentJob={currentJob} isScraping={isScraping} onNavigate={setCurrentTab} />}

          {currentTab === 'projects' && (
            <ProjectsScreen
              jobs={jobs}
              apiReady={hasApiKey}
              onNewScrape={(projectName, categoryName) => {
                if (projectName !== undefined) setPreselectedProject(projectName);
                if (categoryName !== undefined) setPreselectedCategory(categoryName);
                setCurrentTab('search');
              }}
              onOpenJob={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentPage(1);
                setCurrentTab('results');
              }}
            />
          )}

          {currentTab === 'credentials' && <CredentialsScreen />}

          {currentTab === 'search' && (
            <SearchScreen
              currentJob={currentJob}
              isScraping={isScraping}
              apiReady={hasApiKey}
              onStartScrape={handleStartScrape}
              onStopScrape={handleStopScrape}
              onGoToResults={() => setCurrentTab('results')}
              initialProjectName={preselectedProject}
              initialCategoryName={preselectedCategory}
              places={places}
              totalPlaces={totalPlaces}
            />
          )}

          {currentTab === 'results' && (
            <ResultsScreen
              places={places}
              totalPlaces={totalPlaces}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
              selectedPlaceIds={selectedPlaceIds}
              onToggleSelectPlace={handleToggleSelectPlace}
              onToggleSelectAll={handleToggleSelectAll}
              onGoToExport={() => setCurrentTab('export')}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              selectedCategory={categoryFilter}
              onCategoryChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              isLoading={isLoadingPlaces}
            />
          )}

          {currentTab === 'export' && (
            <ExportScreen
              places={places}
              totalPlaces={totalPlaces}
              selectedPlaceIds={selectedPlaceIds}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
              searchQuery={searchQuery}
              selectedCategory={categoryFilter}
            />
          )}

          {currentTab === 'history' && (
            <HistoryScreen
              jobs={jobs}
              onViewResults={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('results');
              }}
              onGoToExportWithJob={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('export');
              }}
              onDeleteJob={handleDeleteJob}
            />
          )}

          {currentTab === 'logs' && <LogsScreen />}
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-zinc-850/80 py-5 px-6 text-center text-xs text-zinc-400">
          <p>MapScrape &mdash; Extração direta e transparente de fichas públicas do Google Maps com Puppeteer e SQLite.</p>
        </footer>
      </div>

    </div>
  );
}