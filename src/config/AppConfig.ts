import "reflect-metadata";
import { container, DependencyContainer } from "tsyringe";
import { Project } from "./Project";
import {
  ProjectConfig,
  ReconciliationServiceConfig,
  SparqlReconcileServiceConfig,
} from "./ProjectConfig";
import { ConfigProvider } from "./ConfigProvider";
import { SparqlReconcileService } from "../services/reconciliation/impl/SparqlReconcileService";
import { SparqlReconcileServiceV13 } from "../services/reconciliation/impl/SparqlReconcileServiceV13";
import { LuceneGraphDBReconcileService } from "../services/reconciliation/impl/LuceneGraphDBReconcileService";
import { LunrReconcileService } from "../services/reconciliation/impl/lunr/LunrReconcileService";
import { IsidoreApiReconcileService } from "../services/reconciliation/impl/IsidoreApiReconcileService";
import { ChainedReconcileService } from "../services/reconciliation/ChainedReconcileService";
import { ReconcileServiceIfc } from "../services/reconciliation/interfaces/ReconcileServiceIfc";

const DEFAULT_RECONCILIATION_CONFIG: SparqlReconcileServiceConfig = {
  cacheSize: 1000,
  maxResults: 10,
};

export class AppConfig {
  private static instance: AppConfig;

  private config: any;
  private cache: Record<string, Project> = {};

  private constructor() {
    this.config = ConfigProvider.getInstance().getConfig();
    this.initContainer();
  }

  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  listProjects(): string[] {
    return Object.keys(this.config.projects);
  }

  hasProject(projectKey: string): boolean {
    return this.config.projects.hasOwnProperty(projectKey);
  }

  getProject(projectKey: string): Project {
    if (this.cache[projectKey]) {
      return this.cache[projectKey];
    } else {
      if (!this.hasProject(projectKey)) {
        throw new Error(`Unknown project: ${projectKey}`);
      }

      let projectContainer = this.buildProjectContainer(projectKey);
      // resolve the project by is class, not by token, to get all dependencies injected
      let p: Project = projectContainer.resolve<Project>(Project);
      this.cache[projectKey] = p;

      console.dir(p);
      return p;
    }
  }

  buildProjectContainer(projectKey: string): DependencyContainer {
    let projectContainer = container.createChildContainer();

    let projectConfig = this.config.projects[projectKey];
    // 1. register the project ID
    projectContainer.register<string>("project.id", { useValue: projectKey });
    // 2. register the complete project config
    projectContainer.register<ProjectConfig>("project.config", {
      useValue: projectConfig,
    });
    projectContainer.register<string>("project.sparqlEndpoint", {
      useValue: projectConfig.sparqlEndpoint,
    });
    // 3. Build and register the reconciliation service (single or chained)
    const reconciliationRaw = projectConfig.reconciliation;
    const reconciliationList: ReconciliationServiceConfig[] = !reconciliationRaw
      ? []
      : Array.isArray(reconciliationRaw)
        ? reconciliationRaw
        : [reconciliationRaw];

    if (reconciliationList.length === 0) {
      projectContainer.register("reconciliation", {
        useToken: "default:reconciliation",
      });
      projectContainer.register("reconciliation.config", {
        useValue: DEFAULT_RECONCILIATION_CONFIG,
      });
    } else if (reconciliationList.length === 1) {
      projectContainer.register("reconciliation", {
        useToken: reconciliationList[0].implementation,
      });
      projectContainer.register("reconciliation.config", {
        useValue: reconciliationList[0],
      });
    } else {
      // Build each service in its own child container so each gets its own config,
      // then wrap them all in a ChainedReconcileService.
      projectContainer.register("reconciliation", {
        useFactory: (c) => {
          const services: ReconcileServiceIfc[] = reconciliationList.map(
            (cfg) => {
              const child = c.createChildContainer();
              child.register("reconciliation.config", { useValue: cfg });
              return child.resolve<ReconcileServiceIfc>(
                cfg.implementation as any,
              );
            },
          );
          return new ChainedReconcileService(services);
        },
      });
      projectContainer.register("reconciliation.config", {
        useValue: reconciliationList[0],
      });
    }

    return projectContainer;
  }

  initContainer(): void {
    container.register("SparqlReconcileService", {
      useClass: SparqlReconcileService,
    });

    container.register("SparqlReconcileServiceV13", {
      useClass: SparqlReconcileServiceV13,
    });

    container.register("LuceneGraphDBReconcileService", {
      useClass: LuceneGraphDBReconcileService,
    });

    container.register("LunrReconcileService", {
      useClass: LunrReconcileService,
    });

    container.register("IsidoreApiReconcileService", {
      useClass: IsidoreApiReconcileService,
    });
  }
}
