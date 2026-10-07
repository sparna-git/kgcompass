import { AppConfig } from "../config/AppConfig";
import { ChainedReconcileService } from "./ChainedReconcileService";
import { LunrReconcileService } from "./impl/lunr/LunrReconcileService";

/**
 * Pre-warms the Lunr indexes of all projects that use LunrReconcileService
 * (direct or chained). To be called once the server is listening: until the
 * returned promise resolves, a reconciliation call waits for its index.
 */
export function warmUpLunrIndexes(): Promise<void> {
  const warmUps: Promise<void>[] = [];

  for (const projectKey of AppConfig.getInstance().listProjects()) {
    const project = AppConfig.getInstance().getProject(projectKey);
    const service = project.reconcileService;

    const lunrServices: LunrReconcileService[] = [];
    if (service instanceof LunrReconcileService) {
      lunrServices.push(service);
    } else if (service instanceof ChainedReconcileService) {
      for (const s of service.services) {
        if (s instanceof LunrReconcileService) lunrServices.push(s);
      }
    }

    for (const lunr of lunrServices) {
      console.log(`[lunr] Warming up index for project "${projectKey}"…`);
      warmUps.push(
        lunr.warmUp().catch((err) => {
          console.error(
            `[lunr] Index warm-up FAILED for project "${projectKey}":`,
            err,
          );
        }),
      );
    }
  }

  if (warmUps.length === 0) return Promise.resolve();

  return Promise.all(warmUps).then(() => {
    console.log("✅ Lunr indexes ready — reconciliation is operational");
  });
}
