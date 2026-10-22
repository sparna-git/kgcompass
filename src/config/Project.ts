import { inject, injectable } from "tsyringe";
import { NoOpReconcileService, ReconcileServiceIfc } from "kgreconcile";

@injectable({ token: "Project" })
export class Project {
  public projectId: string;
  public sparqlEndpoint: string;
  public reconcileService: ReconcileServiceIfc;

  constructor(
    @inject("project.id") projectId: string,
    @inject("project.sparqlEndpoint") sparqlEndpoint: string,
    @inject("reconciliation") reconcileService?: ReconcileServiceIfc,
  ) {
    if (!reconcileService) {
      console.warn(
        `No reconciliation service was passed in constructor or ${projectId}`,
      );
    }
    this.projectId = projectId;
    this.sparqlEndpoint = sparqlEndpoint;
    this.reconcileService = reconcileService || new NoOpReconcileService();
  }
}
