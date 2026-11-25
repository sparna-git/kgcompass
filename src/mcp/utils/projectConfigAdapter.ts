import axios from "axios";
import { ConfigProvider } from "../../config/ConfigProvider";
import { AppConfig } from "../../config/AppConfig";

import {
  getSHACLConfig,
  listNodeShapeIris,
  loadShaclTtl,
} from "../../config/SCHACL";
import { ShapesGraph } from "rdf-shacl-commons";
import {
  extractNodeShapes,
  extractNodeShapesOverview,
  extractPrefixesFromTtl,
  type NodeShapeInfo,
  type NodeShapeOverviewInfo,
} from "./shaclParser";
import type {
  ReconcileInput,
  ReconcileOutput,
  ReconciliationServiceConfig,
} from "kgreconcile";
import type { UseCase, FewShot } from "../../config/ProjectConfig";
import { loadFewShots } from "../../config/FewShots";

// Max time we wait for the SPARQL endpoint when executing a query from query_sparql.
export const SPARQL_TIMEOUT_MS = 60_000;

export interface ProjectConfig {
  projectId: string;
  sparqlEndpoint: string;
  shaclPath?: string;
  shaclTypes?: string[];
  useCases?: UseCase[];
  fewShotsFile?: string;
  conceptSchemes?: string[];
}

/** A concept of a controlled vocabulary, its labels written "label@lang". */
export interface ConceptInfo {
  iri: string;
  prefLabels: string[];
  altLabels: string[];
}

/**
 * Adapter contract used by the MCP layer.
 */
export interface ProjectConfigAdapter {
  getProjectConfig(projectId: string): Promise<ProjectConfig>;
  executeSparql(
    projectId: string,
    query: string,
  ): Promise<Record<string, unknown>>;
  getShaclNodeShapes(
    projectId: string,
    lang?: string,
    shapes?: string[],
  ): Promise<{ shapes: NodeShapeInfo[]; prefixes: [string, string][] }>;
  getShaclNodeShapesOverview(
    projectId: string,
    lang?: string,
  ): Promise<{ shapes: NodeShapeOverviewInfo[]; prefixes: [string, string][] }>;
  getShapesGraphMeta(
    projectId: string,
    lang?: string,
  ): Promise<{
    title?: string;
    description?: string;
    agentInstruction?: string;
  }>;
  // get prefixes on set variable for the project, to be used in reconciliation and discover nodeshapes
  getShaclPrefixes(projectId: string): Promise<[string, string][]>;

  reconcileEntities(
    projectId: string,
    queries: ReconcileInput,
    includeTypes?: boolean,
  ): Promise<ReconcileOutput>;
  checkSparqlReachable(projectId: string): Promise<boolean>;
  /** Returns the curated NL+SPARQL samples for the project, or `undefined`
   *  if no `fewShotsFile` is configured or the file is missing. */
  getFewShots(projectId: string): Promise<FewShot[] | undefined>;
  /** Every concept of a vocabulary, with its labels. */
  listConcepts(projectId: string, scheme: string): Promise<ConceptInfo[]>;
}

const SKOS = "http://www.w3.org/2004/02/skos/core#";

type SparqlTerm = { value: string; "xml:lang"?: string };
type SparqlRow = Record<string, SparqlTerm | undefined>;

function rowsOf(result: Record<string, unknown>): SparqlRow[] {
  return (
    (result.results as { bindings?: SparqlRow[] } | undefined)?.bindings ?? []
  );
}

/**
 * The `shaclTypes` of the reconciliation services of a project, all of them
 * together, or undefined when none of the services lists any.
 */
function shaclTypesOf(
  reconciliation:
    | ReconciliationServiceConfig
    | ReconciliationServiceConfig[]
    | undefined,
): string[] | undefined {
  const services = !reconciliation
    ? []
    : Array.isArray(reconciliation)
      ? reconciliation
      : [reconciliation];
  const types = [...new Set(services.flatMap((s) => s.shaclTypes ?? []))];
  return types.length > 0 ? types : undefined;
}

function withLang(term: SparqlTerm): string {
  const lang = term["xml:lang"];
  return lang ? `${term.value}@${lang}` : term.value;
}

/**
 * Adapter that reads project configuration from the existing
 * ConfigProvider (YAML-based) used by the rest of sparnatural-platform.
 */
export class ConfigBackedProjectConfigAdapter implements ProjectConfigAdapter {
  async getProjectConfig(projectId: string): Promise<ProjectConfig> {
    const config = ConfigProvider.getInstance().getConfig();
    const projectConfig = config.projects?.[projectId];

    if (!projectConfig) {
      throw new Error(
        `Unknown project '${projectId}'. Available projects: ${Object.keys(config.projects ?? {}).join(", ")}`,
      );
    }

    if (!projectConfig.sparqlEndpoint) {
      throw new Error(
        `No sparqlEndpoint configured for project '${projectId}'.`,
      );
    }

    return {
      projectId,
      sparqlEndpoint: projectConfig.sparqlEndpoint,
      shaclPath: projectConfig.shacl,
      shaclTypes:
        shaclTypesOf(projectConfig.reconciliation) ??
        (await this.resolveShaclTypesFromModel(projectId)),
      useCases: projectConfig.useCases,
      fewShotsFile: projectConfig.fewShotsFile,
      conceptSchemes: projectConfig.conceptSchemes,
    };
  }

  /**
   * Values the `type` parameter accepts when the YAML lists none: the
   * NodeShape IRIs, the vocabulary every reconciliation service expects.
   */
  private async resolveShaclTypesFromModel(
    projectId: string,
  ): Promise<string[] | undefined> {
    try {
      const { model } = await getSHACLConfig(projectId);
      const shapes = listNodeShapeIris(model);
      return shapes.length > 0 ? shapes : undefined;
    } catch {
      return undefined;
    }
  }

  async getFewShots(projectId: string): Promise<FewShot[] | undefined> {
    const { fewShotsFile } = await this.getProjectConfig(projectId);
    return loadFewShots(fewShotsFile);
  }

  // For simplicity, this method directly executes the SPARQL query against the endpoint.
  // in review "usr sparql route or not with creating a sheard service"
  async executeSparql(
    projectId: string,
    query: string,
  ): Promise<Record<string, unknown>> {
    const config = await this.getProjectConfig(projectId);

    const response = await axios({
      method: "POST",
      url: config.sparqlEndpoint,
      timeout: SPARQL_TIMEOUT_MS,
      headers: {
        Accept: "application/sparql-results+json, application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams({ query }),
    });

    return response.data;
  }

  // Ping the SPARQL endpoint with a cheap ASK query, timeboxed to 2s.
  // Returns true if the endpoint replied 2xx within the timeout, false otherwise.
  async checkSparqlReachable(projectId: string): Promise<boolean> {
    try {
      const config = await this.getProjectConfig(projectId);
      await axios({
        method: "POST",
        url: config.sparqlEndpoint,
        timeout: 2000,
        headers: {
          Accept: "application/sparql-results+json, application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: new URLSearchParams({ query: "ASK { ?s ?p ?o }" }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // get NodeShapes from the SHACL file, optionally filtered by shapeIri
  async getShaclNodeShapes(
    projectId: string,
    lang = "fr",
    shapes?: string[],
  ): Promise<{ shapes: NodeShapeInfo[]; prefixes: [string, string][] }> {
    await this.getProjectConfig(projectId);
    const { ttl } = loadShaclTtl(projectId);
    const { model } = await getSHACLConfig(projectId);
    const prefixes = extractPrefixesFromTtl(ttl);
    // Extract shapes in compact form (when prefixes present) for returning
    const extractedCompact = extractNodeShapes(model, lang, prefixes);

    // If a shapes filter is provided, accept either compacted prefixes
    // (e.g. "med:Voie") or full IRIs (e.g. "http://.../medicament/Voie").
    if (shapes && shapes.length > 0) {
      // Also extract raw IRIs (no compaction) to allow matching full IRIs
      const extractedRaw = extractNodeShapes(model, lang, []);
      const filterSet = new Set(shapes);

      const filtered: NodeShapeInfo[] = [];
      for (let i = 0; i < extractedCompact.length; i++) {
        const compactIri = extractedCompact[i].shapeIri;
        const rawIri = extractedRaw[i]?.shapeIri;
        if (filterSet.has(compactIri) || filterSet.has(rawIri)) {
          filtered.push(extractedCompact[i]);
        }
      }

      return { shapes: filtered, prefixes };
    }

    return { shapes: extractedCompact, prefixes };
  }

  // get compact overview (topology only, no descriptions/agentInstructions)
  async getShaclNodeShapesOverview(
    projectId: string,
    lang = "fr",
  ): Promise<{
    shapes: NodeShapeOverviewInfo[];
    prefixes: [string, string][];
  }> {
    await this.getProjectConfig(projectId);
    const { ttl } = loadShaclTtl(projectId);
    const { model } = await getSHACLConfig(projectId);
    const prefixes = extractPrefixesFromTtl(ttl);
    const shapes = extractNodeShapesOverview(model, lang, prefixes);
    return { shapes, prefixes };
  }

  async getShaclPrefixes(projectId: string): Promise<[string, string][]> {
    await this.getProjectConfig(projectId);
    const { ttl } = loadShaclTtl(projectId);
    return extractPrefixesFromTtl(ttl);
  }

  async getShapesGraphMeta(
    projectId: string,
    lang = "fr",
  ): Promise<{
    title?: string;
    description?: string;
    agentInstruction?: string;
  }> {
    const { model } = await getSHACLConfig(projectId);
    const sg = new ShapesGraph(model);
    return {
      title: sg.getTitle(lang),
      //description: sg.getDescription(lang),
      agentInstruction: sg.getAgentInstruction(lang),
    };
  }

  async reconcileEntities(
    projectId: string,
    queries: ReconcileInput,
    includeTypes = false,
  ): Promise<ReconcileOutput> {
    const project = AppConfig.getInstance().getProject(projectId);
    return project.reconcileService.reconcileQueries(queries, includeTypes);
  }

  // The concepts of each vocabulary, by project and vocabulary: read once in
  // the data, then kept in memory. Forgotten on failure, so that the next
  // call tries again.
  private readonly concepts = new Map<string, Promise<ConceptInfo[]>>();

  listConcepts(projectId: string, scheme: string): Promise<ConceptInfo[]> {
    const key = `${projectId}|${scheme}`;
    let concepts = this.concepts.get(key);
    if (!concepts) {
      concepts = this.loadConcepts(projectId, scheme).catch((err) => {
        this.concepts.delete(key);
        throw err;
      });
      this.concepts.set(key, concepts);
    }
    return concepts;
  }

  private async loadConcepts(
    projectId: string,
    scheme: string,
  ): Promise<ConceptInfo[]> {
    const query = `PREFIX skos: <${SKOS}>
SELECT ?concept ?kind ?label WHERE {
  ?concept skos:inScheme|skos:topConceptOf <${scheme}> .
  OPTIONAL {
    { ?concept skos:prefLabel ?label BIND("pref" AS ?kind) }
    UNION
    { ?concept skos:altLabel ?label BIND("alt" AS ?kind) }
  }
}`;
    const concepts = new Map<
      string,
      { prefLabels: Set<string>; altLabels: Set<string> }
    >();
    for (const row of rowsOf(await this.executeSparql(projectId, query))) {
      if (!row.concept) continue;
      const iri = row.concept.value;
      if (!concepts.has(iri))
        concepts.set(iri, { prefLabels: new Set(), altLabels: new Set() });
      if (!row.label) continue;
      const entry = concepts.get(iri)!;
      (row.kind?.value === "alt" ? entry.altLabels : entry.prefLabels).add(
        withLang(row.label),
      );
    }
    return [...concepts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iri, { prefLabels, altLabels }]) => ({
        iri,
        prefLabels: [...prefLabels],
        altLabels: [...altLabels],
      }));
  }
}
