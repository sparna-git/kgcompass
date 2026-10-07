/**
 * Library entry point of KGCompass: the reconciliation part, for the projects
 * that import KGCompass without running its MCP server (sparnatural-services).
 *
 * KGCompass reads the YAML config of the host process (the `--config=`
 * argument), and takes from each project its `sparqlEndpoint`, `shacl`,
 * `shaclTypes` and `reconciliation` keys.
 */
import "reflect-metadata";
import { AppConfig } from "./config/AppConfig";
import type { ReconcileServiceIfc } from "./reconciliation/interfaces/ReconcileServiceIfc";

/**
 * The reconciliation service of a project (single or chained), as configured
 * in its `reconciliation` section. One instance per project.
 *
 * Always get the services through this function rather than registering the
 * classes below in another tsyringe container: a host that loads its own copy
 * of tsyringe cannot inject their constructor parameters.
 */
export function getReconcileService(projectKey: string): ReconcileServiceIfc {
  return AppConfig.getInstance().getProject(projectKey).reconcileService;
}

export { warmUpLunrIndexes } from "./reconciliation/warmUpLunrIndexes";

export * from "./reconciliation/interfaces/ReconcileServiceIfc";
export { ChainedReconcileService } from "./reconciliation/ChainedReconcileService";
export { SparqlReconcileService } from "./reconciliation/impl/SparqlReconcileService";
export { SparqlReconcileServiceV13 } from "./reconciliation/impl/SparqlReconcileServiceV13";
export { LuceneGraphDBReconcileService } from "./reconciliation/impl/LuceneGraphDBReconcileService";
export { LunrReconcileService } from "./reconciliation/impl/lunr/LunrReconcileService";
export { IsidoreApiReconcileService } from "./reconciliation/impl/IsidoreApiReconcileService";

export type {
  ReconciliationServiceConfig,
  SparqlReconcileServiceConfig,
  SparqlReconcileServiceV13Config,
  LuceneGraphDBReconcileServiceConfig,
  LunrReconcileServiceConfig,
  FieldQueryConfig,
  IsidoreApiReconcileServiceConfig,
} from "./config/ProjectConfig";
