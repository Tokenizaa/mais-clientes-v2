export interface PlaceRecord {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  price_range: string;
  opening_hours: string;
  business_status: string;
  latitude: string;
  longitude: string;
  maps_url: string;
  description: string;
  services_attributes: string;
  photos?: string;
  videos?: string;
  logo_url?: string;
  booking_url?: string;
  /** Social profile URLs explicitly present in the Google Maps place sheet, separated by |. */
  social_links?: string;
  /** JSON array of publicly visible reviews captured from the place's Reviews panel. */
  reviews?: string;
  /** JSON array of review topic/category chips and counts. */
  review_topics?: string;
  /** JSON object of additional public attributes from the About panel. */
  additional_attributes?: string;
  /** JSON array of typed media objects for image/video preview rendering. */
  media_items?: string;
  /** Plus code shown on the public place sheet, when present. */
  plus_code?: string;
  /** Structured address components; empty when not explicitly parseable from the displayed address. */
  postal_code?: string;
  country?: string;
  city?: string;
  state?: string;
  /** Stable Maps source identifier extracted from the Maps URL when present. */
  source_place_id?: string;
  /** Original URL used to identify the source listing. */
  source_url?: string;
  /** JSON array of normalized public business attributes. */
  attributes?: string;
  /** JSON array of public accessibility attributes. */
  accessibility_attributes?: string;
  /** Visible next-opening phrase, e.g. "Abre às 10h na terça". */
  next_opening_text?: string;
  /** Normalized next opening weekday when explicitly shown. */
  next_open_day?: string;
  /** Normalized next opening time when explicitly shown. */
  next_open_time?: string;
  /** Explicit total photo count displayed by Maps, not the number captured by the scraper. */
  visible_photos_count?: string;
  /** JSON object of popular-times data actually exposed in the rendered page. */
  popular_times?: string;
  /** JSON object mapping star levels (1-5) to counts when displayed. */
  rating_distribution?: string;
  /** JSON array of review summary/highlight snippets shown by Maps. */
  review_highlights?: string;
  /** JSON object recording per-field capture state; empty does not mean source absence. */
  field_status?: string;
  collected_at: string;
}

export type JobStatus = 'running' | 'completed' | 'partial' | 'stopped' | 'failed';

export interface ScrapeJob {
  id: string;
  user_id: string;
  segment: string;
  project_name?: string;
  project_id?: string;
  category_id?: string;
  location: string;
  limit_requested: number;
  status: JobStatus;
  status_message: string;
  total_found: number;
  total_collected: number;
  total_duplicates: number;
  total_errors: number;
  current_step?: string;
  created_at: string;
  completed_at?: string;
}

export interface ScrapeStartPayload {
  segment: string;
  location: string;
  limit: number;
}

export interface ExportCsvPayload {
  jobId?: string;
  placeIds?: string[];
  fields: (keyof PlaceRecord)[];
  filename?: string;
}

export const EXPORTABLE_FIELDS: { key: keyof PlaceRecord; label: string; description: string }[] = [
  { key: 'name', label: 'Nome do estabelecimento', description: 'Nome exibido na ficha' },
  { key: 'category', label: 'Categoria', description: 'Categoria exibida' },
  { key: 'address', label: 'Endereço', description: 'Endereço exibido' },
  { key: 'phone', label: 'Telefone', description: 'Telefone exibido' },
  { key: 'website', label: 'Site', description: 'URL apresentada na ficha' },
  { key: 'rating', label: 'Nota', description: 'Avaliação exibida' },
  { key: 'review_count', label: 'Quantidade de avaliações', description: 'Número exibido' },
  { key: 'price_range', label: 'Faixa de preço', description: 'Quando exibida' },
  { key: 'opening_hours', label: 'Horários de funcionamento', description: 'Horários apresentados na ficha' },
  { key: 'business_status', label: 'Status de funcionamento', description: 'Aberto, fechado, etc.' },
  { key: 'latitude', label: 'Latitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'longitude', label: 'Longitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'maps_url', label: 'Link do Google Maps', description: 'URL da ficha' },
  { key: 'description', label: 'Descrição', description: 'Descrição apresentada, se houver' },
  { key: 'services_attributes', label: 'Serviços e atributos', description: 'Informações exibidas na ficha' },
  { key: 'photos', label: 'Fotos (URLs)', description: 'URLs das fotos visíveis na ficha' },
  { key: 'videos', label: 'Vídeos (URLs)', description: 'URLs ou fontes de vídeos visíveis na ficha' },
  { key: 'logo_url', label: 'Logo / Foto de perfil', description: 'Imagem ou avatar exibido na ficha' },
  { key: 'social_links', label: 'Redes sociais (URLs)', description: 'Links sociais explicitamente exibidos na ficha do Google Maps' },
  { key: 'reviews', label: 'Avaliações individuais', description: 'Comentários, nota, autor, data, resposta do proprietário e mídia quando visíveis' },
  { key: 'review_topics', label: 'Categorias dos comentários', description: 'Tópicos sugeridos pelo Google Maps e suas contagens' },
  { key: 'additional_attributes', label: 'Atributos adicionais', description: 'Informações públicas da aba Sobre, incluindo facilidades e serviços' },
  { key: 'media_items', label: 'Mídia estruturada', description: 'Itens de mídia com tipo, URL, texto alternativo e miniatura' },
  { key: 'booking_url', label: 'URL de Agendamento', description: 'Link "Agendar on-line" ou "Book online" da ficha' },
  { key: 'plus_code', label: 'Plus Code', description: 'Código geográfico apresentado na ficha' },
  { key: 'postal_code', label: 'CEP / código postal', description: 'Quando explícito no endereço público' },
  { key: 'country', label: 'País', description: 'Componente do endereço quando identificável' },
  { key: 'city', label: 'Cidade', description: 'Componente do endereço quando identificável' },
  { key: 'state', label: 'Estado / região', description: 'Componente do endereço quando identificável' },
  { key: 'source_place_id', label: 'ID da ficha na fonte', description: 'Identificador extraído da URL do Google Maps' },
  { key: 'source_url', label: 'URL original da fonte', description: 'URL da ficha usada na coleta' },
  { key: 'attributes', label: 'Atributos do estabelecimento', description: 'Atributos públicos normalizados' },
  { key: 'accessibility_attributes', label: 'Acessibilidade', description: 'Atributos públicos de acessibilidade' },
  { key: 'next_opening_text', label: 'Próxima abertura (texto)', description: 'Texto de próxima abertura exibido pelo Maps' },
  { key: 'next_open_day', label: 'Próximo dia de abertura', description: 'Dia explicitamente identificável no status' },
  { key: 'next_open_time', label: 'Próximo horário de abertura', description: 'Horário explicitamente identificável no status' },
  { key: 'visible_photos_count', label: 'Total de fotos informado', description: 'Contagem textual explícita do Maps, não contagem inferida' },
  { key: 'popular_times', label: 'Horários de movimento', description: 'JSON de dados exibidos publicamente, quando disponíveis' },
  { key: 'rating_distribution', label: 'Distribuição de avaliações', description: 'Contagens por estrelas quando exibidas' },
  { key: 'review_highlights', label: 'Destaques de avaliações', description: 'Trechos de resumo exibidos pelo Maps' },
  { key: 'field_status', label: 'Estado de captura dos campos', description: 'JSON com status de observação por campo' },
  { key: 'collected_at', label: 'Data e hora da coleta', description: 'Registrada pelo aplicativo' },
];
