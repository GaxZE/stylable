import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawn, ChildProcessWithoutNullStreams, spawnSync } from 'child_process';
import { on } from 'events';
import { join, relative } from 'path';

interface ProcessCliOutputParams {
    dirPath: string;
    args: string[];
    resolveStepsDelay?: number;
    steps: Array<{ msg: string | string[]; action?: () => void }>;
}

interface ProcessCliOutputResult {
    output: string;
}

export function createCliTester() {
    const cliProcesses: ChildProcessWithoutNullStreams[] = [];

    function processCliOutput({
        dirPath,
        args,
        steps,
        resolveStepsDelay,
    }: ProcessCliOutputParams): Promise<ProcessCliOutputResult> {
        const cliProcess = runCli(['--rootDir', dirPath, '--log', ...args], dirPath);
        cliProcesses.push(cliProcess as any);

        const found = [];
        const outputs: string[] = [];

        return new Promise((result, reject) => {
            let timer: NodeJS.Timeout;
            void run()
                .then(() => result({ output: outputs.join('\n') }))
                .catch(reject);

            async function run() {
                for await (const e of on(cliProcess.stdout as any, 'data')) {
                    const step = steps[found.length];
                    const lines = e.toString().split('\n');
                    outputs.push(...lines);

                    if (!step) {
                        continue;
                    }

                    for (const line of lines) {
                        if (match(step.msg, line)) {
                            found.push(true);

                            if (step.action) {
                                step.action();
                            }

                            if (steps.length === found.length) {
                                if (resolveStepsDelay) {
                                    if (!timer) {
                                        timer = setTimeout(
                                            () => result({ output: outputs.join('\n') }),
                                            resolveStepsDelay
                                        );
                                    }
                                } else {
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    function match(source: string | string[], target: string) {
        if (typeof source === 'string') {
            return target.includes(source);
        } else if (Array.isArray(source)) {
            const latestIndex = -Infinity;

            for (const current of source) {
                const currentIndex = target.indexOf(current);

                if (currentIndex < 0 || currentIndex < latestIndex) {
                    return false;
                }
            }

            return true;
        } else {
            return false;
        }
    }

    return {
        run: processCliOutput,
        cleanup() {
            for (const cliProcess of cliProcesses) {
                cliProcess.kill();
            }
            cliProcesses.length = 0;
        },
    };
}

export function writeToExistingFile(filePath: string, content: string) {
    if (existsSync(filePath)) {
        writeFileSync(filePath, content);
    } else {
        throw new Error(`file ${filePath} does not exist`);
    }
}

export function runCli(cliArgs: string[] = [], cwd: string) {
    const cliPath = require.resolve('@stylable/cli/bin/stc.js');
    return spawn('node', [cliPath, ...cliArgs], { cwd });
}

export function runCliSync(cliArgs: string[] = []) {
    const cliPath = require.resolve('@stylable/cli/bin/stc.js');
    return spawnSync('node', [cliPath, ...cliArgs], { encoding: 'utf8' });
}

export function runFormatCliSync(cliArgs: string[] = []) {
    const cliPath = require.resolve('@stylable/cli/bin/stc-format.js');
    return spawnSync('node', [cliPath, ...cliArgs], { encoding: 'utf8' });
}

export function runCliCodeMod(cliArgs: string[] = []) {
    const cliPath = require.resolve('@stylable/cli/bin/stc-codemod.js');
    return spawnSync('node', [cliPath, ...cliArgs], { encoding: 'utf8' });
}

export interface Files {
    [filepath: string]: string;
}

export interface FilesStructure {
    [filepath: string]: string | FilesStructure;
}

export function loadDirSync(rootPath: string, dirPath: string = rootPath): Files {
    return readdirSync(dirPath).reduce<Files>((acc, entry) => {
        const fullPath = join(dirPath, entry);
        const key = relative(rootPath, fullPath).replace(/\\/g, '/');
        const stat = statSync(fullPath);
        if (stat.isFile()) {
            acc[key] = readFileSync(fullPath, 'utf8');
        } else if (stat.isDirectory()) {
            return {
                ...acc,
                ...loadDirSync(rootPath, fullPath),
            };
        } else {
            throw new Error('Not Implemented');
        }
        return acc;
    }, {});
}

export function populateDirectorySync(rootDir: string, files: FilesStructure) {
    for (const [filePath, content] of Object.entries(files)) {
        if (typeof content === 'object') {
            const dirPath = join(rootDir, filePath);
            mkdirSync(dirPath);
            populateDirectorySync(dirPath, content);
        } else {
            writeFileSync(join(rootDir, filePath), content);
        }
    }
}
