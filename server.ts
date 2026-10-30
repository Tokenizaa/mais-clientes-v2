import express, { type Request, type Response, type NextFunction } from 'express';
// Load Vite only in development. Importing it at module scope loads Rolldown's native binding,
// which is not required by production serverless API functions.

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { EXPORTABLE_FIELDS, type PlaceRecord, type ScrapeJob } from './src/shared/types.js';
import { BRAZILIAN_STATES, POPULAR_CATEGORIES } from './src/shared/brazilLocations.js';
import puppeteer from 'puppeteer-core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Browser, Page } from 'puppeteer-core';
import { extractPlaceDetails } from './src/server/scraper/extractor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data persistence path
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_FILE = path.join(DATA_DIR, 'mapscrape_store.json');

if (process.env.VERCEL !== '1' && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// User Profile Type
interface UserProfile {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface ApiCredentialRecord {
  id: string;
  consumer_name: string;
  consumer_project: string;
  api_key_hash: string;
  status: 'active' | 'revoked';
  created_at: string;
}

interface AuditLogRecord {
  id: string;
  created_at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
  user_id?: string;
}

interface ScraperSettings {
  browserWsEndpoint?: string;
  preferredEngine?: 'local' | 'cloudflare';
}

interface StoreState {
  users: UserProfile[];
  jobs: ScrapeJob[];
  places: PlaceRecord[];
  projects: ProjectRecord[];
  categories: CategoryRecord[];
  credentials: ApiCredentialRecord[];
  logs: AuditLogRecord[];
  settings?: ScraperSettings;
}

function hashPassword(pass: string): string {
  return crypto.createHash('sha256').update(pass + '_mapscrape_salt').digest('hex');
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

// Generate realistic Brazilian sample places
function generateInitialPlaces(jobId: string, segment: string, location: string): PlaceRecord[] {
  const samples = [
    {
      name: 'Clínica Médica Santa Helena',
      category: 'Clínica Médica e Diagnóstico',
      address: 'Av. Paulista, 1842 - Torre Norte, Bela Vista, São Paulo - SP, 01310-200',
      phone: '(11) 3254-8900',
      website: 'https://www.clinicasantahelena.com.br',
      rating: '4.8',
      review_count: '342',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 07:00-19:00 | Sáb: 08:00-13:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5592',
      longitude: '-46.6587',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01310-200',
      description: 'Centro integrado de especialidades médicas, consultas preventivas e exames laboratoriais de última geração.',
      photos: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80|https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/clinicasantahelena',
    },
    {
      name: 'Hospital & Centro Médico Aliança',
      category: 'Hospital Geral e Especialidades',
      address: 'R. Vergueiro, 2200, Vila Mariana, São Paulo - SP, 04101-000',
      phone: '(11) 5080-6000',
      website: 'https://www.centromedicoalianca.com.br',
      rating: '4.9',
      review_count: '1280',
      price_range: '$$$$',
      opening_hours: 'Atendimento 24 horas',
      business_status: 'OPERATIONAL',
      latitude: '-23.5855',
      longitude: '-46.6389',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '04101-000',
      description: 'Excelência em atendimento médico-hospitalar, corpo clínico renomado e pronto atendimento humanizado.',
      photos: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=600&q=80|https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/hospitalalianca_sp',
    },
    {
      name: 'Instituto Dermatológico Avançado DermaPrime',
      category: 'Clínica Dermatológica',
      address: 'R. Oscar Freire, 1105 - Cj 81, Jardins, São Paulo - SP, 01426-001',
      phone: '(11) 3062-4411',
      website: 'https://www.dermaprimeinstituto.com.br',
      rating: '4.7',
      review_count: '198',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 08:30-18:30',
      business_status: 'OPERATIONAL',
      latitude: '-23.5639',
      longitude: '-46.6698',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01426-001',
      description: 'Tratamentos dermatológicos clínicos, estéticos e cirúrgicos com tecnologia laser de alta precisão.',
      photos: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/dermaprimesp',
    },
    {
      name: 'Centro Odontológico Sorrir Mais',
      category: 'Odontologia e Ortodontia',
      address: 'R. Domingos de Morais, 1450, Vila Mariana, São Paulo - SP, 04010-200',
      phone: '(11) 2389-1020',
      website: 'https://www.sorrirmaisodonto.com.br',
      rating: '4.6',
      review_count: '415',
      price_range: '$$',
      opening_hours: 'Seg-Sex: 08:00-20:00 | Sáb: 08:00-14:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5898',
      longitude: '-46.6375',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '04010-200',
      description: 'Implantes, ortodontia invisível e odontologia estética com equipe multidisciplinar.',
      photos: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/sorrirmais_odonto',
    },
    {
      name: 'Laboratório e Medicina Diagnóstica Fleury - Unidade Jardins',
      category: 'Laboratório de Análises Clínicas',
      address: 'R. Caconde, 224, Jardim Paulista, São Paulo - SP, 01425-010',
      phone: '(11) 3179-0822',
      website: 'https://www.fleury.com.br',
      rating: '4.9',
      review_count: '890',
      price_range: '$$$$',
      opening_hours: 'Seg-Sáb: 06:00-18:00 | Dom: 07:00-13:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5752',
      longitude: '-46.6568',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01425-010',
      description: 'Pioneirismo em diagnósticos genéticos, biologia molecular e exames laboratoriais completos.',
      photos: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/fleury',
    },
    {
      name: 'Clínica de Fisioterapia e Reabilitação Movimento',
      category: 'Fisioterapia e RPG',
      address: 'R. Pamplona, 1005, Jardim Paulista, São Paulo - SP, 01405-001',
      phone: '(11) 3885-3320',
      website: 'https://www.movimentofisio.com.br',
      rating: '4.8',
      review_count: '164',
      price_range: '$$',
      opening_hours: 'Seg-Sex: 07:00-20:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5671',
      longitude: '-46.6552',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01405-001',
      description: 'Fisioterapia traumato-ortopédica, pilates terapêutico e reabilitação postural global.',
      photos: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/movimentofisiosp',
    },
    {
      name: 'Centro Cardiológico do Coração SP',
      category: 'Cardiologia',
      address: 'Av. Brigadeiro Luís Antônio, 3421, Jardim Paulista, São Paulo - SP, 01401-001',
      phone: '(11) 3887-2299',
      website: 'https://www.cardiologiasp.com.br',
      rating: '4.9',
      review_count: '512',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 07:30-19:30',
      business_status: 'OPERATIONAL',
      latitude: '-23.5783',
      longitude: '-46.6541',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01401-001',
      description: 'Ecocardiograma, teste ergométrico, MAPA, Holter e acompanhamento cardiológico de precisão.',
      photos: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/cardiologiasp',
    },
    {
      name: 'Clínica Oftalmológica Visão Total',
      category: 'Oftalmologia',
      address: 'R. Fradique Coutinho, 580, Pinheiros, São Paulo - SP, 05416-000',
      phone: '(11) 3031-7755',
      website: 'https://www.visaototaloftalmo.com.br',
      rating: '4.7',
      review_count: '280',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 08:00-18:00 | Sáb: 08:00-12:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5601',
      longitude: '-46.6890',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '05416-000',
      description: 'Cirurgia refrativa a laser, tratamento de glaucoma, catarata e exames oftalmológicos completos.',
      photos: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/visaototaloftalmo',
    },
  ];

  const now = new Date().toISOString();
  return samples.map((s, idx) => {
    const id = `plc_${jobId.replace('job_', '')}_${idx + 1}`;
    const cleanMapsName = encodeURIComponent(`${s.name} ${s.city}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${cleanMapsName}`;
    return {
      id,
      job_id: jobId,
      name: s.name,
      category: s.category || segment,
      address: s.address,
      phone: s.phone,
      website: s.website,
      rating: s.rating,
      review_count: s.review_count,
      price_range: s.price_range,
      opening_hours: s.opening_hours,
      business_status: s.business_status,
      latitude: s.latitude,
      longitude: s.longitude,
      maps_url: mapsUrl,
      description: s.description,
      services_attributes: 'Estacionamento no local, Wi-Fi gratuito, Acesso para deficientes, Atende convênios e particular',
      photos: s.photos,
      videos: '',
      logo_url: s.photos.split('|')[0] || '',
      booking_url: `${s.website}/agendamento`,
      social_links: s.instagram,
      reviews: JSON.stringify([
        { author: 'Mariana Silva', rating: 5, date: 'Há 2 semanas', text: 'Atendimento impecável! Pontualidade britânica e profissionais muito atenciosos.' },
        { author: 'Carlos Eduardo Santos', rating: 5, date: 'Há 1 mês', text: 'Excelente estrutura física, exames rápidos e laudos disponibilizados no mesmo dia pelo portal.' },
        { author: 'Ana Beatriz Souza', rating: 4, date: 'Há 3 meses', text: 'Ótima clínica, médicos de alto nível. Recomendo agendar com antecedência.' }
      ]),
      review_topics: JSON.stringify([
        { topic: 'Atendimento', count: 184 },
        { topic: 'Estrutura', count: 142 },
        { topic: 'Pontualidade', count: 96 },
        { topic: 'Convênios', count: 78 }
      ]),
      additional_attributes: JSON.stringify({
        acessibilidade: ['Entrada acessível para cadeira de rodas', 'Banheiro adaptado', 'Elevador acessível'],
        pagamentos: ['Cartões de crédito', 'Cartões de débito', 'Pix', 'Dinheiro'],
        comodidades: ['Wi-Fi gratuito', 'Ar condicionado', 'Sala de espera com café']
      }),
      media_items: JSON.stringify([
        { type: 'photo', url: s.photos.split('|')[0] || '', alt: s.name }
      ]),
      plus_code: `85FM+9V São Paulo, SP`,
      postal_code: s.postal_code,
      country: 'Brasil',
      city: s.city,
      state: s.state,
      source_place_id: `ChIJ${crypto.randomBytes(8).toString('hex')}`,
      source_url: mapsUrl,
      attributes: JSON.stringify(['Atende presencial', 'Telemedicina disponível', 'Aceita cartão e Pix']),
      accessibility_attributes: JSON.stringify(['Rampa de acesso', 'Vaga reservada', 'Banheiro adaptado']),
      next_opening_text: 'Abre amanhã às 08:00',
      next_open_day: 'Segunda-feira',
      next_open_time: '08:00',
      visible_photos_count: '48',
      popular_times: JSON.stringify({ 'Segunda': 'Pico às 10h e às 15h', 'Quarta': 'Fluxo moderado' }),
      rating_distribution: JSON.stringify({ '5': 260, '4': 58, '3': 15, '2': 5, '1': 4 }),
      review_highlights: JSON.stringify(['Profissionais muito atenciosos', 'Excelente estrutura física', 'Ótima localização']),
      field_status: JSON.stringify({ complete: 38, partial: 4 }),
      collected_at: now,
    };
  });
}

// Initial Data Seed
function getInitialStore(): StoreState {
  const initialJobId = 'job_initial_seed';
  const initialUserId = 'usr_admin_default';
  const initialJob: ScrapeJob = {
    id: initialJobId,
    user_id: initialUserId,
    segment: 'Clínica Médica',
    project_name: 'Prospecção Médica Sudeste',
    project_id: 'prj_medica_sp',
    category_id: 'cat_saude',
    location: 'São Paulo - SP',
    limit_requested: 10,
    status: 'completed',
    status_message: 'Coleta concluída com sucesso. 8 estabelecimentos capturados.',
    total_found: 8,
    total_collected: 8,
    total_duplicates: 0,
    total_errors: 0,
    current_step: 'Concluído',
    created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    completed_at: new Date(Date.now() - 3600 * 1000 * 24 + 12000).toISOString(),
  };

  const initialPlaces = generateInitialPlaces(initialJobId, 'Clínica Médica', 'São Paulo - SP');

  return {
    users: [
      {
        id: initialUserId,
        email: 'olfnetto@gmail.com',
        name: 'Administrador Geral',
        passwordHash: hashPassword('Netto@964212$'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_admin_demo',
        email: 'admin@mapscrape.com',
        name: 'Equipe MapScrape',
        passwordHash: hashPassword('admin12345678'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    ],
    jobs: [initialJob],
    places: initialPlaces,
    projects: [
      { id: 'prj_medica_sp', name: 'Prospecção Médica Sudeste', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'prj_gastronomia_rj', name: 'Restaurantes & Gastronomia RJ', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'prj_imobiliarias_sul', name: 'Imobiliárias & Corretores Sul', user_id: initialUserId, created_at: new Date().toISOString() },
    ],
    categories: [
      { id: 'cat_saude', name: 'Clínicas & Saúde', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'cat_odontologia', name: 'Odontologia & Ortodontia', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'cat_gastronomia', name: 'Restaurantes & Gastronomia', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'cat_imobiliario', name: 'Imobiliárias & Corretores', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'cat_estetica', name: 'Estética & Beleza', user_id: initialUserId, created_at: new Date().toISOString() },
    ],
    credentials: [
      {
        id: 'cred_prod_live_01',
        consumer_name: 'Pipeline CRM Hubspot',
        consumer_project: 'integração-vendas',
        api_key_hash: hashApiKey('msk_live_demo_crm_sync_key_998877'),
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ],
    logs: [
      {
        id: 'log_01',
        created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        level: 'info',
        category: 'scraper',
        event: 'job_started',
        message: 'Pesquisa inicial iniciada para "Clínica Médica" em "São Paulo - SP".',
        job_id: initialJobId,
        metadata: JSON.stringify({ segment: 'Clínica Médica', location: 'São Paulo - SP', limit: 10 }),
        user_id: initialUserId,
      },
      {
        id: 'log_02',
        created_at: new Date(Date.now() - 3600 * 1000 * 24 + 12000).toISOString(),
        level: 'info',
        category: 'scraper',
        event: 'job_completed',
        message: 'Coleta concluída com sucesso. 8 estabelecimentos enriquecidos e salvos.',
        job_id: initialJobId,
        metadata: JSON.stringify({ total_found: 8, total_collected: 8 }),
        user_id: initialUserId,
      },
    ],
  };
}

class Store {
  private state: StoreState;
  private supabase: SupabaseClient | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor() {
    this.state = this.load();
  }

  async initialize(): Promise<void> {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
        throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
      }
      return;
    }

    this.supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await this.supabase
      .from('app_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar dados do Supabase: ${error.message}`);

    if (data?.state && typeof data.state === 'object') {
      this.state = { ...getInitialStore(), ...(data.state as StoreState) };
    } else {
      // A new production database starts empty; never publish demo accounts or fake lead records.
      this.state = {
        users: [],
        jobs: [],
        places: [],
        projects: [],
        categories: [],
        credentials: [],
        logs: [],
        settings: {},
      };
      this.persist();
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  private load(): StoreState {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.jobs && parsed.places) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Store] Could not load stored data, initializing default seed:', e);
    }
    const initial = getInitialStore();
    this.save(initial);
    return initial;
  }

  private save(data: StoreState): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Store] Failed to write store file:', e);
    }
  }

  getState(): StoreState {
    return this.state;
  }

  persist(): void {
    if (!this.supabase) {
      this.save(this.state);
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(this.state)) as StoreState;
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      const { error } = await this.supabase!
        .from('app_state')
        .upsert({ id: 'main', state: snapshot, updated_at: new Date().toISOString() });
      if (error) throw new Error(`Falha ao persistir dados no Supabase: ${error.message}`);
    });
  }
}

const store = new Store();

// Helper: Extract Auth Bearer Token
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim();
  }
  return null;
}

// Helper: Resolve User from Token or Return Default Admin for local developer session
function resolveUserFromRequest(req: Request): UserProfile | null {
  const token = extractBearerToken(req);
  const state = store.getState();

  if (token) {
    // If token is an API key (starts with msk_ or matched by hash)
    const keyHash = hashApiKey(token);
    const cred = state.credentials.find((c) => c.status === 'active' && c.api_key_hash === keyHash);
    if (cred) {
      return {
        id: `consumer_${cred.id}`,
        email: `${cred.consumer_project}@api.mapscrape.com`,
        name: cred.consumer_name,
        passwordHash: '',
        role: 'user',
        createdAt: cred.created_at,
      };
    }

    // Check if token matches a registered user ID or JWT
    const directUser = state.users.find((u) => u.id === token || `sess_${u.id}` === token);
    if (directUser) return directUser;

    // Check by email in token if formatted as email:id
    if (token.includes('@')) {
      const emailUser = state.users.find((u) => u.email.toLowerCase() === token.toLowerCase());
      if (emailUser) return emailUser;
    }
  }

  // Only local development may use the seeded demo administrator.
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') return null;
  const admin = state.users.find((u) => u.role === 'admin') || state.users[0];
  return admin || null;
}

// =========================================================================
// REAL SCRAPING ENGINE (Google Maps DOM Extractor with Cloudflare Browser Support)
// =========================================================================

const activeScrapeJobs = new Map<string, { cancel: () => void }>();

async function connectScraperBrowser(): Promise<Browser> {
  const state = store.getState();
  const browserlessToken = process.env.BROWSERLESS_TOKEN?.trim();
  const legacyEndpoint = (state.settings?.browserWsEndpoint || process.env.BROWSER_WS_ENDPOINT || '').trim();
  const wsEndpoint = browserlessToken
    ? `wss://production-sfo.browserless.io?token=${encodeURIComponent(browserlessToken)}`
    : legacyEndpoint;

  if (wsEndpoint) {
    try {
      console.log(`[Scraper] Conectando ao Browserless / Chromium remoto (${browserlessToken ? 'Browserless' : 'endpoint legado'})...`);
      return await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        protocolTimeout: 60000,
      });
    } catch (err: any) {
      const message = err?.message || 'erro desconhecido';
      console.error(`[Scraper] Falha na conexão com o navegador remoto: ${message}`);
      if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
        throw new Error(`Não foi possível conectar ao Browserless. Verifique BROWSERLESS_TOKEN e a região da conta. Detalhe: ${message}`);
      }
    }
  }

  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Browser remoto obrigatório em produção. Configure BROWSERLESS_TOKEN nas variáveis de ambiente da Vercel.');
  }

  // Chromium local somente no desenvolvimento.
  console.log('[Scraper] Iniciando Chromium local para desenvolvimento...');
  const localPuppeteer = await import('puppeteer');
  return await localPuppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=pt-BR,pt',
    ],
  }) as unknown as Browser;
}

async function executeScrapeJob(jobId: string, segment: string, location: string, limit: number, userId: string) {
  const state = store.getState();
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) return;

  let isCancelled = false;
  let activeBrowser: Browser | null = null;

  activeScrapeJobs.set(jobId, {
    cancel: () => {
      isCancelled = true;
      if (activeBrowser) {
        activeBrowser.close().catch(() => {});
      }
    },
  });

  const searchQuery = `${segment} ${location}`.trim();
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

  try {
    job.status = 'running';
    job.current_step = 'Iniciando navegador para coleta real...';
    store.persist();

    // Log job start
    state.logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      level: 'info',
      category: 'scraper',
      event: 'job_started',
      message: `Iniciada coleta real de "${segment}" em "${location}" (limite: ${limit})`,
      job_id: jobId,
      metadata: JSON.stringify({ segment, location, limit, remoteBrowser: Boolean(process.env.BROWSERLESS_TOKEN || process.env.BROWSER_WS_ENDPOINT || state.settings?.browserWsEndpoint) }),
      user_id: userId,
    });
    store.persist();

    activeBrowser = await connectScraperBrowser();
    const searchPage = await activeBrowser.newPage();
    await searchPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await searchPage.setViewport({ width: 1280, height: 900 });
    await searchPage.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    job.current_step = `Navegando no Google Maps para: "${searchQuery}"...`;
    store.persist();

    await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Handle Google consent banner if displayed
    await searchPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const consentBtn = btns.find((b) =>
        /aceitar|concordo|accept all|i agree/i.test(b.innerText || '')
      );
      if (consentBtn) consentBtn.click();
    }).catch(() => {});

    // Collect place links by scrolling the results container
    const placeUrls = new Set<string>();
    let previousCount = 0;
    let stagnantRounds = 0;

    // Check if directly redirected to a single place
    if (searchPage.url().includes('/maps/place/')) {
      placeUrls.add(searchPage.url());
    }

    job.current_step = 'Buscando fichas comerciais na página de resultados do Maps...';
    store.persist();

    while (placeUrls.size < limit && stagnantRounds < 6) {
      if (isCancelled) break;

      const links: string[] = await searchPage
        .$$eval('a[href*="/maps/place/"]', (anchors) =>
          anchors
            .map((a) => (a as HTMLAnchorElement)?.href)
            .filter((href): href is string => Boolean(href) && href.includes('/maps/place/'))
        )
        .catch(() => []);

      for (const url of links) {
        if (placeUrls.size >= limit) break;
        placeUrls.add(url);
      }

      job.total_found = placeUrls.size;
      job.current_step = `Identificados ${placeUrls.size} estabelecimentos no Google Maps...`;
      store.persist();

      if (placeUrls.size >= limit) break;

      // Scroll results container or window
      await searchPage.evaluate(() => {
        const feed =
          document.querySelector('div[role="feed"]') ||
          document.querySelector('div.m6QErb[aria-label]') ||
          document.querySelector('div.TFQHme');
        if (feed) {
          (feed as HTMLElement).scrollTop = feed.scrollHeight;
        } else {
          window.scrollTo(0, document.body.scrollHeight);
        }
      }).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (placeUrls.size === previousCount) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
        previousCount = placeUrls.size;
      }
    }

    await searchPage.close().catch(() => {});

    if (isCancelled) {
      job.status = 'stopped';
      job.status_message = 'Coleta interrompida pelo operador.';
      job.current_step = 'Interrompido';
      store.persist();
      return;
    }

    if (placeUrls.size === 0) {
      job.status = 'failed';
      job.status_message = 'Nenhum estabelecimento encontrado no Google Maps para esta busca.';
      job.current_step = 'Sem resultados';
      job.total_errors = 1;
      state.logs.unshift({
        id: `log_${Date.now()}_err`,
        created_at: new Date().toISOString(),
        level: 'warn',
        category: 'scraper',
        event: 'no_results',
        message: `A busca por "${searchQuery}" não retornou nenhuma ficha pública no Google Maps.`,
        job_id: jobId,
        metadata: JSON.stringify({ query: searchQuery }),
        user_id: userId,
      });
      store.persist();
      return;
    }

    // Now visit each place URL and extract full details
    let collectedCount = 0;

    for (const placeUrl of placeUrls) {
      if (isCancelled) break;
      if (collectedCount >= limit) break;

      // Duplicate check (by URL or name+address in store)
      const isDuplicate = state.places.some(
        (p) => p.maps_url === placeUrl || p.source_url === placeUrl
      );

      if (isDuplicate) {
        job.total_duplicates += 1;
        job.current_step = `Ignorando estabelecimento duplicado (${job.total_duplicates})...`;
        store.persist();
        continue;
      }

      let detailPage: Page | null = null;
      try {
        detailPage = await activeBrowser.newPage();
        await detailPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        await detailPage.setViewport({ width: 1280, height: 900 });
        await detailPage.setExtraHTTPHeaders({
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        await detailPage.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const place = await extractPlaceDetails(detailPage, jobId, placeUrl);

        // Enrich city/state if missing from place components
        if (!place.city && location.includes(',')) {
          const parts = location.split(',');
          place.city = parts[0].trim();
          if (parts[1]) place.state = parts[1].trim();
        } else if (!place.city) {
          place.city = location;
        }

        // Save real place
        state.places.push(place);
        collectedCount += 1;
        job.total_collected = collectedCount;
        job.current_step = `Coletado (${collectedCount}/${Math.min(limit, placeUrls.size)}): ${place.name || 'Estabelecimento'}`;

        state.logs.unshift({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          created_at: new Date().toISOString(),
          level: 'info',
          category: 'scraper',
          event: 'place_extracted',
          message: `Ficha extraída: "${place.name}" | Categoria: "${place.category || '—'}" | Tel: ${place.phone || '—'} | Endereço: ${place.address || '—'}`,
          job_id: jobId,
          metadata: JSON.stringify({
            name: place.name,
            rating: place.rating,
            reviews: place.review_count,
            phone: place.phone,
            website: place.website,
            address: place.address,
            coords: { lat: place.latitude, lng: place.longitude },
          }),
          user_id: userId,
        });

        store.persist();
      } catch (extractErr: any) {
        job.total_errors += 1;
        console.error(`Erro ao coletar ficha ${placeUrl}:`, extractErr.message);
        state.logs.unshift({
          id: `log_${Date.now()}_err`,
          created_at: new Date().toISOString(),
          level: 'warn',
          category: 'scraper',
          event: 'place_error',
          message: `Erro na extração da ficha: ${extractErr.message}`,
          job_id: jobId,
          metadata: JSON.stringify({ url: placeUrl, error: extractErr.message }),
          user_id: userId,
        });
        store.persist();
      } finally {
        if (detailPage) await detailPage.close().catch(() => {});
      }
    }

    if (isCancelled) {
      job.status = 'stopped';
      job.status_message = 'Coleta interrompida pelo operador.';
      job.current_step = 'Interrompido';
      store.persist();
      return;
    }

    // Complete job
    job.status = collectedCount > 0 ? 'completed' : 'failed';
    job.status_message =
      collectedCount > 0
        ? `Coleta real concluída com sucesso! ${collectedCount} estabelecimentos extraídos do Google Maps.`
        : 'Nenhum estabelecimento pôde ser extraído da listagem.';
    job.current_step = collectedCount > 0 ? 'Concluído' : 'Falha';
    job.completed_at = new Date().toISOString();

    state.logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      level: collectedCount > 0 ? 'info' : 'error',
      category: 'scraper',
      event: 'job_completed',
      message: `Coleta finalizada: ${collectedCount} estabelecimentos reais capturados e salvos no SQLite/JSON para "${segment}".`,
      job_id: jobId,
      metadata: JSON.stringify({
        total_found: placeUrls.size,
        total_collected: collectedCount,
        total_duplicates: job.total_duplicates,
        total_errors: job.total_errors,
      }),
      user_id: userId,
    });

    store.persist();
  } catch (error: any) {
    job.status = 'failed';
    job.status_message = `Erro durante a execução da coleta: ${error?.message || 'Falha desconhecida'}`;
    job.total_errors += 1;
    job.current_step = 'Falha';

    state.logs.unshift({
      id: `log_${Date.now()}_err`,
      created_at: new Date().toISOString(),
      level: 'error',
      category: 'scraper',
      event: 'job_error',
      message: `Erro na coleta ${jobId}: ${error?.message}`,
      job_id: jobId,
      metadata: JSON.stringify({ error: error?.message }),
      user_id: userId,
    });
    store.persist();
  } finally {
    if (activeBrowser) {
      await activeBrowser.close().catch(() => {});
    }
    activeScrapeJobs.delete(jobId);
  }
}

// CSV Builder with BOM & Formula Injection Defense
function buildCsvString(places: PlaceRecord[], fields: (keyof PlaceRecord)[]): string {
  const headerKeys = fields.length > 0 ? fields : (EXPORTABLE_FIELDS.map((f) => f.key) as (keyof PlaceRecord)[]);
  const fieldLabelMap = new Map(EXPORTABLE_FIELDS.map((f) => [f.key, f.label]));

  const headerRow = headerKeys.map((k) => `"${(fieldLabelMap.get(k) || k).replace(/"/g, '""')}"`).join(',');

  const rows = places.map((place) => {
    return headerKeys
      .map((k) => {
        let val = place[k];
        if (val === undefined || val === null) val = '';
        let str = String(val);

        // Sanitize formula injection (=, +, -, @, \t, \r)
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `'` + str;
        }

        // Escape double quotes
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  // UTF-8 BOM
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

export async function createApp() {
  await store.initialize();
  const app = express();

  // Flush queued database writes before sending any API response.
  app.use((_req, res, next) => {
    const originalEnd = res.end.bind(res);
    let ending = false;
    (res as any).end = (...args: any[]) => {
      if (ending) return res;
      ending = true;
      void store.flush().then(() => originalEnd(...args)).catch((error) => {
        console.error('[Store] Supabase persistence failed:', error);
        if (!res.headersSent) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          originalEnd(JSON.stringify({ error: 'Não foi possível salvar os dados no banco. Tente novamente.' }));
        } else {
          originalEnd(...args);
        }
      });
      return res;
    };
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logger for API calls
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[API ${req.method}] ${req.path}`);
    }
    next();
  });

  // =========================================================================
  // 1. AUTHENTICATION ROUTES (/api/auth/*)
  // =========================================================================

  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      const state = store.getState();
      const existing = state.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
      }

      const newUser: UserProfile = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: String(email).trim().toLowerCase(),
        name: String(name || '').trim() || 'Usuário',
        passwordHash: hashPassword(password),
        role: state.users.length === 0 ? 'admin' : 'user',
        createdAt: new Date().toISOString(),
      };

      state.users.push(newUser);
      store.persist();

      const token = `sess_${newUser.id}`;
      return res.status(201).json({
        token,
        user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Informe e-mail e senha.' });
      }

      const state = store.getState();
      const user = state.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Conta não encontrada. Faça seu cadastro antes de entrar.' });
      }

      // Check password
      const pHash = hashPassword(password);
      if (!user.passwordHash || user.passwordHash !== pHash) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      const token = `sess_${user.id}`;
      return res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }
      return res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Protect all application endpoints. Auth and registration remain public.
  app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
    if (!resolveUserFromRequest(req)) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    next();
  });

  // =========================================================================
  // 2. SCRAPING JOBS (/api/v1/jobs)
  // =========================================================================

  app.get('/api/v1/jobs', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const sorted = [...state.jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json({ data: sorted, total: sorted.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/jobs', async (req: Request, res: Response) => {
    try {
      const { segment, location, limit, projectName, categoryName } = req.body;
      if (!segment || !location) {
        return res.status(400).json({ error: 'Segmento e Localização são campos obrigatórios.' });
      }

      const user = resolveUserFromRequest(req);
      const userId = user ? user.id : 'usr_default';
      const numLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newJob: ScrapeJob = {
        id: jobId,
        user_id: userId,
        segment: String(segment).trim(),
        project_name: projectName ? String(projectName).trim() : undefined,
        category_id: categoryName ? String(categoryName).trim() : undefined,
        location: String(location).trim(),
        limit_requested: numLimit,
        status: 'running',
        status_message: `Iniciando coleta para "${segment}" em "${location}"...`,
        total_found: 0,
        total_collected: 0,
        total_duplicates: 0,
        total_errors: 0,
        current_step: 'Conectando ao mecanismo de busca...',
        created_at: new Date().toISOString(),
      };

      const state = store.getState();
      state.jobs.unshift(newJob);

      // If projectName provided and doesn't exist, auto create project
      if (projectName && !state.projects.some((p) => p.name.toLowerCase() === projectName.toLowerCase())) {
        state.projects.unshift({
          id: `prj_${Date.now()}`,
          name: projectName,
          user_id: userId,
          created_at: new Date().toISOString(),
        });
      }

      // If categoryName provided and doesn't exist, auto create category
      if (categoryName && !state.categories.some((c) => c.name.toLowerCase() === categoryName.toLowerCase())) {
        state.categories.unshift({
          id: `cat_${Date.now()}`,
          name: categoryName,
          user_id: userId,
          created_at: new Date().toISOString(),
        });
      }

      store.persist();

      // Vercel must keep the request open while the serverless scrape runs.
      // Local development keeps the existing background-job behavior.
      if (process.env.VERCEL === '1') {
        await executeScrapeJob(jobId, newJob.segment, newJob.location, numLimit, userId);
      } else {
        void executeScrapeJob(jobId, newJob.segment, newJob.location, numLimit, userId);
      }

      return res.status(201).json({
        data: { jobId, job: newJob },
        jobId,
        message: 'Coleta agendada com sucesso.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/jobs/:id', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const job = state.jobs.find((j) => j.id === req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Coleta não encontrada.' });
      }
      return res.json({ data: job, ...job });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/jobs/:id/stop', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const job = state.jobs.find((j) => j.id === req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Coleta não encontrada.' });
      }

      const active = activeScrapeJobs.get(job.id);
      if (active) {
        active.cancel();
      }

      job.status = 'stopped';
      job.status_message = 'Coleta interrompida pelo usuário.';
      job.current_step = 'Parado';
      store.persist();

      return res.json({ success: true, message: 'Coleta parada com sucesso.', job });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/jobs/:id', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const index = state.jobs.findIndex((j) => j.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Coleta não encontrada.' });
      }

      // Stop if active
      const active = activeScrapeJobs.get(req.params.id);
      if (active) active.cancel();

      // Remove job & associated places
      state.jobs.splice(index, 1);
      state.places = state.places.filter((p) => p.job_id !== req.params.id);
      store.persist();

      return res.json({ success: true, message: 'Coleta e estabelecimentos associados removidos.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 3. LEADS / PLACES (/api/v1/leads)
  // =========================================================================

  app.get('/api/v1/leads', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const { jobId, query, category, sortBy = 'collected_at', sortOrder = 'desc', offset = '0', limit = '25' } = req.query;

      let filtered = [...state.places];

      if (jobId && typeof jobId === 'string' && jobId.trim()) {
        filtered = filtered.filter((p) => p.job_id === jobId.trim());
      }

      if (query && typeof query === 'string' && query.trim()) {
        const q = query.trim().toLowerCase();
        filtered = filtered.filter((p) => {
          return (
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.address.toLowerCase().includes(q) ||
            p.phone.toLowerCase().includes(q) ||
            p.website.toLowerCase().includes(q) ||
            p.city?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
          );
        });
      }

      if (category && typeof category === 'string' && category.trim()) {
        const cat = category.trim().toLowerCase();
        filtered = filtered.filter((p) => p.category.toLowerCase().includes(cat));
      }

      // Sort
      const sortKey = String(sortBy) as keyof PlaceRecord;
      const asc = String(sortOrder).toLowerCase() === 'asc';

      filtered.sort((a, b) => {
        const valA = a[sortKey] || '';
        const valB = b[sortKey] || '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA;
        }
        return asc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });

      const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
      const numLimit = Math.max(1, Math.min(500, parseInt(String(limit), 10) || 25));
      const paginated = filtered.slice(numOffset, numOffset + numLimit);

      return res.json({
        data: paginated,
        places: paginated,
        pagination: {
          total: filtered.length,
          offset: numOffset,
          limit: numLimit,
          hasMore: numOffset + numLimit < filtered.length,
        },
        total: filtered.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 4. CATEGORIES (/api/v1/categories)
  // =========================================================================

  app.get('/api/v1/categories', (_req: Request, res: Response) => {
    try {
      const state = store.getState();
      const placeCats = state.places.map((p) => p.category).filter(Boolean);
      const savedCats = state.categories.map((c) => c.name);
      const allDistinct = Array.from(new Set([...savedCats, ...placeCats]));
      return res.json({
        data: state.categories,
        categories: allDistinct,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/categories', (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
      }
      const user = resolveUserFromRequest(req);
      const state = store.getState();
      const newCat: CategoryRecord = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: String(name).trim(),
        user_id: user ? user.id : 'usr_default',
        created_at: new Date().toISOString(),
      };
      state.categories.unshift(newCat);
      store.persist();
      return res.status(201).json({ data: newCat, category: newCat });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v1/categories/:id', (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const state = store.getState();
      const cat = state.categories.find((c) => c.id === req.params.id);
      if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (name && String(name).trim()) {
        cat.name = String(name).trim();
        store.persist();
      }
      return res.json({ data: cat });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/categories/:id', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const idx = state.categories.findIndex((c) => c.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Categoria não encontrada.' });
      state.categories.splice(idx, 1);
      store.persist();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 5. PROJECTS (/api/v1/projects)
  // =========================================================================

  app.get('/api/v1/projects', (_req: Request, res: Response) => {
    try {
      const state = store.getState();
      return res.json({ data: state.projects, projects: state.projects });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/projects', (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Nome do projeto é obrigatório.' });
      }
      const user = resolveUserFromRequest(req);
      const state = store.getState();
      const newProj: ProjectRecord = {
        id: `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: String(name).trim(),
        user_id: user ? user.id : 'usr_default',
        created_at: new Date().toISOString(),
      };
      state.projects.unshift(newProj);
      store.persist();
      return res.status(201).json({ data: newProj, project: newProj });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v1/projects/:id', (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const state = store.getState();
      const proj = state.projects.find((p) => p.id === req.params.id);
      if (!proj) return res.status(404).json({ error: 'Projeto não encontrado.' });
      if (name && String(name).trim()) {
        proj.name = String(name).trim();
        proj.updated_at = new Date().toISOString();
        store.persist();
      }
      return res.json({ data: proj });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/projects/:id', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const idx = state.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Projeto não encontrado.' });
      state.projects.splice(idx, 1);
      store.persist();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 6. FIELD COVERAGE (/api/v1/field-coverage)
  // =========================================================================

  app.get('/api/v1/field-coverage', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const { jobId } = req.query;
      let targetPlaces = state.places;
      if (jobId && typeof jobId === 'string' && jobId.trim()) {
        targetPlaces = targetPlaces.filter((p) => p.job_id === jobId.trim());
      }

      const totalRecords = targetPlaces.length;
      const allFields = EXPORTABLE_FIELDS;

      const fieldsStats = allFields.map((field) => {
        let populated = 0;
        for (const place of targetPlaces) {
          const val = place[field.key];
          if (val !== undefined && val !== null && String(val).trim().length > 0) {
            populated++;
          }
        }
        const missing = totalRecords - populated;
        const percentage = totalRecords > 0 ? Math.round((populated / totalRecords) * 100) : 0;
        return {
          key: field.key,
          label: field.label,
          populated,
          missing,
          percentage,
        };
      });

      const avgCoverage = fieldsStats.length > 0
        ? Math.round(fieldsStats.reduce((acc, f) => acc + f.percentage, 0) / fieldsStats.length)
        : 0;

      return res.json({
        totalRecords,
        totalFields: allFields.length,
        averageCoverage: avgCoverage,
        fields: fieldsStats,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 7. EXPORT CSV (/api/v1/export/csv)
  // =========================================================================

  app.post('/api/v1/export/csv', (req: Request, res: Response) => {
    try {
      const { fields = [], filename, placeIds, jobId } = req.body;
      const state = store.getState();
      let targetPlaces = state.places;

      if (Array.isArray(placeIds) && placeIds.length > 0) {
        const idSet = new Set(placeIds);
        targetPlaces = targetPlaces.filter((p) => idSet.has(p.id));
      } else if (jobId && typeof jobId === 'string' && jobId.trim()) {
        targetPlaces = targetPlaces.filter((p) => p.job_id === jobId.trim());
      }

      const user = resolveUserFromRequest(req);
      const csvContent = buildCsvString(targetPlaces, fields as (keyof PlaceRecord)[]);
      const safeFilename = (filename || `mapscrape_export_${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_');

      // Record export in audit log
      state.logs.unshift({
        id: `log_${Date.now()}_export`,
        created_at: new Date().toISOString(),
        level: 'info',
        category: 'export',
        event: 'csv_generated',
        message: `Arquivo CSV exportado com ${targetPlaces.length} registros e ${fields.length || EXPORTABLE_FIELDS.length} colunas.`,
        job_id: jobId || 'bulk_export',
        metadata: JSON.stringify({ filename: safeFilename, count: targetPlaces.length }),
        user_id: user?.id,
      });
      store.persist();

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.csv"`);
      return res.send(Buffer.from(csvContent, 'utf-8'));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 8. AUDIT LOGS (/api/v1/logs)
  // =========================================================================

  app.get('/api/v1/logs', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const { level, category, query, jobId, limit = '100' } = req.query;

      let filtered = [...state.logs];

      if (level && typeof level === 'string' && level.trim()) {
        filtered = filtered.filter((l) => l.level === level.trim().toLowerCase());
      }

      if (category && typeof category === 'string' && category.trim()) {
        filtered = filtered.filter((l) => l.category.toLowerCase() === category.trim().toLowerCase());
      }

      if (jobId && typeof jobId === 'string' && jobId.trim()) {
        filtered = filtered.filter((l) => l.job_id === jobId.trim());
      }

      if (query && typeof query === 'string' && query.trim()) {
        const q = query.trim().toLowerCase();
        filtered = filtered.filter((l) => l.message.toLowerCase().includes(q) || l.event.toLowerCase().includes(q));
      }

      const numLimit = Math.max(1, Math.min(500, parseInt(String(limit), 10) || 100));
      const sliced = filtered.slice(0, numLimit);

      return res.json({
        logs: sliced,
        total: filtered.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 9. API CREDENTIALS PROVISIONING (/api/v1/provisioning/credentials)
  // =========================================================================

  app.get('/api/v1/provisioning/credentials', (_req: Request, res: Response) => {
    try {
      const state = store.getState();
      return res.json({ data: state.credentials });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/provisioning/credentials', (req: Request, res: Response) => {
    try {
      const { consumerName, consumerProject } = req.body;
      if (!consumerName || !consumerProject) {
        return res.status(400).json({ error: 'Nome do cliente e Nome do projeto são obrigatórios.' });
      }

      const credentialId = `cred_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const rawSecret = crypto.randomBytes(24).toString('hex');
      const apiKey = `msk_live_${rawSecret}`;
      const state = store.getState();

      const newCred: ApiCredentialRecord = {
        id: credentialId,
        consumer_name: String(consumerName).trim(),
        consumer_project: String(consumerProject).trim(),
        api_key_hash: hashApiKey(apiKey),
        status: 'active',
        created_at: new Date().toISOString(),
      };

      state.credentials.unshift(newCred);
      store.persist();

      return res.status(201).json({
        data: {
          credentialId,
          apiKey,
          consumerName: newCred.consumer_name,
          consumerProject: newCred.consumer_project,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/provisioning/credentials/:id', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const cred = state.credentials.find((c) => c.id === req.params.id);
      if (!cred) return res.status(404).json({ error: 'Credencial não encontrada.' });
      cred.status = 'revoked';
      store.persist();
      return res.json({ success: true, message: 'Credencial revogada com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/provisioning/credentials/:id/rotate', (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const cred = state.credentials.find((c) => c.id === req.params.id);
      if (!cred) return res.status(404).json({ error: 'Credencial não encontrada.' });

      const rawSecret = crypto.randomBytes(24).toString('hex');
      const newApiKey = `msk_live_${rawSecret}`;
      cred.api_key_hash = hashApiKey(newApiKey);
      cred.status = 'active';
      store.persist();

      return res.json({
        data: {
          credentialId: cred.id,
          apiKey: newApiKey,
          consumerName: cred.consumer_name,
          consumerProject: cred.consumer_project,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 10. SCRAPER & CLOUDFLARE BROWSER SETTINGS (/api/v1/scraper/settings)
  // =========================================================================

  app.get('/api/v1/scraper/settings', (_req: Request, res: Response) => {
    try {
      const state = store.getState();
      const hasRemoteEndpoint = Boolean(process.env.BROWSERLESS_TOKEN || state.settings?.browserWsEndpoint || process.env.BROWSER_WS_ENDPOINT);
      const engine = process.env.BROWSERLESS_TOKEN ? 'browserless' : hasRemoteEndpoint ? 'remote_chromium' : 'local_puppeteer';
      return res.json({
        engine,
        hasRemoteEndpoint,
        status: 'ready',
        description: engine === 'browserless'
          ? 'Browserless remoto configurado por variável de ambiente'
          : hasRemoteEndpoint
            ? 'Chromium remoto configurado'
            : 'Chromium local disponível somente em desenvolvimento',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/scraper/settings', (req: Request, res: Response) => {
    try {
      const { browserWsEndpoint, preferredEngine } = req.body;
      const state = store.getState();
      if (!state.settings) {
        state.settings = {};
      }
      if (typeof browserWsEndpoint === 'string') {
        state.settings.browserWsEndpoint = browserWsEndpoint.trim();
      }
      if (preferredEngine) {
        state.settings.preferredEngine = preferredEngine;
      }
      store.persist();
      return res.json({
        success: true,
        message: 'Configurações de navegador atualizadas.',
        settings: {
          preferredEngine: state.settings.preferredEngine,
          hasRemoteEndpoint: Boolean(process.env.BROWSERLESS_TOKEN || state.settings.browserWsEndpoint || process.env.BROWSER_WS_ENDPOINT),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 11. VITE MIDDLEWARE / SPA STATIC HANDLER
  // =========================================================================

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}
