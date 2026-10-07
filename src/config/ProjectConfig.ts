export interface AppConfig {
  log?: {
    level?: string;
  };
  projects: Record<string, ProjectConfig>;
}

export type ReconciliationServiceConfig =
  | ({
      implementation: "SparqlReconcileService";
    } & SparqlReconcileServiceConfig)
  | ({
      implementation: "SparqlReconcileServiceV13";
    } & SparqlReconcileServiceV13Config)
  | ({
      implementation: "LuceneGraphDBReconcileService";
    } & LuceneGraphDBReconcileServiceConfig)
  | ({ implementation: "LunrReconcileService" } & LunrReconcileServiceConfig)
  | ({
      implementation: "IsidoreApiReconcileService";
    } & IsidoreApiReconcileServiceConfig)
  | { implementation: "DummyReconcileService" };

export interface UseCase {
  /** Short, human-readable name of the use case (table row label). */
  title: string;
  /** Entry shape + filter or reconciliation step. Markdown allowed
   *  (wrap technical names with backticks for code styling). */
  entryPoint?: string;
  /** Subsequent joins / traversal steps. Markdown allowed. */
  joins?: string;
}

export interface FewShot {
  /** Natural-language question, in the project's primary language. */
  question: string;
  /** Curated SPARQL that correctly answers the question. Used by the
   *  agent as a template — predicates and filters may need adapting. */
  sparql: string;
}

export interface ProjectConfig {
  sparqlEndpoint: string;
  shaclTypes?: string[];
  /** Use cases rendered as a table in the MCP schema_overview. Each row tells
   *  the LLM where to enter the graph and which joins to follow for a recurring
   *  question pattern. NOT few-shots — no SPARQL, no literal example values. */
  useCases?: UseCase[];
  /** Path to a JSON file containing curated NL question + SPARQL pairs.
   *  When set, exposed via the MCP `${projectId}_get_few_shots` tool so the
   *  agent can consult realistic examples before writing SPARQL.
   *  Kept out-of-band (separate file) to avoid bloating the main config. */
  fewShotsFile?: string;
  reconciliation?: ReconciliationServiceConfig | ReconciliationServiceConfig[];
}

export interface SparqlReconcileServiceConfig {
  cacheSize?: number;
  maxResults?: number;
}

export interface SparqlReconcileServiceV13Config {
  cacheSize?: number;
  maxResults?: number;
}
export interface LuceneGraphDBReconcileServiceConfig {
  cacheSize?: number;
  maxResults?: number;
  luceneIndexName?: string;
}

export interface FieldQueryConfig {
  field: string;
  boost?: number;
  /** Inline SPARQL query string. Mutually exclusive with queryFile(s). */
  query?: string;
  /** Path to a single .rq file. Mutually exclusive with query. */
  queryFile?: string;
  /** Paths to multiple .rq files — all executed and bindings merged into this field. */
  queryFiles?: string[];
}

export interface LunrReconcileServiceConfig {
  cacheSize?: number;
  maxResults?: number;
  /** @deprecated use sparqlQueries instead */
  sparqlQuery?: string;
  sparqlQueries?: FieldQueryConfig[];
  indexCachePath?: string;
}

export interface IsidoreApiReconcileServiceConfig {}
