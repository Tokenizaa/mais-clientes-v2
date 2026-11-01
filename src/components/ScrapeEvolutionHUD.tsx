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
  const isPartial = currentJob.status === 'partial';

  // Radius for SVG circular progress
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  // Filter recent places belonging to this job
  const jobPlaces = recentPlaces.filter((p) => p.job_id === currentJob.id);
  const latestPlaces = jobPlaces.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#091a35] via-[#07152b] to-[#050e20] border border-blue-500/25 shadow-2xl shadow-blue-950/60 p-5 sm:p-7 space-y-6">
      {/* Background ambient glow effects */}
      <div className="absolute top-0 right-1/4 -mt-16 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 -mb-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Top Banner & Status Bar */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-blue-800/55">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg ${
                isRunning
                  ? 'bg-blue-600/20 border-blue-400/40 text-blue-400 shadow-blue-500/20'
                  : isCompleted
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400 shadow-emerald-500/20'
                  : isPartial || isFailed
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300 shadow-rose-500/20'
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
                {isRunning ? 'Radar de Coleta em Tempo Real' : isCompleted ? 'Coleta Finalizada com Sucesso' : isPartial ? 'Coleta Concluída com Falhas' : isFailed ? 'Coleta Não Concluída' : 'Coleta Encerrada'}
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

      {/* Live lead cards take visual priority, matching the Base de Leads card language */}
      {latestPlaces.length > 0 && (
        <div className="relative pt-2 space-y-4">
          <div className="absolute -inset-x-4 -inset-y-3 rounded-3xl bg-cyan-500/[0.035] blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100 font-mono">
                Leads capturados ao vivo
              </span>
            </div>
            <span className="text-xs text-cyan-300/80 font-mono">{jobPlaces.length} registros nesta sessão</span>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {latestPlaces.map((place) => (
              <article key={place.id} className="group relative isolate overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-[#102b50]/95 via-[#091b35]/95 to-[#071326]/95 p-5 shadow-[0_12px_35px_rgba(0,0,0,0.38),0_0_22px_rgba(34,211,238,0.09)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_18px_42px_rgba(0,0,0,0.45),0_0_28px_rgba(34,211,238,0.18)]">
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl transition-all group-hover:bg-cyan-300/20" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="line-clamp-2 text-base font-extrabold leading-snug text-white transition-colors group-hover:text-cyan-100">{place.name || 'Estabelecimento'}</h4>
                    <p className="mt-1.5 truncate text-xs font-semibold text-sky-300">{place.category || currentJob.segment}</p>
                  </div>
                  {place.rating && <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.12)]"><Star className="h-3 w-3 fill-current" />{place.rating}</span>}
                </div>
                <div className="relative mt-4 space-y-2 border-t border-cyan-300/15 pt-3 text-xs">
                  <div className={`flex items-center gap-2 ${place.phone ? 'text-emerald-200' : 'text-rose-300'}`}>
                    <Phone className={`h-3.5 w-3.5 shrink-0 ${place.phone ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <span className="truncate">{place.phone || 'Telefone não disponível'}</span>
                    <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${place.phone ? 'bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.95)]' : 'bg-rose-400 shadow-[0_0_9px_rgba(251,113,133,0.9)]'}`} />
                  </div>
                  <div className={`flex items-center gap-2 ${place.website ? 'text-emerald-200' : 'text-rose-300'}`}>
                    {place.website ? <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
                    <span className="truncate">{place.website ? place.website.replace(/^https?:\/\/(www\.)?/, '') : place.address || currentJob.location}</span>
                    <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${place.website ? 'bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.95)]' : 'bg-rose-400 shadow-[0_0_9px_rgba(251,113,133,0.9)]'}`} />
                  </div>
                </div>
                <div className="relative mt-4 flex items-center justify-between border-t border-cyan-300/10 pt-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300/60">Registro confirmado</span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.12)]">Salvo</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Main Radar Gauge & Dynamic Telemetry Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Circular Radar HUD */}
        <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-center gap-5 p-4 rounded-xl bg-[#081a33]/80 border border-blue-800/45">
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
                className="stroke-sky-400 transition-all duration-700 ease-out"
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
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
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
                className="bg-gradient-to-r from-sky-500 to-cyan-400 h-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Card 2: Duplicados Filtrados */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
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
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Detectados</span>
              <Building2 className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-2xl font-bold text-violet-200 font-mono">
              {currentJob.total_found}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 truncate">
              No feed do mapa
            </div>
          </div>

          {/* Card 4: Erros / Estabilidade */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
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

    </div>
  );
};
