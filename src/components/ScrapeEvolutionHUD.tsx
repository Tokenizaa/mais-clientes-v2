import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Square,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  Star,
  MapPin,
  Globe,
  Radio,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { PlaceRecord, ScrapeJob } from '../shared/types';
import { calculateScrapeProgressPercent } from '../shared/scrape-progress';

interface ScrapeEvolutionHUDProps {
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  onStopScrape: () => Promise<void>;
  onGoToResults: () => void;
  recentPlaces?: PlaceRecord[];
}

export const ScrapeEvolutionHUD: React.FC<ScrapeEvolutionHUDProps> = ({
  currentJob,
  isScraping,
  onStopScrape,
  onGoToResults,
  recentPlaces = [],
}) => {
  if (!currentJob) return null;

  const percent = calculateScrapeProgressPercent(currentJob);
  const isRunning = currentJob.status === 'running' || isScraping;
  const isCompleted = currentJob.status === 'completed';
  const isStopped = currentJob.status === 'stopped';
  const isFailed = currentJob.status === 'failed';

  // Radius for SVG circular progress
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  // Filter recent places belonging to this job
  const jobPlaces = recentPlaces.filter((p) => p.job_id === currentJob.id);
  const latestPlaces = jobPlaces.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172e] via-[#0b1328] to-[#070d1e] border border-blue-500/25 shadow-2xl shadow-blue-950/60 p-5 sm:p-7 space-y-6">
      {/* Background ambient glow effects */}
      <div className="absolute top-0 right-1/4 -mt-16 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 -mb-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Top Banner & Status Bar */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-blue-900/40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg ${
                isRunning
                  ? 'bg-blue-600/20 border-blue-400/40 text-blue-400 shadow-blue-500/20'
                  : isCompleted
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400 shadow-emerald-500/20'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-400 shadow-amber-500/20'
              }`}
            >
              {isRunning ? (
                <Radio className="w-5 h-5 animate-pulse text-blue-400" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            {isRunning && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 font-mono">
                {isRunning ? 'Radar de Coleta em Tempo Real' : isCompleted ? 'Coleta Finalizada com Sucesso' : 'Coleta Encerrada'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700/50 text-blue-200 font-mono">
                ID: {currentJob.id.slice(0, 12)}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>{currentJob.segment}</span>
              <span className="text-blue-400/60 font-light">·</span>
              <span className="text-slate-300 font-normal">{currentJob.location}</span>
            </h2>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {isRunning && (
            <button
              type="button"
              onClick={onStopScrape}
              className="px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-700/40 hover:border-red-500/60 text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current text-red-400" />
              <span>Interromper Coleta</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToResults}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold tracking-wide transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer"
          >
            <span>Ver Base de Leads ({currentJob.total_collected})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Radar Gauge & Dynamic Telemetry Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Circular Radar HUD */}
        <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-center gap-5 p-4 rounded-xl bg-[#0b1429]/80 border border-blue-900/30">
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Rotating radar sweep animation */}
            {isRunning && (
              <div
                className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none opacity-40"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(59, 130, 246, 0.4) 360deg)',
                }}
              />
            )}

            {/* Glowing background ring */}
            <div className="absolute inset-2 rounded-full border border-blue-500/15" />
            <div className="absolute inset-5 rounded-full border border-blue-500/10" />

            {/* SVG Circular Progress */}
            <svg className="w-36 h-36 transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-slate-800/80"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-blue-500 transition-all duration-700 ease-out"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.6))',
                }}
              />
            </svg>

            {/* Center Gauge Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
                {percent}%
              </span>
              <span className="text-[10px] uppercase font-semibold text-blue-300/80 tracking-wider">
                {currentJob.total_collected} de {currentJob.limit_requested}
              </span>
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1.5 flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/80 border border-blue-700/40 text-[11px] font-medium text-blue-300">
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>Chromium DOM Engine</span>
            </div>
            <div className="text-sm font-semibold text-slate-200 truncate">
              {currentJob.current_step || 'Processando busca no Google Maps...'}
            </div>
            <p className="text-xs text-slate-400 line-clamp-2">
              {currentJob.status_message || 'Varrendo coordenadas geográficas e filtrando cadastros existentes.'}
            </p>
          </div>
        </div>

        {/* Right: 4 High-Tech Telemetry Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: Coletados */}
          <div className="p-3.5 rounded-xl bg-[#0b1429]/90 border border-blue-900/40 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Inéditos</span>
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono flex items-baseline gap-1">
              <span>{currentJob.total_collected}</span>
              <span className="text-xs font-normal text-slate-400">/ {currentJob.limit_requested}</span>
            </div>
            <div className="mt-2 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Card 2: Duplicados Filtrados */}
          <div className="p-3.5 rounded-xl bg-[#0b1429]/90 border border-blue-900/40 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Duplicados</span>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-300 font-mono">
              {currentJob.total_duplicates}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 truncate">
              Protegidos no banco
            </div>
          </div>

          {/* Card 3: Varredura de Links */}
          <div className="p-3.5 rounded-xl bg-[#0b1429]/90 border border-blue-900/40 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Detectados</span>
              <Building2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-indigo-200 font-mono">
              {currentJob.total_found}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 truncate">
              No feed do mapa
            </div>
          </div>

          {/* Card 4: Erros / Estabilidade */}
          <div className="p-3.5 rounded-xl bg-[#0b1429]/90 border border-blue-900/40 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Falhas</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-slate-200 font-mono">
              {currentJob.total_errors}
            </div>
            <div className="text-[10px] text-emerald-400 mt-2 truncate">
              {currentJob.total_errors === 0 ? 'Taxa 100% limpa' : `${currentJob.total_errors} fichas indisponíveis`}
            </div>
          </div>
        </div>
      </div>

      {/* Live Stream of Fresh Extracted Places */}
      {latestPlaces.length > 0 && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Fluxo de Fichas Recém-Extraídas em Tempo Real
              </span>
            </div>
            <span className="text-xs text-blue-400">
              {jobPlaces.length} registros nesta sessão
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {latestPlaces.map((place) => (
              <div
                key={place.id}
                className="p-3.5 rounded-xl bg-[#0b1429]/70 hover:bg-[#0f1b38] border border-blue-900/30 hover:border-blue-500/40 transition-all text-left space-y-2 group shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-blue-300 transition-colors line-clamp-1">
                    {place.name || 'Estabelecimento'}
                  </h4>
                  {place.rating && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300 px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 shrink-0">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      {place.rating}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-blue-300/80 truncate">
                  {place.category || currentJob.segment}
                </div>

                <div className="space-y-1 text-[10px] text-slate-400 border-t border-blue-900/30 pt-1.5">
                  {place.phone ? (
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Phone className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate">{place.phone}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Phone className="w-3 h-3 text-slate-600 shrink-0" />
                      <span>Sem telefone público</span>
                    </div>
                  )}

                  {place.website ? (
                    <div className="flex items-center gap-1.5 text-blue-400 truncate">
                      <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="truncate">{place.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 truncate">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{place.address || currentJob.location}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
