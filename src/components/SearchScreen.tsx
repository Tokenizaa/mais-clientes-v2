import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Building2,
  MapPin,
  Sparkles,
  Compass,
} from 'lucide-react';
import { PlaceRecord, ScrapeJob } from '../shared/types';
import { BRAZILIAN_STATES, POPULAR_CATEGORIES } from '../shared/brazilLocations';

// Requisições internas usam a sessão da conta; API keys ficam reservadas a integrações externas.
async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // Preferem a chave de consumidor conectada; caso contrário, usam a sessão da conta.
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}

interface SearchScreenProps {
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  apiReady: boolean;
  onStartScrape: (projectName: string, categoryName: string, segment: string, location: string, limit: number) => Promise<void>;
  onStopScrape: () => Promise<void>;
  onGoToResults: () => void;
  initialProjectName?: string;
  initialCategoryName?: string;
  places: PlaceRecord[];
  totalPlaces: number;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  currentJob,
  isScraping,
  apiReady,
  onStartScrape,
  onStopScrape,
  onGoToResults,
  initialProjectName,
  initialCategoryName,
  places,
  totalPlaces,
}) => {
  const [segment, setSegment] = useState(initialCategoryName || '');
  const [projectName, setProjectName] = useState(initialProjectName || '');
  const [categoryName, setCategoryName] = useState(initialCategoryName || '');
  const [projects, setProjects] = useState<Array<{id:string;name:string}>>([]);
  const [categories, setCategories] = useState<Array<{id:string;name:string;project_id?:string}>>([]);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [locationMode, setLocationMode] = useState<'brazil' | 'custom'>('brazil');

  useEffect(() => {
    if (initialProjectName) setProjectName(initialProjectName);
  }, [initialProjectName]);

  useEffect(() => {
    if (initialCategoryName) {
      setCategoryName(initialCategoryName);
      if (!segment.trim()) setSegment(initialCategoryName);
    }
  }, [initialCategoryName]);

  // Brazil selector state
  const [selectedUf, setSelectedUf] = useState<string>('SP');
  const [selectedCity, setSelectedCity] = useState<string>('São Paulo');
  const [neighborhood, setNeighborhood] = useState<string>('');

  // Custom location state
  const [customLocation, setCustomLocation] = useState<string>('');

  // Active category group tab
  const [activeCategoryGroup, setActiveCategoryGroup] = useState<number>(0);
  const [showCategories, setShowCategories] = useState<boolean>(false);

  const [limit, setLimit] = useState<number>(20);
  const [validationError, setValidationError] = useState('');

  // Ref for smooth scroll to progress panel
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiReady) return;
    let active = true;
    void Promise.all([
      accountFetch('/api/v1/projects', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`Projetos: HTTP ${response.status}`);
        return response.json();
      }),
      accountFetch('/api/v1/categories', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`Categorias: HTTP ${response.status}`);
        return response.json();
      }),
    ]).then(([projectData, categoryData]) => {
      if (!active) return;
      setProjects(
        Array.isArray(projectData.data) ? projectData.data : projectData.projects ?? [],
      );
      // The API's `data` field contains saved categories linked to projects.
      // `categories` is a separate legacy list of extracted Maps categories (strings),
      // so it must not replace the project-linked catalog.
      const rawCategories = Array.isArray(categoryData.data) ? categoryData.data : [];
      setCategories(
        rawCategories
          .filter((category: any) => category && typeof category === 'object' && category.name)
          .map((category: any, i: number) => ({
            id: String(category.id || `cat_${i}`),
            name: String(category.name),
            project_id: String(category.project_id || category.projectId || ''),
          }))
      );
      setCatalogMessage('');
    }).catch((error) => {
      if (active) setCatalogMessage(error instanceof Error ? error.message : 'Falha ao carregar projetos e categorias.');
    });
    return () => { active = false; };
  }, [apiReady]);

  useEffect(() => {
    if (isScraping && currentJob) {
      const frame = window.requestAnimationFrame(() => {
        progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [isScraping, currentJob?.id]);

  // Find current state
  const currentState = BRAZILIAN_STATES.find((s) => s.uf === selectedUf) || BRAZILIAN_STATES[0];

  // When state changes, default to first city
  const handleUfChange = (uf: string) => {
    setSelectedUf(uf);
    const stateObj = BRAZILIAN_STATES.find((s) => s.uf === uf);
    if (stateObj && stateObj.cities.length > 0) {
      setSelectedCity(stateObj.cities[0]);
    }
  };

  // Compute final location string
  const getComputedLocation = (): string => {
    if (locationMode === 'custom') {
      return customLocation.trim();
    }
    const parts: string[] = [];
    if (neighborhood.trim()) {
      parts.push(neighborhood.trim());
    }
    if (selectedCity) {
      parts.push(selectedCity);
    }
    if (selectedUf) {
      parts.push(selectedUf);
    }
    return parts.join(', ');
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    try {
      const response = await accountFetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar o projeto.');
      const project = payload.data || payload.project;
      if (project) {
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
        setProjectName(project.name);
        setCatalogMessage('Projeto criado e selecionado.');
      }
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : 'Falha ao criar projeto.');
    }
  };

  const createCategory = async () => {
    const name = categoryName.trim();
    const project = projects.find((item) => item.name.trim().toLocaleLowerCase('pt-BR') === projectName.trim().toLocaleLowerCase('pt-BR'));
    if (!name || !projectName.trim()) return;
    try {
      const response = await accountFetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: project?.id, projectName: projectName.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a categoria.');
      const category = payload.data || payload.category;
      const resolvedProject = payload.project || project;
      if (resolvedProject) {
        setProjects((current) => [resolvedProject, ...current.filter((item) => item.id !== resolvedProject.id)]);
        setProjectName(resolvedProject.name);
      }
      if (category) {
        setCategories((current) => [category, ...current.filter((item) => item.id !== category.id)]);
        setCategoryName(category.name);
        setSegment(category.name);
        setCatalogMessage('Categoria criada e selecionada.');
      }
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : 'Falha ao criar categoria.');
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment.trim()) {
      setValidationError('Informe ou selecione o segmento ou tipo de estabelecimento.');
      return;
    }
    const finalLoc = getComputedLocation();
    if (!finalLoc) {
      setValidationError('Selecione ou digite a cidade, bairro ou região.');
      return;
    }
    setValidationError('');
    const finalProjectName = projectName.trim() || `${segment.trim()} · ${finalLoc}`;
    const finalCategoryName = categoryName.trim() || segment.trim();
    await onStartScrape(finalProjectName, finalCategoryName, segment.trim(), finalLoc, limit);
  };

  const limitPresets = [10, 20, 50, 100];

  const calculateProgressPercent = (): number => {
    if (!currentJob) return 0;

    // The bar measures work completed, not only successful saves.
    // Duplicates and extraction failures are processed records too; they must
    // not disappear from the progress calculation.
    if (currentJob.status !== 'running') return 100;

    const processed =
      (currentJob.total_collected || 0) +
      (currentJob.total_duplicates || 0) +
      (currentJob.total_errors || 0);
    const totalToProcess = currentJob.limit_requested || 20;

    return Math.min(Math.round((processed / totalToProcess) * 100), 99);
  };

  return (
    <div className="max-w-5xl mx-auto py-2 sm:py-6 space-y-8">
      {/* Intro Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Compass className="w-3.5 h-3.5" />
          <span>Pesquisa Automatizada de Estabelecimentos</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight leading-tight">
          Pesquisar no Google Maps
        </h1>
        <p className="mt-3 text-base sm:text-lg text-zinc-400 max-w-3xl leading-relaxed">
          Defina o projeto, o segmento, a localização e o total máximo de fichas desta pesquisa.
        </p>
      </div>

      {/* Main Search Form Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl shadow-black/40 p-6 sm:p-9 space-y-8 backdrop-blur-sm">
        <form onSubmit={handleStart} className="space-y-8">
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-3">
              <label htmlFor="project-name" className="block text-base sm:text-lg font-semibold text-zinc-100">1. Projeto <span className="text-emerald-400">*</span></label>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2">
                <select
                  aria-label="Selecionar projeto existente"
                  value={projects.some((project) => project.name === projectName) ? projectName : ''}
                  onChange={(e) => { setProjectName(e.target.value); setCategoryName(''); }}
                  disabled={isScraping || projects.length === 0}
                  className="min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="">Selecionar projeto existente</option>
                  {projects.map((project) => <option key={project.id} value={project.name}>{project.name}</option>)}
                </select>
                <input id="project-name" value={projectName} onChange={(e) => { setProjectName(e.target.value); setCategoryName(''); }} maxLength={120} placeholder="Ou digite um novo projeto" disabled={isScraping} className="min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50" />
                <button type="button" onClick={() => void createProject()} disabled={isScraping || !projectName.trim()} className="rounded-xl border border-emerald-500/40 px-3 py-3 text-xs sm:text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">Criar projeto</button>
              </div>
              <p className="text-xs text-zinc-500">Projetos existentes são reutilizados; você também pode cadastrar um novo.</p>
            </div>

            <div className="min-w-0 space-y-3">
              <label htmlFor="category-name" className="block text-base sm:text-lg font-semibold text-zinc-100">2. Categoria da pesquisa <span className="text-emerald-400">*</span></label>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2">
                <select
                  aria-label="Selecionar categoria do projeto"
                  value={categories.some((category) => category.project_id === projects.find((project) => project.name.trim().toLocaleLowerCase('pt-BR') === projectName.trim().toLocaleLowerCase('pt-BR'))?.id && category.name === categoryName) ? categoryName : ''}
                  onChange={(e) => { setCategoryName(e.target.value); if (e.target.value) setSegment(e.target.value); }}
                  disabled={isScraping || !projects.some((project) => project.name.trim().toLocaleLowerCase('pt-BR') === projectName.trim().toLocaleLowerCase('pt-BR'))}
                  className="min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="">Selecionar categoria existente</option>
                  {categories.filter((category) => category.project_id === projects.find((project) => project.name.trim().toLocaleLowerCase('pt-BR') === projectName.trim().toLocaleLowerCase('pt-BR'))?.id).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
                <input id="category-name" value={categoryName} onChange={(e) => { setCategoryName(e.target.value); if (!segment.trim()) setSegment(e.target.value); }} maxLength={120} placeholder="Ou digite uma nova categoria" disabled={isScraping || !projectName.trim()} className="min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50" />
                <button type="button" onClick={() => void createCategory()} disabled={isScraping || !categoryName.trim() || !projectName.trim()} className="rounded-xl border border-emerald-500/40 px-3 py-3 text-xs sm:text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">Criar categoria</button>
              </div>
              <p className="text-xs text-zinc-500">A categoria é vinculada ao projeto selecionado.</p>
              {catalogMessage && <p role="status" aria-live="polite" className="text-sm text-amber-300">{catalogMessage}</p>}
            </div>
          </div>

          {/* Seção 1: Segmento do Estabelecimento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="segment" className="block text-base sm:text-lg font-semibold text-zinc-100">
                3. Termo / segmento a pesquisar <span className="text-emerald-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCategories(!showCategories)}
                className="text-xs sm:text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{showCategories ? 'Ocultar sugestões' : 'Ver sugestões populares'}</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                <Building2 className="w-5 h-5" />
              </div>
              <input
                id="segment"
                type="text"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                disabled={isScraping}
                placeholder="Ex: Clínicas Odontológicas, Hamburguerias, Pet Shops, Padarias..."
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-base sm:text-lg font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-50"
              />
            </div>

            {/* Popular Categories Visual Selector */}
            {showCategories && (
              <div className="pt-2 bg-zinc-950/60 border border-zinc-800/90 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sugestões Rápidas de Categorias Comerciais</span>
                </div>

                {/* Category Group Tabs */}
                <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2.5">
                  {POPULAR_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.group}
                      type="button"
                      onClick={() => setActiveCategoryGroup(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        activeCategoryGroup === idx
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                          : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                      }`}
                    >
                      {cat.group}
                    </button>
                  ))}
                </div>

                {/* Category Chips in Selected Group */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {POPULAR_CATEGORIES[activeCategoryGroup]?.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => { setCategoryName(item); setSegment(item); }}
                      disabled={isScraping}
                      className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all cursor-pointer ${
                        segment === item
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Seção 2: Localização */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-base sm:text-lg font-semibold text-zinc-100">
                4. Localização <span className="text-emerald-400">*</span>
              </label>

              {/* Mode Switcher: Brazil Selector vs Custom */}
              <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setLocationMode('brazil')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    locationMode === 'brazil'
                      ? 'bg-zinc-850 text-zinc-100 shadow-xs border border-zinc-750'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Brasil (Estado & Cidade)
                </button>
                <button
                  type="button"
                  onClick={() => setLocationMode('custom')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    locationMode === 'custom'
                      ? 'bg-zinc-850 text-zinc-100 shadow-xs border border-zinc-750'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Digitação Livre
                </button>
              </div>
            </div>

            {locationMode === 'brazil' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Estado (UF) */}
                <div>
                  <label htmlFor="state-select" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Estado (UF)
                  </label>
                  <select
                    id="state-select"
                    value={selectedUf}
                    onChange={(e) => handleUfChange(e.target.value)}
                    disabled={isScraping}
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  >
                    {BRAZILIAN_STATES.map((st) => (
                      <option key={st.uf} value={st.uf} className="bg-zinc-900 text-zinc-100">
                        {st.name} ({st.uf})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cidade */}
                <div>
                  <label htmlFor="city-select" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Cidade
                  </label>
                  <input
                    id="city-select"
                    list="city-options"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={isScraping}
                    placeholder="Digite ou selecione a cidade"
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                  <datalist id="city-options">
                    {currentState.cities.map((city) => <option key={city} value={city} />)}
                  </datalist>
                </div>

                {/* Bairro ou Região (Opcional) */}
                <div>
                  <label htmlFor="neighborhood-input" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Bairro ou Região <span className="text-zinc-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    id="neighborhood-input"
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    disabled={isScraping}
                    placeholder="Ex: Pinheiros, Centro, Batel..."
                    className="w-full py-3.5 px-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-sm sm:text-base font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    disabled={isScraping}
                    placeholder="Ex: Pinheiros, São Paulo - SP ou Copacabana, Rio de Janeiro..."
                    className="w-full pl-12 pr-4 py-3.5 bg-zinc-950 border border-zinc-750 rounded-xl text-zinc-100 text-base sm:text-lg font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Visual Location Preview */}
            <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Localização resultante da pesquisa:{' '}
                <strong className="text-zinc-200 font-semibold">{getComputedLocation() || '(Aguardando preenchimento)'}</strong>
              </span>
            </div>
          </div>

          {/* Etapa 5: Limite total da pesquisa */}
          <div className="space-y-3">
            <div>
              <label className="block text-base sm:text-lg font-semibold text-zinc-100">
                5. Quantidade máxima de fichas
              </label>
              <p className="mt-1 text-sm text-zinc-500">
                Esse limite inclui fichas novas e estabelecimentos que já estão cadastrados na base.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {limitPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLimit(preset)}
                  disabled={isScraping}
                  aria-pressed={limit === preset}
                  className={`px-3 py-3.5 text-sm sm:text-base font-semibold rounded-xl border transition-all cursor-pointer ${
                    limit === preset
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
                  }`}
                >
                  {preset} fichas
                </button>
              ))}
            </div>
          </div>

          {validationError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm font-medium text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="pt-4 border-t border-zinc-800">
            {!isScraping ? (
              <button
                type="submit"
                className="w-full py-4 sm:py-5 px-8 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg sm:text-xl rounded-2xl shadow-lg shadow-emerald-950/50 hover:shadow-emerald-900/60 transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>Iniciar Coleta no Google Maps</span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="flex-1 py-4 sm:py-5 px-6 bg-zinc-950 border border-zinc-800 text-zinc-300 font-semibold text-base sm:text-lg rounded-2xl flex items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>Coleta em andamento pelo Puppeteer...</span>
                </div>
                <button
                  type="button"
                  onClick={onStopScrape}
                  className="py-4 sm:py-5 px-8 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-base sm:text-lg rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Square className="w-5 h-5 fill-current" />
                  <span>Interromper</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Real-time Progress & Metrics Panel with Large Numbers */}
      {currentJob && (
        <div ref={progressRef} className="scroll-mt-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl shadow-black/40 p-6 sm:p-9 space-y-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-zinc-100">Progresso da Coleta</h2>
              <span
                className={`text-xs sm:text-sm px-3 py-1 rounded-full font-bold uppercase tracking-wide border ${
                  currentJob.status === 'running'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                    : currentJob.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : currentJob.status === 'partial'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : currentJob.status === 'stopped'
                    ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                }`}
              >
                {currentJob.status === 'running' && 'Em andamento'}
                {currentJob.status === 'completed' && 'Concluída'}
                {currentJob.status === 'partial' && 'Parcial'}
                {currentJob.status === 'stopped' && 'Interrompida'}
                {currentJob.status === 'failed' && 'Falha'}
              </span>
            </div>

            {currentJob.total_collected > 0 && (
              <button
                type="button"
                onClick={onGoToResults}
                className="text-sm font-semibold text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 transition-all cursor-pointer"
              >
                <span>Ver {currentJob.total_collected} novos salvos</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>

          {/* Progress Bar & Percentage */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1">Etapa atual</p>
                <p className="truncate text-sm sm:text-base text-zinc-100 font-medium">
                  {currentJob.current_step || 'Aguardando inicialização do navegador...'}
                </p>
              </div>
              <span className="font-mono text-2xl font-bold text-emerald-400 shrink-0 tabular-nums">
                {calculateProgressPercent()}<span className="text-sm text-zinc-500">%</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Progresso da coleta"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={calculateProgressPercent()}
              className="relative w-full h-4 rounded-full overflow-hidden border border-zinc-800 bg-zinc-950 shadow-inner"
            >
              <div
                className={`relative h-full rounded-full transition-[width] duration-700 ease-out ${
                  currentJob.status === 'failed'
                    ? 'bg-gradient-to-r from-rose-700 to-rose-400'
                    : currentJob.status === 'partial'
                    ? 'bg-gradient-to-r from-amber-700 to-amber-400'
                    : currentJob.status === 'stopped'
                    ? 'bg-gradient-to-r from-zinc-700 to-zinc-500'
                    : 'bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-300'
                }`}
                style={{ width: `${calculateProgressPercent()}%` }}
              >
                {currentJob.status === 'running' && (
                  <span className="absolute inset-0 overflow-hidden rounded-full">
                    <span className="absolute inset-y-0 w-1/3 -translate-x-full animate-[progress-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-zinc-500">
              <span>{currentJob.total_collected.toLocaleString('pt-BR')} novos salvos</span>
              <span>Limite total: {(currentJob.limit_requested || 20).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          {/* The 4 Compulsory Counters with Large Readable Fonts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Encontrados */}
            <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider">
                Encontrados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-zinc-100 mt-2 font-mono tabular-nums">
                {currentJob.total_found}
              </span>
            </div>

            {/* Coletados */}
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Coletados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-emerald-300 mt-2 font-mono tabular-nums">
                {currentJob.total_collected}
              </span>
            </div>

            {/* Duplicados */}
            <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider">
                Duplicados
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-zinc-300 mt-2 font-mono tabular-nums">
                {currentJob.total_duplicates}
              </span>
            </div>

            {/* Erros */}
            <div className="p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center">
              <span className="block text-xs sm:text-sm font-bold text-rose-400 uppercase tracking-wider">
                Erros
              </span>
              <span className="block text-3xl sm:text-4xl font-extrabold text-rose-300 mt-2 font-mono tabular-nums">
                {currentJob.total_errors}
              </span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Os números representam somente esta execução. “Novos salvos” são inserções realizadas agora; “Já cadastrados” são fichas que já existiam na base e contam dentro do limite; falhas são tentativas que não puderam ser concluídas.
          </p>

          {/* Status Message */}
          {currentJob.status_message && (
            <div className="text-sm text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
              {currentJob.status === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : currentJob.status === 'failed' || currentJob.status === 'partial' ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 mt-2 ml-1" />
              )}
              <span className="leading-relaxed font-medium">{currentJob.status_message}</span>
            </div>
          )}
        </div>
      )}

      {currentJob && (
        <section className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-zinc-100">
                {currentJob.status === 'running' ? 'Estabelecimentos coletados até agora' : 'Resultado desta pesquisa'}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {totalPlaces.toLocaleString('pt-BR')} estabelecimento(s) salvos nesta coleta
                {currentJob.status === 'running' ? ' · atualizando automaticamente' : ''}
              </p>
            </div>
            {places.length > 0 && (
              <button type="button" onClick={onGoToResults} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15">
                Ver base completa <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {places.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-400">
              {currentJob.status === 'running'
                ? 'Aguardando a primeira ficha ser salva. Os resultados aparecerão aqui durante a coleta.'
                : currentJob.status === 'completed' || currentJob.status === 'partial'
                  ? 'A coleta terminou, mas nenhum estabelecimento foi retornado para exibição.'
                  : 'Esta coleta não gerou resultados.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {places.map((place) => {
                const photoUrl = place.logo_url?.startsWith('http')
                  ? place.logo_url
                  : place.photos?.split(' | ').find((url) => url.startsWith('http'));
                return (
                  <article key={place.id} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-lg shadow-black/20">
                    {photoUrl ? (
                      <div className="h-40 w-full overflow-hidden border-b border-zinc-800 bg-zinc-950">
                        <img src={photoUrl} alt={place.name || 'Estabelecimento'} referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    ) : null}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-emerald-400">{place.category || 'Categoria não informada'}</p>
                          <h3 className="mt-1 line-clamp-2 font-bold text-zinc-100">{place.name || 'Estabelecimento sem nome'}</h3>
                        </div>
                        {place.rating && <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm font-bold text-amber-300">★ {place.rating}</span>}
                      </div>
                      <p className="line-clamp-2 text-sm text-zinc-400">{place.address || 'Endereço não informado'}</p>
                      <div className="space-y-1 text-xs text-zinc-300">
                        <p>{place.phone || 'Telefone não informado'}</p>
                        {place.website ? <a href={place.website} target="_blank" rel="noopener noreferrer" className="block truncate text-emerald-400 hover:underline">{place.website.replace(/^https?:\/\//, '')}</a> : <p className="text-zinc-500">Site não informado</p>}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
                        <span className={`truncate rounded-md border px-2 py-1 text-xs ${/aberto|operacional/i.test(place.business_status || '') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>{place.business_status || 'Status não informado'}</span>
                        {place.maps_url && <a href={place.maps_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300">Abrir no Maps ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
              {totalPlaces > places.length && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/50 p-6 text-center text-sm text-zinc-400">
                  <span>Exibindo {places.length} de {totalPlaces} fichas carregadas.</span>
                  <button type="button" onClick={onGoToResults} className="mt-2 font-semibold text-emerald-400 hover:text-emerald-300">Abrir todos os resultados</button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
