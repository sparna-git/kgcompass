import type { ReconcileProjectConfig } from "kgreconcile";

export interface AppConfig {
  log?: {
    level?: string;
  };
  projects: Record<string, ProjectConfig>;
}

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

/** sparqlEndpoint, shacl, shaclTypes and reconciliation come from kgreconcile. */
export interface ProjectConfig extends ReconcileProjectConfig {
  /** Use cases rendered as a table in the MCP schema_overview. Each row tells
   *  the LLM where to enter the graph and which joins to follow for a recurring
   *  question pattern. NOT few-shots — no SPARQL, no literal example values. */
  useCases?: UseCase[];
  /** Path to a JSON file containing curated NL question + SPARQL pairs.
   *  When set, exposed via the MCP `${projectId}_get_few_shots` tool so the
   *  agent can consult realistic examples before writing SPARQL.
   *  Kept out-of-band (separate file) to avoid bloating the main config. */
  fewShotsFile?: string;
}
