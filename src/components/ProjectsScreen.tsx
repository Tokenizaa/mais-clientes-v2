import React, { useEffect, useMemo, useState } from 'react';
import {
  Folder,
  FolderOpen,
  MapPin,
  Search,
  ArrowRight,
  Layers3,
  Tags,
  Play,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';

async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // Preferem a chave de consumidor conectada; caso contrário, usam a sessão da conta.
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}

export type PersistedProject = { id: string; name: string; created_at: string; updated_at?: string };
export type PersistedCategory = { id: string; name: string; project_id: string; created_at?: string };

interface Props {
  jobs: ScrapeJob[];
  apiReady: boolean;
  onOpenJob: (jobId: string) => void;
  onNewScrape: (projectName?: string, categoryName?: string) => void;
}

export const ProjectsScreen: React.FC<Props> = ({ jobs, apiReady, onOpenJob, onNewScrape }) => {
  const [query, setQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryProjectId, setCategoryProjectId] = useState('');
  const [catalog, setCatalog] = useState<PersistedProject[]>([]);
  const [categories, setCategories] = useState<PersistedCategory[]>([]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Editing state for projects
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Editing state for categories
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const loadData = async () => {
    if (!apiReady) return;
    try {
      const [projectRes, categoryRes] = await Promise.all([
        accountFetch('/api/v1/projects', { cache: 'no-store' }),
        accountFetch('/api/v1/categories', { cache: 'no-store' }),
      ]);
      if (!projectRes.ok) throw new Error(`Projetos: HTTP ${projectRes.status}`);
      if (!categoryRes.ok) throw new Error(`Categorias: HTTP ${categoryRes.status}`);
      const projectData = await projectRes.json();
      const categoryData = await categoryRes.json();
      setCatalog(
        Array.isArray(projectData.data) ? projectData.data : projectData.projects ?? [],
      );
      const rawCategories = Array.isArray(categoryData.data) ? categoryData.data : categoryData.categories ?? [];
      setCategories(
        rawCategories.map((c: any, i: number) =>
          typeof c === 'string'
            ? { id: `cat_${i}_${c}`, name: c, created_at: new Date().toISOString() }
            : { id: c?.id || `cat_${i}`, name: c?.name || '', project_id: c?.project_id || '', created_at: c?.created_at || new Date().toISOString() }
        )
      );
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao carregar projetos e categorias.',
        type: 'error',
      });
    }
  };

  useEffect(() => {
    void loadData();
  }, [apiReady]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || !apiReady || isSavingProject) return;
    setIsSavingProject(true);
    setMessage(null);
    try {
      const response = await accountFetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: categoryProjectId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const project = data.data ?? data.project;
      setCatalog((current) =>
        current.some((item) => item.id === project.id)
          ? current
          : [...current, project].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setNewProjectName('');
      setMessage({ text: `Projeto “${project.name}” salvo com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao criar projeto.',
        type: 'error',
      });
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleUpdateProject = async (id: string) => {
    const name = editingProjectName.trim();
    if (!name) return;
    try {
      const response = await accountFetch(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const project = data.data ?? data.project;
      setCatalog((current) =>
        current.map((item) => (item.id === id ? project : item)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setEditingProjectId(null);
      setMessage({ text: `Projeto atualizado para “${project.name}”.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao atualizar projeto.',
        type: 'error',
      });
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o projeto “${name}”? As coletas existentes serão mantidas desvinculadas.`)) {
      return;
    }
    try {
      const response = await accountFetch(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setCatalog((current) => current.filter((item) => item.id !== id));
      setMessage({ text: `Projeto “${name}” excluído com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao excluir projeto.',
        type: 'error',
      });
    }
  };

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name || !categoryProjectId || !apiReady || isSavingCategory) return;
    setIsSavingCategory(true);
    setMessage(null);
    try {
      const response = await accountFetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: categoryProjectId }),
      });
      const data = await response.json();
      if (!response.ok || !data.data?.id && !data.category?.id) {
        throw new Error(data.message || data.error || `Não foi possível salvar a categoria (HTTP ${response.status}).`);
      }
      const category = data.data ?? data.category;
      setCategories((current) =>
        current.some((item) => item.id === category.id)
          ? current
          : [...current, category].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setNewCategoryName('');
      setMessage({
        text: `Categoria de pesquisa “${category.name}” cadastrada e disponível para coletas.`,
        type: 'success',
      });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao criar categoria.',
        type: 'error',
      });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    try {
      const response = await accountFetch(`/api/v1/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const category = data.data ?? data.category;
      setCategories((current) =>
        current.map((item) => (item.id === id ? category : item)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setEditingCategoryId(null);
      setMessage({ text: `Categoria atualizada para “${category.name}”.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao atualizar categoria.',
        type: 'error',
      });
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Excluir a categoria de pesquisa “${name}”?`)) return;
    try {
      const response = await accountFetch(`/api/v1/categories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setCategories((current) => current.filter((item) => item.id !== id));
      setMessage({ text: `Categoria “${name}” excluída com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao excluir categoria.',
        type: 'error',
      });
    }
  };

  const projects = useMemo(() => {
    const persisted = catalog.map((project) => {
      const related = jobs
        .filter((job) => job.project_id === project.id || (!job.project_id && job.project_name === project.name))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        id: project.id,
        name: project.name,
        isPersisted: true,
        jobs: related,
        total: related.reduce((sum, job) => sum + (job.total_collected || 0), 0),
      };
    });

    const knownNames = new Set(persisted.map((project) => project.name.toLocaleLowerCase('pt-BR')));
    const legacy = new Map<string, ScrapeJob[]>();
    for (const job of jobs) {
      const name = job.project_name?.trim() || `${job.segment} · ${job.location}`;
      if (knownNames.has(name.toLocaleLowerCase('pt-BR'))) continue;
      legacy.set(name, [...(legacy.get(name) || []), job]);
    }

    const all = [
      ...persisted,
      ...[...legacy.entries()].map(([name, items]) => ({
        id: `legacy:${name}`,
        name,
        isPersisted: false,
        jobs: items.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        total: items.reduce((sum, job) => sum + (job.total_collected || 0), 0),
      })),
    ];

    const needle = query.toLocaleLowerCase('pt-BR').trim();
    if (!needle) return all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return all
      .filter(
        (project) =>
          project.name.toLocaleLowerCase('pt-BR').includes(needle) ||
          project.jobs.some((job) => `${job.segment} ${job.location}`.toLocaleLowerCase('pt-BR').includes(needle))
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [jobs, catalog, query]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 py-2 sm:py-6">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Organização & Escopo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Projetos & Categorias</h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-zinc-400">
            Gerencie projetos para organizar suas extrações e categorias para padronizar as pesquisas no Google Maps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNewScrape()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition-colors"
        >
          <Play className="h-4 w-4" />
          <span>Nova coleta</span>
        </button>
      </header>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
            message.type === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {message.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-zinc-400 hover:text-zinc-200"
            aria-label="Fechar mensagem"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cadastros Rápidos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Criar Projeto */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex items-center gap-2 text-zinc-200">
            <Folder className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold">Novo projeto</h2>
          </div>
          <form onSubmit={(e) => void createProject(e)} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Clínicas Odontológicas SP"
              aria-label="Nome do novo projeto"
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!apiReady || !newProjectName.trim() || isSavingProject}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>{isSavingProject ? 'Salvando…' : 'Criar projeto'}</span>
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Cada projeto agrupa coletas independentes e permite filtrar os resultados exportáveis.
          </p>
        </section>

        {/* Categorias de Pesquisa */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-200">
              <Tags className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-semibold">Categorias de pesquisa</h2>
            </div>
            <span className="text-xs text-zinc-500">{categories.length} cadastradas</span>
          </div>

          <form onSubmit={(e) => void createCategory(e)} className="flex flex-col gap-2 sm:flex-row">
            <select
              value={categoryProjectId}
              onChange={(e) => setCategoryProjectId(e.target.value)}
              aria-label="Projeto da categoria"
              className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="">Selecione o projeto</option>
              {catalog.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Cafeterias Especiais"
              aria-label="Nome da nova categoria de pesquisa"
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!apiReady || !categoryProjectId || !newCategoryName.trim() || isSavingCategory}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 hover:bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>{isSavingCategory ? 'Salvando…' : 'Criar categoria'}</span>
            </button>
          </form>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="group flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-600 transition-colors"
                >
                  {editingCategoryId === cat.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="rounded bg-zinc-900 border border-zinc-600 px-2 py-0.5 text-xs text-zinc-100"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleUpdateCategory(cat.id)}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                        title="Salvar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategoryId(null)}
                        className="text-zinc-400 hover:text-zinc-200 p-0.5"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => onNewScrape(undefined, cat.name)}
                        className="text-emerald-400 hover:text-emerald-300 ml-1 p-0.5"
                        title="Pesquisar nesta categoria"
                      >
                        <Play className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategoryId(cat.id);
                          setEditingCategoryName(cat.name);
                        }}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        title="Editar nome"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCategory(cat.id, cat.name)}
                        className="text-zinc-500 hover:text-rose-400 p-0.5"
                        title="Excluir categoria"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">Nenhuma categoria cadastrada ainda.</p>
          )}

          <p className="text-xs text-zinc-500">
            Categoria de pesquisa padroniza o termo de busca e é diferente da categoria pública retornada pelo Maps.
          </p>
        </section>
      </div>

      {/* Busca de Projetos */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          aria-label="Buscar projeto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por nome do projeto, segmento ou localização..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* Grid de Projetos */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
          <h2 className="text-lg font-semibold text-zinc-200">
            {query ? 'Nenhum projeto corresponde ao filtro' : 'Nenhum projeto cadastrado'}
          </h2>
          <p className="mt-1 text-sm text-zinc-400 max-w-md mx-auto">
            {query ? 'Tente buscar com outro termo.' : 'Crie um novo projeto acima ou inicie uma coleta diretamente.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg shadow-black/20 hover:border-zinc-700 transition-all"
            >
              {/* Header do Card */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-400 shrink-0">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    {editingProjectId === project.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={editingProjectName}
                          onChange={(e) => setEditingProjectName(e.target.value)}
                          className="rounded-lg bg-zinc-950 border border-zinc-700 px-2.5 py-1 text-sm text-zinc-100 font-semibold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleUpdateProject(project.id)}
                          className="text-emerald-400 hover:text-emerald-300 p-1"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProjectId(null)}
                          className="text-zinc-400 hover:text-zinc-200 p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <h2 className="font-semibold text-zinc-100 text-base truncate" title={project.name}>
                        {project.name}
                      </h2>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {project.jobs.length} {project.jobs.length === 1 ? 'coleta' : 'coletas'} · {project.total.toLocaleString('pt-BR')} leads salvos
                    </p>
                  </div>
                </div>

                {project.isPersisted && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(project.id);
                        setEditingProjectName(project.name);
                      }}
                      className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                      title="Editar nome"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteProject(project.id, project.name)}
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                      title="Excluir projeto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Botão de ação: Coletar neste projeto */}
              <div className="mt-4 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => onNewScrape(project.name)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 py-2 text-xs font-semibold transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Iniciar coleta neste projeto</span>
                </button>
              </div>

              {/* Coletas Vinculadas */}
              {project.jobs.length > 0 && (
                <div className="mt-4 space-y-2 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Últimas coletas</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {Array.from(new Set(project.jobs.map((job) => categories.find((cat) => cat.id === job.category_id)?.name || 'Sem categoria'))).map((categoryName) => (
                      <section key={categoryName} className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2.5 space-y-2">
                        <div className="flex items-center gap-2 px-1 text-xs font-semibold text-emerald-300">
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>{categoryName}</span>
                          <span className="ml-auto text-zinc-500 font-normal">
                            {project.jobs.filter((job) => (categories.find((cat) => cat.id === job.category_id)?.name || 'Sem categoria') === categoryName).length} raspagem(ns)
                          </span>
                        </div>
                        {project.jobs.filter((job) => (categories.find((cat) => cat.id === job.category_id)?.name || 'Sem categoria') === categoryName).map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-zinc-200">{job.segment}</p>
                              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-400">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {job.location}
                              </p>
                              <p className="mt-0.5 text-xs text-zinc-400">
                                <span
                                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                                    job.status === 'completed'
                                      ? 'bg-emerald-400'
                                      : job.status === 'running'
                                      ? 'bg-amber-400 animate-ping'
                                      : 'bg-zinc-500'
                                  }`}
                                />
                                {job.status === 'completed' ? 'Concluída' : job.status} · {job.total_collected} salvos
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenJob(job.id)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700 hover:border-emerald-500 hover:text-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors"
                            >
                              <span>Ver resultados</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <footer className="pt-4 border-t border-zinc-850 text-xs text-zinc-500 flex items-center gap-2">
        <Layers3 className="h-4 w-4" />
        <span>Os projetos e categorias são isolados pela conta do usuário logado e persistidos no banco de dados.</span>
      </footer>
    </div>
  );
};
