# Estrutura de descoberta de estabelecimentos com Firecrawl Maps

> **Status: implementação estrutural — não operacional.**
>
> Este documento registra a arquitetura proposta e os contratos de integração. Não habilita chamadas ao Firecrawl, não altera o fluxo de coleta em produção e não substitui o Chromium/Puppeteer nem o Google Maps como fonte de extração e validação.

## Objetivo

Preparar uma etapa opcional de **descoberta e paginação de estabelecimentos** usando o provider Firecrawl Maps, preservando o motor atual do Mais Clientes V2 para abrir e extrair as fichas no Google Maps.

O ganho que se pretende medir é a capacidade de encontrar candidatos adicionais por páginas sucessivas. Isso ainda precisa ser comprovado por benchmark; paginação disponível não significa cobertura completa do Google Maps.

## Fluxo arquitetural proposto

1. **Entrada de pesquisa:** reutilizar os termos de categoria e localização já selecionados pelo usuário.
2. **Descoberta (Firecrawl Maps):** consultar o provider com país `br`, idioma `pt-BR` e a consulta textual. Receber páginas de candidatos e continuar enquanto `has_more` indicar a existência de próxima página, usando o `next_cursor` retornado.
3. **Normalização:** converter cada resultado para um contrato interno independente do provider.
4. **Deduplicação de candidatos:** eliminar repetições entre páginas usando identificadores estáveis disponíveis, priorizando `place_id` e usando `feature_id` como identificador alternativo. Não fazer consultas adicionais ao banco para produzir relatórios de duplicidade.
5. **Resolução da ficha Google Maps:** encaminhar ao Chromium somente uma URL comprovadamente pertencente ao Google Maps. O campo `maps_url` do provider não deve ser presumido como URL Google Maps: o exemplo documentado do provider usa o domínio `maps.firecrawl.dev`. Validar host e comportamento antes de utilizá-lo no navegador.
6. **Extração atual:** manter o extrator Puppeteer/Chromium existente como responsável por abrir a ficha Google Maps e obter os campos detalhados já suportados pelo produto.
7. **Persistência atual:** manter a regra vigente: se o estabelecimento já existe, descartar; se for inédito, salvar. Não criar um segundo mecanismo de persistência ou deduplicação.

## Contrato interno de candidato

A camada de descoberta deve expor um modelo interno, sem espalhar o formato proprietário do Firecrawl pelo restante da aplicação:

```ts
export interface DiscoveredPlaceCandidate {
  provider: 'firecrawl_maps';
  providerPlaceId?: string;
  providerFeatureId?: string;
  name: string;
  categories: string[];
  address: string;
  phone?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviewCount?: number;
  /** URL fornecida pelo provider; não presumir que seja Google Maps. */
  providerMapsUrl?: string;
  /** Preenchida somente após validação explícita de domínio/formato Google Maps. */
  googleMapsUrl?: string;
}

export interface DiscoveryPage<TCandidate> {
  candidates: TCandidate[];
  hasMore: boolean;
  nextCursor?: string;
}
```

Os campos opcionais devem permanecer ausentes quando não fornecidos. Ausência de dado não deve ser convertida em zero ou em string artificial.

## Contrato de paginação

- Primeira chamada sem cursor.
- Próxima chamada somente quando `has_more === true` e houver `next_cursor` válido.
- Encerrar quando `has_more === false`.
- Proteger contra cursor repetido, página repetida e ausência de progresso, registrando a causa de encerramento.
- Não interpretar o fim das páginas do provider como prova de que todos os estabelecimentos da categoria/região foram encontrados.
- Não confundir meta de novos registros com quantidade de candidatos descobertos.

## Limites e responsabilidades

| Componente | Responsabilidade |
| --- | --- |
| Firecrawl Maps | Descobrir candidatos e paginar resultados |
| Normalizador interno | Padronizar campos e identificadores |
| Validador de URL | Distinguir URL do provider de URL real do Google Maps |
| Chromium/Puppeteer atual | Abrir ficha Google Maps e extrair dados detalhados |
| Deduplicação atual | Descartar existentes e permitir salvar somente inéditos |
| Persistência atual | Gravar os registros aprovados pelo fluxo existente |

## Fora do escopo deste commit

- Chamadas reais à API/provider Firecrawl Maps.
- Credenciais, variáveis de ambiente ou cobrança do Firecrawl.
- Alteração do worker, endpoint de coleta ou interface.
- Alteração do schema, migrations ou dados do Supabase.
- Substituição ou reescrita do scraper Chromium.
- Mudança na lógica atual de deduplicação ou persistência.
- Garantia de cobertura total do Google Maps.

## Próximas etapas para tornar operacional

1. Executar benchmark controlado com a mesma consulta no fluxo Chromium atual e no Firecrawl Maps, sem gravar resultados no banco.
2. Medir candidatos únicos por página, repetição entre páginas, disponibilidade de identificadores e qualidade dos campos.
3. Verificar empiricamente se existe uma URL Google Maps válida para cada candidato e se o Chromium atual consegue abrir a ficha correspondente.
4. Comparar o ganho líquido de estabelecimentos inéditos, tempo e custo.
5. Somente após evidência favorável, implementar o adaptador/provider e conectá-lo ao fluxo existente por uma etapa isolada e desativável.

## Critério de aceite da futura integração

A integração só deve ser considerada concluída quando demonstrar, em teste reproduzível, que descobre candidatos adicionais, resolve fichas reais do Google Maps, reutiliza o extrator atual e persiste apenas estabelecimentos inéditos — sem regressão no fluxo Chromium existente.
