import { loadStylableConfig } from '@stylable/build-tools';
import { resolveCliOptions, createDefaultOptions } from './resolve-options';
import { removeUndefined } from '../helpers';
import { resolve } from 'path';
import { tryRun } from '../build-tools';
import type {
    CliArguments,
    ConfigOptions,
    Configuration,
    MultipleProjectsConfig,
    PartialConfigOptions,
    ResolveProjectsContext,
    ResolveProjectsRequestsParams,
    STCConfig,
} from './types';
import { resolveNpmProjects } from './project-resolution';

export function projectsConfig(argv: CliArguments): STCConfig {
    const projectRoot = resolve(argv.rootDir);
    const defaultOptions = createDefaultOptions();
    const configFile = resolveConfigFile(projectRoot);
    const cliOptions = resolveCliOptions(argv, defaultOptions);
    const topLevelOptions = mergeProjectsConfigs(defaultOptions, configFile?.options, cliOptions);

    if (isMultpleConfigProject(configFile)) {
        const projects: ResolveProjectsRequestsParams['projects'] = new Map();

        if (Array.isArray(configFile.projects)) {
            for (const projectEntry of configFile.projects) {
                if (typeof projectEntry === 'string') {
                    projects.set(projectEntry, [topLevelOptions]);
                } else {
                    const [request, { options }] = projectEntry;
                    projects.set(
                        request,
                        (Array.isArray(options) ? options : [options])
                            .slice()
                            .map((option) => mergeProjectsConfigs(topLevelOptions, option))
                    );
                }
            }
        } else if (typeof configFile.projects === 'object') {
            for (const [request, options] of Object.entries(projects)) {
                projects.set(
                    request,
                    (Array.isArray(options) ? options : [options])
                        .slice()
                        .map((option) => mergeProjectsConfigs(topLevelOptions, option))
                );
            }
        }

        return resolveProjectsRequests({
            projectRoot,
            projects,
            resolveProjects: configFile.resolveProjects || resolveNpmProjects,
        });
    } else {
        return [
            {
                projectRoot,
                options: [topLevelOptions],
            },
        ];
    }
}

export function resolveConfigFile(context: string) {
    return loadStylableConfig(context, (config) =>
        tryRun(
            () => (isSTCConfig(config) ? config.stcConfig() : undefined),
            'Failed to evaluate "stcConfig"'
        )
    );
}

function isSTCConfig(config: any): config is { stcConfig: Configuration } {
    return typeof config === 'object' && typeof config.stcConfig === 'function';
}

function isMultpleConfigProject(config: any): config is MultipleProjectsConfig {
    return Boolean(config?.projects);
}

function mergeProjectsConfigs(
    ...configs: [ConfigOptions, ...(ConfigOptions | PartialConfigOptions | undefined)[]]
): ConfigOptions {
    const [config, ...rest] = configs;

    return Object.assign(
        { ...config },
        ...rest.map((currentConfig) => (currentConfig ? removeUndefined(currentConfig) : {}))
    );
}

function resolveProjectsRequests({
    projects,
    projectRoot,
    resolveProjects,
}: ResolveProjectsRequestsParams): STCConfig {
    const context: ResolveProjectsContext = { projectRoot };

    return resolveProjects(projects, context);
}
