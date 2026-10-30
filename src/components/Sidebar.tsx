import React from 'react';
import { Search, Table2, FileDown, History, ClipboardList, MapPin, LayoutDashboard, FolderKanban, KeyRound, BookOpen, ExternalLink, CheckCircle2, AlertCircle, StopCircle, Database } from 'lucide-react';
import { ScrapeJob } from '../shared/types';

export type ScreenTab = 'dashboard' | 'projects' | 'credentials' | 'search' | 'results' | 'export' | 'history' | 'logs';

interface SidebarProps {
  currentTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  totalPlaces: number;
  selectedCount: number;
  isScrapingActive: boolean;
  currentJob: ScrapeJob | null;
  onStopScrape?: () => void;
  isAdmin?: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  totalPlaces,
  selectedCount,
  isScrapingActive,
  currentJob,
  onStopScrape,
  isAdmin = false,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'dashboard' as ScreenTab, label: 'Visão geral', icon: LayoutDashboard },
    { id: 'projects' as ScreenTab, label: 'Projetos', icon: FolderKanban },
    { id: 'credentials' as ScreenTab, label: 'Credenciais de API', icon: KeyRound },
    {
      id: 'search' as ScreenTab,
      label: 'Pesquisar',
      number: '1',
      icon: Search,
      badge: isScrapingActive ? 'Ativo' : undefined,
      badgeVariant: 'emerald',
    },
    {
      id: 'results' as ScreenTab,
      label: 'Resultados',
      number: '2',
      icon: Table2,
      badge: totalPlaces > 0 ? String(totalPlaces) : undefined,
      badgeVariant: 'zinc',
    },
    {
      id: 'export' as ScreenTab,
      label: 'Exportar CSV',
      number: '3',
      icon: FileDown,
      badge: selectedCount > 0 ? `${selectedCount} sel.` : undefined,
      badgeVariant: 'indigo',
    },
    {
      id: 'history' as ScreenTab,
      label: 'Histórico',
      number: '4',
      icon: History,
    },
    {
      id: 'logs' as ScreenTab,
      label: 'Auditoria & Logs',
      icon: ClipboardList,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Fechar menu lateral"
          onClick={onCloseMobile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onCloseMobile();
            }
          }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-zinc-950 border-r border-zinc-800/90 flex flex-col transition-transform duration-200 ease-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-zinc-850/80">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 via-zinc-800 to-zinc-900 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-950/40">
              <MapPin className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-100 text-lg tracking-tight">MapScrape</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-normal">Google Maps Extractor</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Fluxo de Coleta
          </div>

          {navItems.filter((item) => item.id !== 'credentials' || isAdmin).map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-base font-medium transition-all group ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-zinc-400 group-hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-mono tabular-nums ${
                      item.badgeVariant === 'emerald'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                        : item.badgeVariant === 'indigo'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="px-3 pt-6 pb-2 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Desenvolvedores
          </div>
          <a
            href="/docs/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir API e documentação"
            className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-base font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-all group"
            onClick={onCloseMobile}
          >
            <span className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 transition-colors">
                <BookOpen className="w-4 h-4" />
              </span>
              <span>API & Documentação</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
          </a>
        </div>

        {/* Live Scraper Status Widget */}
        {currentJob && (
          <div className="p-4 mx-3 mb-3 bg-zinc-900/80 rounded-xl border border-zinc-800/90 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                {currentJob.status === 'running' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                ) : currentJob.status === 'completed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
                {currentJob.status === 'running'
                  ? 'Coleta em andamento'
                  : currentJob.status === 'completed'
                  ? 'Coleta finalizada'
                  : 'Status da coleta'}
              </span>
              <span className="font-mono text-zinc-400 tabular-nums">
                {currentJob.total_collected}/{currentJob.limit_requested}
              </span>
            </div>

            <div className="text-zinc-400 truncate">
              <span className="text-zinc-300 font-medium">{currentJob.segment}</span> em {currentJob.location}
            </div>

            {currentJob.status === 'running' && onStopScrape && (
              <button
                type="button"
                onClick={onStopScrape}
                className="w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Interromper coleta
              </button>
            )}
          </div>
        )}

        {/* Bottom SQLite Status Bar */}
        <div className="p-4 border-t border-zinc-850/80 bg-zinc-950/60">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Base SQLite</span>
            </div>
            <span className="font-mono text-zinc-200 tabular-nums font-medium">
              {totalPlaces} registros
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400 leading-tight">
            Persistência local direta sem dependência externa
          </p>
        </div>
      </aside>
    </>
  );
};
