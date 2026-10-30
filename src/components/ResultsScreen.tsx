import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  Phone,
  Globe,
  Star,
  Clock3,
  X,
  Building2,
  Copy,
  Check,
  LayoutGrid,
  Table as TableIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  Share2,
  Info,
  DollarSign,
  Compass,
  PlayCircle,
} from 'lucide-react';
import { PlaceRecord, ScrapeJob } from '../shared/types';

interface ResultsScreenProps {
  places: PlaceRecord[];
  totalPlaces: number;
  jobs: ScrapeJob[];
  selectedJobId: string | undefined;
  onSelectJobId: (id: string | undefined) => void;
  selectedPlaceIds: Set<string>;
  onToggleSelectPlace: (id: string) => void;
  onToggleSelectAll: (allIds: string[]) => void;
  onGoToExport: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading: boolean;
}

const detailFields: { key: keyof PlaceRecord; label: string }[] = [
  { key: 'booking_url', label: 'URL de Agendamento' },
  { key: 'category', label: 'Categoria' },
  { key: 'address', label: 'Endereço completo' },
  { key: 'phone', label: 'Telefone comercial' },
  { key: 'website', label: 'Website oficial' },
  { key: 'rating', label: 'Nota / Avaliação' },
  { key: 'review_count', label: 'Total de avaliações' },
  { key: 'price_range', label: 'Faixa de preço' },
  { key: 'business_status', label: 'Status de funcionamento' },
  { key: 'opening_hours', label: 'Horários de funcionamento' },
  { key: 'description', label: 'Descrição' },
  { key: 'services_attributes', label: 'Serviços e atributos' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'photos', label: 'Fotos (URLs)' },
  { key: 'videos', label: 'Vídeos (URLs)' },
  { key: 'logo_url', label: 'Logo / Imagem de perfil' },
  { key: 'social_links', label: 'Redes sociais' },
  { key: 'reviews', label: 'Avaliações e comentários' },
  { key: 'review_topics', label: 'Categorias dos comentários' },
  { key: 'additional_attributes', label: 'Atributos adicionais da ficha' },
  { key: 'media_items', label: 'Galeria de mídia' },
  { key: 'plus_code', label: 'Plus Code' },
  { key: 'attributes', label: 'Atributos do estabelecimento' },
  { key: 'accessibility_attributes', label: 'Acessibilidade' },
  { key: 'next_opening_text', label: 'Próxima abertura (texto)' },
  { key: 'next_open_day', label: 'Próximo dia de abertura' },
  { key: 'next_open_time', label: 'Próximo horário de abertura' },
  { key: 'visible_photos_count', label: 'Total de fotos informado' },
  { key: 'postal_code', label: 'CEP / código postal' },
  { key: 'country', label: 'País' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado / região' },
  { key: 'source_place_id', label: 'ID da ficha na fonte' },
  { key: 'source_url', label: 'URL original da fonte' },
  { key: 'popular_times', label: 'Horários de movimento' },
  { key: 'rating_distribution', label: 'Distribuição de avaliações' },
  { key: 'review_highlights', label: 'Destaques de avaliações' },
  { key: 'field_status', label: 'Status de captura por campo' },
  { key: 'collected_at', label: 'Data e hora da coleta' },
];

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  places,
  totalPlaces,
  jobs,
  selectedJobId,
  onSelectJobId,
  selectedPlaceIds,
  onToggleSelectPlace,
  onToggleSelectAll,
  onGoToExport,
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onCategoryChange,
  sortBy,
  sortOrder,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedPlace, setSelectedPlace] = useState<PlaceRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDetails, setCopiedDetails] = useState(false);

  const [coverage, setCoverage] = useState<{
    totalRecords: number;
    totalFields: number;
    averageCoverage: number;
    fields: { key: string; label: string; populated: number; missing: number; percentage: number }[];
  } | null>(null);
  const [coverageError, setCoverageError] = useState('');
  const [showCoverageSection, setShowCoverageSection] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token =
      window.sessionStorage.getItem('mapscrape_api_key') ||
      window.sessionStorage.getItem('mapscrape_session_token');
    fetch('/api/v1/categories', {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => { if (!response.ok) throw new Error('Falha ao carregar categorias'); return response.json(); })
      .then((data) => {
        if (!cancelled) {
          const list: string[] = Array.isArray(data.placeCategories)
            ? data.placeCategories.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim()))
            : [];
          setCategories(Array.from(new Set(list)));
        }
      })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCoverage = async () => {
      try {
        const params = new URLSearchParams();
        const token =
          window.sessionStorage.getItem('mapscrape_api_key') ||
          window.sessionStorage.getItem('mapscrape_session_token');
        const response = await fetch(`/api/v1/field-coverage?${params.toString()}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Não foi possível calcular a cobertura dos campos.');
        const data = await response.json();
        if (!cancelled) {
          setCoverage(data);
          setCoverageError('');
        }
      } catch (error: any) {
        if (!cancelled) setCoverageError(error?.message || 'Falha ao carregar a cobertura dos campos.');
      }
    };
    void loadCoverage();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, totalPlaces, places.length]);

  const currentIds = useMemo(() => places.map((place) => place.id), [places]);
  const isAllSelected = currentIds.length > 0 && currentIds.every((id) => selectedPlaceIds.has(id));
  const totalPages = Math.max(1, Math.ceil(totalPlaces / pageSize));

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const copyFullPlaceDetails = async () => {
    if (!selectedPlace) return;
    try {
      const formatted = Object.entries(selectedPlace)
        .map(([key, value]) => `${key}: ${value == null || value === '' ? '—' : String(value)}`)
        .join('\n');
      await navigator.clipboard.writeText(formatted);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch {}
  };

  const missing = (val?: string) => (val && val.trim() ? val : <span className="text-zinc-600 italic">—</span>);

  const getFirstPhotoUrl = (place: PlaceRecord): string | null => {
    if (place.logo_url && place.logo_url.startsWith('http')) return place.logo_url;
    if (place.photos && place.photos.trim()) {
      const urls = place.photos.split(' | ');
      if (urls.length > 0 && urls[0].startsWith('http')) return urls[0];
    }
    return null;
  };

  const getVideoUrls = (place: PlaceRecord): string[] => {
    if (!place.videos || !place.videos.trim()) return [];
    return place.videos.split(' | ').filter((u) => u.startsWith('http'));
  };

  const parseJsonField = <T,>(value: string | undefined, fallback: T): T => {
    if (!value?.trim()) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  };

  const getVideoEmbedUrl = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      if (parsed.hostname === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
    } catch {}
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto py-2 sm:py-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-850 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Compass className="w-3.5 h-3.5" />
            <span>Base Local de Leads</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-100 tracking-tight">
            Resultados Coletados
          </h1>
          <p className="mt-1 text-base sm:text-lg text-zinc-400">
            {totalPlaces.toLocaleString('pt-BR')} estabelecimentos cadastrados no SQLite com extração direta.
          </p>
        </div>

        {/* Global Export Shortcut Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGoToExport}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm sm:text-base shadow-lg shadow-emerald-950/40 hover:shadow-emerald-900/50 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            <FileDown className="w-5 h-5" />
            <span>
              {selectedPlaceIds.size > 0
                ? `Exportar Selecionados (${selectedPlaceIds.size})`
                : 'Exportar Base Completa'}
            </span>
          </button>
        </div>
      </div>

      {/* Field Coverage Strip */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 backdrop-blur-sm shadow-xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-200">Qualidade e Cobertura de Campos</span>
                {coverage && (
                  <span className="rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold font-mono">
                    {coverage.averageCoverage}% preenchidos
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Calculada a partir dos dados persistidos no banco de dados SQLite
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCoverageSection(!showCoverageSection)}
            className="text-xs sm:text-sm font-semibold text-zinc-300 hover:text-emerald-400 underline underline-offset-4 cursor-pointer transition-colors"
          >
            {showCoverageSection ? 'Ocultar detalhes de cobertura' : 'Ver cobertura por campo (18 campos)'}
          </button>
        </div>

        {showCoverageSection && coverage && coverage.totalRecords > 0 && (
          <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            {coverage.fields.map((field) => (
              <div key={field.key} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-zinc-300">{field.label}</span>
                  <span className="shrink-0 text-xs font-mono font-medium text-zinc-400 tabular-nums">
                    {field.populated}/{coverage.totalRecords} ({field.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${field.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-5 shadow-xl shadow-black/20 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              onPageChange(1);
            }}
            placeholder="Buscar por nome, categoria, bairro, endereço, telefone ou site..."
            className="w-full rounded-xl border border-zinc-750 bg-zinc-950 py-3 pl-11 pr-4 text-sm sm:text-base text-zinc-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium placeholder:text-zinc-500"
          />
        </div>

        {/* Search Job Selector */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-zinc-400" />
          <select
            value={selectedJobId || ''}
            onChange={(e) => {
              onSelectJobId(e.target.value || undefined);
              onPageChange(1);
            }}
            className="rounded-xl border border-zinc-750 bg-zinc-950 px-3.5 py-3 text-sm font-medium text-zinc-200 outline-none focus:border-emerald-500"
          >
            <option value="" className="bg-zinc-900 text-zinc-100">Todas as coletas ({jobs.length})</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id} className="bg-zinc-900 text-zinc-100">
                {job.segment} · {job.location} ({job.total_collected})
              </option>
            ))}
          </select>
        </div>

        {/* Persisted category filter */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
          <select
            aria-label="Filtrar por categoria"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-3.5 py-3 text-sm font-medium text-zinc-200 outline-none focus:border-emerald-500"
          >
            <option value="">Todas as categorias ({categories.length})</option>
            {categories.map((category, index) => {
              const catName = typeof category === 'string' ? category : (category as any)?.name || `cat-${index}`;
              return (
                <option key={catName} value={catName}>
                  {catName}
                </option>
              );
            })}
          </select>
        </div>

        {/* View Mode Toggle (Cards vs Table) */}
        <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Tabela</span>
          </button>
        </div>
      </div>

      {/* Sorting and Select All Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400 px-1">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-zinc-300">Ordenar por:</span>
          <button
            type="button"
            onClick={() => onSortChange('name')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'name'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Nome {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => onSortChange('rating')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'rating'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Nota {sortBy === 'rating' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => onSortChange('collected_at')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'collected_at'
                ? 'bg-zinc-800 text-zinc-100 border-zinc-650'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Data {sortBy === 'collected_at' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-medium text-zinc-300 hover:text-zinc-100">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => onToggleSelectAll(currentIds)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
            />
            <span>Selecionar todos da página ({currentIds.length})</span>
          </label>

          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs sm:text-sm text-zinc-300 outline-none"
          >
            <option value={10}>10 / pág</option>
            <option value={25}>25 / pág</option>
            <option value={50}>50 / pág</option>
            <option value={100}>100 / pág</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-base font-medium">Carregando estabelecimentos...</p>
        </div>
      ) : places.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50">
          <Building2 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-zinc-200">Nenhum estabelecimento encontrado</h3>
          <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
            {searchQuery
              ? 'Nenhum resultado corresponde à sua busca. Tente palavras mais curtas.'
              : 'Execute uma nova coleta na tela "1. Pesquisar" para extrair fichas do Google Maps.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        /* ================= CARDS VIEW (Linear/Stripe Minimalist Dark Mode) ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {places.map((place) => {
            const isSelected = selectedPlaceIds.has(place.id);
            const photoUrl = getFirstPhotoUrl(place);
            const videos = getVideoUrls(place);

            return (
              <article
                key={place.id}
                className={`flex flex-col justify-between rounded-2xl border transition-all duration-150 overflow-hidden bg-zinc-900/90 shadow-lg shadow-black/30 ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Card Header Media */}
                {photoUrl ? (
                  <div className="relative h-44 w-full bg-zinc-950 overflow-hidden border-b border-zinc-800/80">
                    <img
                      src={photoUrl}
                      alt={place.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />

                    {/* Top Row in Photo */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-950/80 backdrop-blur-xs border border-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${place.name}`}
                          checked={isSelected}
                          onChange={() => onToggleSelectPlace(place.id)}
                          className="h-4 w-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center gap-1.5">
                        {videos.length > 0 && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-semibold backdrop-blur-xs">
                            <VideoIcon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Vídeo ({videos.length})</span>
                          </span>
                        )}
                        {place.category && (
                          <span className="px-2.5 py-1 rounded-md bg-zinc-950/80 text-zinc-300 border border-zinc-800 text-xs font-medium backdrop-blur-xs">
                            {place.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 pb-0 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${place.name}`}
                        checked={isSelected}
                        onChange={() => onToggleSelectPlace(place.id)}
                        className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                      />
                    </label>

                    <div className="flex items-center gap-1.5">
                      {videos.length > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-xs font-medium">
                          <VideoIcon className="w-3 h-3 text-indigo-400" />
                          <span>Vídeo ({videos.length})</span>
                        </span>
                      )}
                      {place.category && (
                        <span className="px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 text-xs font-medium">
                          {place.category}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    {/* Place Title */}
                    <button
                      type="button"
                      onClick={() => setSelectedPlace(place)}
                      className="text-left group cursor-pointer w-full"
                    >
                      <h2 className="text-xl font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                        {place.name || 'Estabelecimento sem nome'}
                      </h2>
                    </button>

                    {/* Rating & Reviews */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-bold text-sm text-zinc-100">{place.rating || '—'}</span>
                      </div>
                      <span className="text-xs sm:text-sm text-zinc-400 font-medium">
                        {place.review_count ? `${place.review_count} avaliações` : 'Sem avaliações'}
                      </span>
                      {place.price_range && (
                        <span className="ml-auto text-xs font-semibold text-zinc-300 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-750">
                          {place.price_range}
                        </span>
                      )}
                    </div>

                    {/* Contact & Address Lines */}
                    <div className="mt-4 space-y-2.5 text-xs sm:text-sm text-zinc-300">
                      {/* Endereço */}
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed font-medium">
                          {missing(place.address)}
                        </span>
                      </div>

                      {/* Telefone */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Phone className="h-4 w-4 shrink-0 text-zinc-400" />
                          <span className="font-semibold text-zinc-100 font-mono">
                            {missing(place.phone)}
                          </span>
                        </div>
                        {place.phone && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(place.phone, `phone_${place.id}`)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer transition-colors"
                            title="Copiar telefone"
                          >
                            {copiedId === `phone_${place.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Site */}
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline truncate block font-medium"
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="text-zinc-500 italic">Site não informado</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Status & Links */}
                  <div className="pt-3 border-t border-zinc-800 flex items-center justify-between gap-3">
                    <span
                      className={`truncate rounded-md px-2.5 py-1 text-xs font-semibold border ${
                        /aberto/i.test(place.business_status)
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : /fechado/i.test(place.business_status)
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {missing(place.business_status)}
                    </span>

                    <div className="flex items-center gap-2">
                      {place.maps_url && (
                        <a
                          href={place.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir ficha do Google Maps"
                          title="Abrir ficha do Google Maps"
                          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {place.booking_url && (
                        <a
                          href={place.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 text-emerald-400 hover:bg-emerald-950/60 hover:text-emerald-300 border border-emerald-500/30 transition-colors"
                        >
                          <span>Agendar</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPlace(place)}
                        className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold transition-colors cursor-pointer border border-zinc-700"
                      >
                        Ver detalhes
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => onToggleSelectAll(currentIds)}
                      className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 font-bold">Estabelecimento</th>
                  <th className="py-3.5 px-4 font-bold">Categoria</th>
                  <th className="py-3.5 px-4 text-center font-bold">Nota / Avaliações</th>
                  <th className="py-3.5 px-4 font-bold">Endereço</th>
                  <th className="py-3.5 px-4 font-bold">Telefone</th>
                  <th className="py-3.5 px-4 font-bold">Site</th>
                  <th className="py-3.5 px-4 font-bold">Mídia</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 text-center font-bold">Ficha Maps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-sm text-zinc-300">
                {places.map((place) => {
                  const isSelected = selectedPlaceIds.has(place.id);
                  const videos = getVideoUrls(place);

                  return (
                    <tr
                      key={place.id}
                      className={`hover:bg-zinc-850/60 transition-colors ${
                        isSelected ? 'bg-zinc-850/40' : ''
                      }`}
                    >
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectPlace(place.id)}
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4 font-semibold text-zinc-100 max-w-[220px]">
                        <button
                          type="button"
                          onClick={() => setSelectedPlace(place)}
                          className="hover:text-emerald-400 hover:underline text-left"
                        >
                          {place.name}
                        </button>
                      </td>
                      <td className="py-4 px-4 max-w-[150px] truncate text-zinc-400">{missing(place.category)}</td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {place.rating ? (
                          <div className="inline-flex items-center gap-1 font-bold text-zinc-100">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{place.rating}</span>
                            {place.review_count && (
                              <span className="text-zinc-500 font-normal text-xs font-mono">
                                ({place.review_count})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 max-w-[240px] truncate" title={place.address}>
                        {missing(place.address)}
                      </td>
                      <td className="py-4 px-4 font-mono whitespace-nowrap font-medium text-zinc-200">
                        {missing(place.phone)}
                      </td>
                      <td className="py-4 px-4 max-w-[160px] truncate">
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline"
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="text-zinc-600 italic">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {place.photos && (
                            <span className="text-xs text-zinc-400 font-mono" title="Fotos disponíveis">
                              📷
                            </span>
                          )}
                          {videos.length > 0 && (
                            <span className="text-xs text-indigo-400 font-mono" title={`${videos.length} vídeo(s)`}>
                              🎥
                            </span>
                          )}
                          {!place.photos && videos.length === 0 && (
                            <span className="text-zinc-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium border ${
                            /aberto/i.test(place.business_status)
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {missing(place.business_status)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {place.maps_url ? (
                          <a
                            href={place.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-zinc-300 hover:text-white font-medium px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                          >
                            <span>Ficha</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      {totalPlaces > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-6 py-4 text-sm font-medium text-zinc-400 shadow-xl">
          <span>
            Mostrando {Math.min((currentPage - 1) * pageSize + 1, totalPlaces)}–{Math.min(currentPage * pageSize, totalPlaces)} de {totalPlaces.toLocaleString('pt-BR')} estabelecimentos
          </span>
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2 text-zinc-200 font-semibold hover:bg-zinc-850 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="font-mono font-bold text-zinc-100 tabular-nums">
              Página {currentPage} de {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2 text-zinc-200 font-semibold hover:bg-zinc-850 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL DE DETALHES COMPLETO DOS CAMPOS (Dark Minimalist) ================= */}
      {selectedPlace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedPlace(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-detail-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-zinc-900 border border-zinc-750 shadow-2xl text-zinc-100"
          >
            {/* Modal Photo / Header */}
            {getFirstPhotoUrl(selectedPlace) && (
              <div className="relative h-56 w-full bg-zinc-950 overflow-hidden border-b border-zinc-800">
                <img
                  src={getFirstPhotoUrl(selectedPlace)!}
                  alt={selectedPlace.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setSelectedPlace(null)}
                  aria-label="Fechar detalhes"
                  className="absolute top-4 right-4 rounded-full bg-zinc-950/80 border border-zinc-700 text-white p-2 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* Modal Title Bar */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-md px-6 py-5">
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md">
                  Ficha Completa do Estabelecimento
                </span>
                <h2 id="lead-detail-title" className="mt-2 text-2xl font-bold tracking-tight text-zinc-100">
                  {missing(selectedPlace.name)}
                </h2>
                <p className="mt-1 text-sm font-medium text-zinc-400">
                  {missing(selectedPlace.category)}
                </p>
              </div>
              {!getFirstPhotoUrl(selectedPlace) && (
                <button
                  onClick={() => setSelectedPlace(null)}
                  aria-label="Fechar detalhes"
                  className="rounded-xl p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6 space-y-6">
              {/* Highlight Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-800">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Avaliação</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xl font-extrabold text-zinc-100">
                    <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                    <span>{selectedPlace.rating || '—'}</span>
                    <span className="text-xs font-normal text-zinc-500">
                      {selectedPlace.review_count ? `(${selectedPlace.review_count})` : ''}
                    </span>
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-800">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Status</p>
                  <p className="mt-2 text-base font-bold text-zinc-200">
                    {missing(selectedPlace.business_status)}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-800 col-span-2 sm:col-span-1">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Faixa de Preço</p>
                  <p className="mt-2 text-base font-bold text-zinc-200">
                    {missing(selectedPlace.price_range)}
                  </p>
                </div>
              </div>

              {/* All Detail Fields */}
              <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/60">
                {detailFields.map(({ key, label }) => {
                  const value = String(selectedPlace[key] ?? '').trim();
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 p-3.5 sm:px-4 hover:bg-zinc-850/40 transition-colors"
                    >
                      <dt className="text-xs sm:text-sm font-semibold text-zinc-400">{label}</dt>
                      <dd className={`text-sm sm:text-base break-words ${value ? 'text-zinc-200 font-medium' : 'text-zinc-600 italic'}`}>
                        {value ? (
                          key === 'website' ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                            >
                              <span>{value}</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : key === 'photos' && value.includes('http') ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {value.split(' | ').filter((url) => url.startsWith('http')).map((url, uIdx) => (
                                <a key={uIdx} href={url} target="_blank" rel="noopener noreferrer" className="group block aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                                  <img src={url} alt={`Foto do estabelecimento ${uIdx + 1}`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                                </a>
                              ))}
                            </div>
                          ) : key === 'videos' && value.trim() ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {value.split(' | ').map((vUrl, vIdx) => {
                                const embedUrl = getVideoEmbedUrl(vUrl);
                                return embedUrl ? (
                                  <div key={vIdx} className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
                                    <iframe src={embedUrl} title={`Vídeo do estabelecimento ${vIdx + 1}`} className="aspect-video w-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                                  </div>
                                ) : vUrl.startsWith('http') && /\.(mp4|webm|ogg)(?:$|[?#])/i.test(vUrl) ? (
                                  <video key={vIdx} src={vUrl} controls preload="metadata" className="w-full rounded-xl border border-zinc-800 bg-black" />
                                ) : (
                                  <a href={selectedPlace.maps_url} target="_blank" rel="noopener noreferrer" key={vIdx} className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 hover:bg-indigo-500/10">
                                    <PlayCircle className="h-8 w-8 shrink-0 text-indigo-400" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-zinc-200">Reproduzir vídeo na ficha do Maps</p>
                                      <p className="text-xs text-zinc-500 break-words">{vUrl.startsWith('http') ? vUrl : 'O Google Maps não expõe uma URL de vídeo direta; abrir a galeria original.'}</p>
                                    </div>
                                  </a>
                                );
                              })}
                            </div>
                          ) : key === 'logo_url' && value.startsWith('http') ? (
                            <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-2">
                              <img src={value} alt={`Imagem de perfil de ${selectedPlace.name}`} loading="lazy" referrerPolicy="no-referrer" className="max-h-36 max-w-full rounded-lg object-contain" />
                            </a>
                          ) : key === 'reviews' ? (
                            (() => {
                              const reviews = parseJsonField<Array<{id?:string;author?:string;author_avatar_url?:string;author_profile_url?:string;author_metadata?:string;rating?:string;date?:string;text?:string;owner_response?:string;media?:Array<{url:string;alt?:string;type?:string}>}>>(value, []);
                              return reviews.length ? (
                                <div className="space-y-3">
                                  <p className="text-xs text-zinc-500">{reviews.length} comentários capturados na ficha pública</p>
                                  {reviews.map((review, index) => (
                                    <article key={review.id || index} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 space-y-2.5">
                                      <div className="flex items-start gap-3">
                                        {review.author_avatar_url && <img src={review.author_avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                                        <div className="min-w-0 flex-1">
                                          <p className="font-semibold text-zinc-100">{review.author || 'Autor não identificado'}</p>
                                          <p className="text-xs text-zinc-500">{[review.author_metadata, review.date].filter(Boolean).join(' · ') || 'Data ou perfil não informado'}</p>
                                        </div>
                                        {review.rating && <span className="shrink-0 text-sm text-amber-300">{review.rating}</span>}
                                      </div>
                                      {review.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{review.text}</p>}
                                      {review.owner_response && <div className="rounded-lg border-l-2 border-emerald-500 bg-zinc-950 p-3"><p className="text-xs font-semibold text-emerald-300 mb-1">Resposta do proprietário</p><p className="whitespace-pre-wrap text-sm text-zinc-300">{review.owner_response}</p></div>}
                                      {!!review.media?.length && <div className="grid grid-cols-3 gap-2">{review.media.map((item, mediaIndex) => item.type === 'video' ? <a key={mediaIndex} href={selectedPlace.maps_url} target="_blank" rel="noopener noreferrer" className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-zinc-950 text-indigo-300"><PlayCircle className="h-8 w-8" /><span className="px-2 text-center text-xs">Abrir vídeo</span></a> : <a key={mediaIndex} href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt={item.alt || 'Mídia da avaliação'} loading="lazy" className="aspect-square w-full rounded-lg object-cover" referrerPolicy="no-referrer" /></a>)}</div>}
                                      {review.author_profile_url && <a href={review.author_profile_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline">Abrir perfil público do autor</a>}
                                    </article>
                                  ))}
                                </div>
                              ) : <span className="text-zinc-500 italic">Nenhum comentário foi capturado; isso não significa que não existam.</span>;
                            })()
                          ) : key === 'review_topics' ? (
                            (() => {
                              const topics = parseJsonField<Array<{label:string;count?:string}>>(value, []);
                              return topics.length ? <div className="flex flex-wrap gap-2">{topics.map((topic, index) => <span key={index} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">{topic.label}{topic.count ? ` · ${topic.count}` : ''}</span>)}</div> : <span className="text-zinc-500 italic">Nenhuma categoria de comentário capturada.</span>;
                            })()
                          ) : key === 'additional_attributes' ? (
                            (() => {
                              const attributes = parseJsonField<{about_text?:string;sections?:Array<{category:string;items:string[]}>;labeled_attributes?:Array<{label?:string;value?:string}>}>(value, {});
                              return <div className="space-y-3">{!!attributes.sections?.length && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{attributes.sections.map((section,index)=><section key={index} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3"><h4 className="mb-2 text-sm font-semibold text-zinc-100">{section.category}</h4><ul className="space-y-1">{section.items.map((item,itemIndex)=><li key={itemIndex} className="text-sm text-zinc-300">{item}</li>)}</ul></section>)}</div>}{attributes.about_text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{attributes.about_text}</p>}{!!attributes.labeled_attributes?.length && <div className="space-y-2">{attributes.labeled_attributes.map((item,index)=><div key={index} className="rounded-lg bg-zinc-900 px-3 py-2"><p className="text-xs text-zinc-500">{item.label || 'Atributo'}</p><p className="text-sm text-zinc-200">{item.value || '—'}</p></div>)}</div>}</div>;
                            })()
                          ) : key === 'media_items' ? (
                            (() => {
                              const items = parseJsonField<Array<{type:string;url:string;thumbnail_url?:string;title?:string}>>(value, []);
                              return items.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{items.map((item,index)=><div key={index} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">{item.type === 'video' && item.url.startsWith('http') && /\.(mp4|webm|ogg)(?:$|[?#])/i.test(item.url) ? <video src={item.url} controls preload="metadata" poster={item.thumbnail_url || undefined} className="aspect-video w-full bg-black" /> : item.type === 'video' && item.url.startsWith('http') && getVideoEmbedUrl(item.url) ? <iframe src={getVideoEmbedUrl(item.url)!} title={item.title || `Vídeo ${index+1}`} className="aspect-video w-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : item.type === 'video' ? <a href={selectedPlace.maps_url} target="_blank" rel="noopener noreferrer" className="relative flex aspect-video items-center justify-center bg-zinc-950 text-indigo-300"><PlayCircle className="h-12 w-12" /><span className="absolute inset-x-2 bottom-2 rounded bg-black/75 px-2 py-1 text-center text-xs">Abrir vídeo no Google Maps</span></a> : item.url.startsWith('http') ? <a href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt={item.title || `Mídia ${index+1}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full object-cover" /></a> : <div className="p-3 text-sm text-zinc-400">Mídia identificada, sem URL pública direta.</div>}</div>)}</div> : <span className="text-zinc-500 italic">Nenhuma mídia estruturada capturada.</span>;
                            })()
                          ) : (
                            value
                          )
                        ) : (
                          'Não informado na ficha pública'
                        )}
                      </dd>
                    </div>
                  );
                })}

                {/* Google Maps External URL */}
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 p-3.5 sm:px-4 hover:bg-zinc-850/40 transition-colors">
                  <dt className="text-xs sm:text-sm font-semibold text-zinc-400">Ficha Original no Maps</dt>
                  <dd>
                    {selectedPlace.maps_url ? (
                      <a
                        href={selectedPlace.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-emerald-400 hover:underline"
                      >
                        <span>Abrir ficha no Google Maps</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-zinc-600 italic">URL não disponível</span>
                    )}
                  </dd>
                </div>
              </div>
            </div>

            {/* Modal Sticky Footer */}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900 px-6 py-4 rounded-b-3xl">
              <button
                type="button"
                onClick={() => void copyFullPlaceDetails()}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-100 transition-colors cursor-pointer"
              >
                {copiedDetails ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span>Copiado com sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-zinc-400" />
                    <span>Copiar todos os dados</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleSelectPlace(selectedPlace.id)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer border ${
                    selectedPlaceIds.has(selectedPlace.id)
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  }`}
                >
                  {selectedPlaceIds.has(selectedPlace.id) ? 'Desmarcar seleção' : 'Selecionar lead'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlace(null)}
                  className="rounded-xl bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors cursor-pointer border border-zinc-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
