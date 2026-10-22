import "reflect-metadata";
import { container, DependencyContainer } from "tsyringe";
import { createReconcileService, setLogLevel } from "kgreconcile";
import { Project } from "./Project";
import { ProjectConfig } from "./ProjectConfig";
import { ConfigProvider } from "./ConfigProvider";

export class AppConfig {
  private static instance: AppConfig;

  private config: any;
  private cache: Record<string, Project> = {};

  private constructor() {
    this.config = ConfigProvider.getInstance().getConfig();
    setLogLevel(this.config.log?.level || "info");
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
    // 3. The reconciliation service (single or chained), built by kgreconcile
    // from the "reconciliation" section of the project
    projectContainer.register("reconciliation", {
      useValue: createReconcileService(projectKey, projectConfig),
    });

    return projectContainer;
  }
}
