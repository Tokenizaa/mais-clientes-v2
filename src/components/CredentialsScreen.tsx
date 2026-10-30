import React, { useState, useEffect } from 'react';
import { KeyRound, RefreshCw, Trash2, Globe, Cpu, CheckCircle2, ShieldCheck, Server, Save, ExternalLink } from 'lucide-react';

import { getScraperSettings, updateScraperSettings, validateBrowserWsEndpoint } from '../utils/api.ts';

type Credential = { id: string; consumer_name: string; consumer_project: string; status: string };
type Issued = { credentialId: string; apiKey: string; consumerName: string; consumerProject: string };

export const CredentialsScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [items, setItems] = useState<Credential[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Cloudflare Browser & Scraper Engine state
  const [wsEndpoint, setWsEndpoint] = useState('');
  const [engineInfo, setEngineInfo] = useState<{
    engine: string;
    browserWsEndpoint: string;
    hasRemoteEndpoint: boolean;
    status: string;
    description: string;
  } | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const call = async (path: string, method = 'GET', body?: unknown) => {
    const sessionToken = window.sessionStorage.getItem('mapscrape_session_token') || '';
    const r = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: 'Bearer ' + sessionToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || 'HTTP ' + r.status);
    return d;
  };

  const loadSettings = async () => {
    try {
      const data = await getScraperSettings();
      setEngineInfo(data);
      if (data.browserWsEndpoint) {
        setWsEndpoint(data.browserWsEndpoint);
      }
    } catch {
      // Fallback
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await call('/api/v1/provisioning/credentials');
      setItems(d.data || []);
      await loadSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar credenciais');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setIssued(null);
    try {
      const d = await call('/api/v1/provisioning/credentials', 'POST', {
        consumerName: name,
        consumerProject: project,
      });
      setIssued(d.data);
      setName('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao emitir credencial');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revogar esta chave de API?')) return;
    setError('');
    try {
      await call('/api/v1/provisioning/credentials/' + encodeURIComponent(id), 'DELETE');
      setItems((v) => v.map((x) => (x.id === id ? { ...x, status: 'revoked' } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao revogar credencial');
    }
  };

  const rotate = async (id: string) => {
    if (!window.confirm('Rotacionar a chave? A chave anterior será revogada.')) return;
    setError('');
    setIssued(null);
    try {
      const d = await call(
        '/api/v1/provisioning/credentials/' + encodeURIComponent(id) + '/rotate',
        'POST'
      );
      setIssued(d.data);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao rotacionar credencial');
    }
  };

  const saveBrowserSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSettingsSuccess('');
    setError('');

    const trimmed = wsEndpoint.trim();
    if (trimmed) {
      const validation = validateBrowserWsEndpoint(trimmed);
      if (!validation.valid) {
        setError(validation.message);
        setBusy(false);
        return;
      }
    }

    try {
      await updateScraperSettings({
        browserWsEndpoint: trimmed,
        preferredEngine: trimmed ? 'cloudflare' : 'local',
      });
      setSettingsSuccess('Configuração de navegador salva com sucesso.');
      await loadSettings();
      setTimeout(() => setSettingsSuccess(''), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar configurações do navegador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header className="border-b border-zinc-800 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Server className="w-3.5 h-3.5" />
          <span>Infraestrutura e Acesso</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
          Credenciais & Motor de Raspagem Real
        </h1>
        <p className="mt-2 text-base text-zinc-400 max-w-3xl leading-relaxed">
          Gerencie o motor de execução real (Puppeteer Headless ou Cloudflare Browser Rendering) e controle chaves de integração para projetos consumidores.
        </p>
      </header>

      {/* Cloudflare Browser Rendering / Puppeteer Real Engine Status Card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-7 space-y-5 shadow-xl shadow-black/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-100">Motor de Extração Real Google Maps</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Raspagem Ativa & Real
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Em conformidade com a especificação Cloudflare: sem simulação, extração real via Chromium / DOM real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
              {engineInfo?.hasRemoteEndpoint ? 'Cloudflare / Remote WS' : 'Puppeteer Local (Chromium)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Modo Atual de Coleta</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {engineInfo?.description || 'Navegador headless nativo Chromium executando via Puppeteer no backend Node.js, com suporte a rotação e paginação no Google Maps.'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Garantias Técnicas</span>
            </div>
            <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
              <li>Extração direta do DOM sem mock ou dados gerados fictícios</li>
              <li>Headers reais em português (pt-BR) e bypass de sandbox</li>
              <li>Deduplicação automática por URL e chave canônica</li>
            </ul>
          </div>
        </div>

        {/* Configuration for Cloudflare Browser Rendering API / Remote WS Endpoint */}
        <form onSubmit={saveBrowserSettings} className="pt-2 space-y-3">
          <label className="block text-sm font-semibold text-zinc-200">
            Endpoint WebSocket Remoto (Cloudflare Browser Rendering / Browserless)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={wsEndpoint}
              onChange={(e) => setWsEndpoint(e.target.value)}
              placeholder="Ex: wss://browser.cloudflare.com/... ou wss://chrome.browserless.io?token=..."
              className="flex-1 rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-500 font-mono"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Endpoint</span>
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Deixe em branco para usar o Chromium headless local integrado. Se preenchido com seu endpoint Cloudflare, o MapScrape conectará via WebSocket à infraestrutura de Browser Rendering.
          </p>
          {wsEndpoint.trim() && (() => {
            const v = validateBrowserWsEndpoint(wsEndpoint.trim());
            return (
              <p className={`text-xs flex items-center gap-1.5 ${v.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {v.valid ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                <span>{v.message}</span>
              </p>
            );
          })()}
          {settingsSuccess && (
            <p className="text-xs text-emerald-400 font-medium">{settingsSuccess}</p>
          )}
        </form>
      </section>

      {/* API Consumer Keys Section */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-7 space-y-6 shadow-xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Chaves de API (Projetos Consumidores)</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Emita chaves no formato <code className="text-emerald-400 font-mono">msk_live_...</code> para consultar e sincronizar coletas externamente.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-750 bg-zinc-950 hover:bg-zinc-800 px-4 py-2 text-xs sm:text-sm text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </p>
        )}

        {issued && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
              <KeyRound className="w-4 h-4" />
              <span>Chave de API gerada com sucesso (exibida apenas uma vez)</span>
            </div>
            <p className="text-xs text-zinc-300 font-medium">
              Cliente: <span className="text-white font-bold">{issued.consumerName}</span> · Projeto: <span className="text-white font-bold">{issued.consumerProject}</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 break-all rounded-xl bg-zinc-950 p-3 text-xs sm:text-sm font-mono text-emerald-400 border border-zinc-800">
                {issued.apiKey}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(issued.apiKey)}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3 text-xs sm:text-sm font-bold text-zinc-950 transition-colors cursor-pointer shrink-0"
              >
                Copiar Chave
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Guarde esta chave em seu ambiente seguro. O hash SHA-256 é armazenado internamente para verificação.
            </p>
          </div>
        )}

        {/* New Integration Form */}
        <form onSubmit={(e) => void create(e)} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Nome do Cliente / Empresa
            </label>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Agência de Prospecção"
              className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Projeto Vinculado
            </label>
            <input
              required
              maxLength={200}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Ex: Campanha São Paulo 2026"
              className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !project.trim() || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 h-[42px]"
          >
            <KeyRound className="h-4 w-4" />
            <span>Gerar Chave</span>
          </button>
        </form>

        {/* Credentials Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 p-4 font-semibold text-sm text-zinc-300">
            Chaves Emitidas ({items.length})
          </div>

          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Nenhuma chave de integração externa emitida ainda.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-900/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-100 text-sm">{item.consumer_name}</p>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          item.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                        }`}
                      >
                        {item.status === 'active' ? 'Ativa' : 'Revogada'}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs text-zinc-400 font-mono">
                      {item.consumer_project} · {item.id}
                    </p>
                  </div>

                  {item.status === 'active' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void rotate(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-850 hover:bg-zinc-750 px-3 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Rotacionar
                      </button>
                      <button
                        type="button"
                        onClick={() => void revoke(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revogar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};