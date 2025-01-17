import type * as postcss from 'postcss';
import postcssValueParser, {
    ParsedValue as PostCSSParsedValue,
    FunctionNode,
    WordNode,
    Node as ValueNode,
} from 'postcss-value-parser';
import type { Diagnostics } from './diagnostics';
import { processPseudoStates } from './pseudo-states';
import { parseSelectorWithCache } from './helpers/selector';
import type { ParsedValue, StateParsedValue } from './types';

export const valueParserWarnings = {
    VALUE_CANNOT_BE_STRING() {
        return 'value can not be a string (remove quotes?)';
    },
    CSS_MIXIN_FORCE_NAMED_PARAMS() {
        return 'CSS mixins must use named parameters (e.g. "func(name value, [name value, ...])")';
    },
    INVALID_NAMED_IMPORT_AS(name: string) {
        return `Invalid named import "as" with name "${name}"`;
    },
    INVALID_NESTED_KEYFRAMES(name: string) {
        return `Invalid nested keyframes import "${name}"`;
    },
};

export interface MappedStates {
    [s: string]: StateParsedValue | string | null;
}

// TODO: remove
export interface TypedClass {
    '-st-root'?: boolean;
    '-st-states'?: string[] | MappedStates;
    '-st-extends'?: string;
}

export interface MixinValue {
    type: string;
    options: Array<{ value: string }> | Record<string, string>;
    partial?: boolean;
    valueNode?: FunctionNode | WordNode;
    originDecl?: postcss.Declaration;
}

export interface ArgValue {
    type: string;
    value: string;
}
export interface ExtendsValue {
    symbolName: string;
    args: ArgValue[][] | null;
}

export type ReportWarning = (message: string, options?: { word: string }) => void;

export const rootValueMapping = {
    vars: ':vars' as const,
    import: ':import' as const,
    stScope: 'st-scope' as const,
    namespace: 'namespace' as const,
};

export const valueMapping = {
    from: '-st-from' as const,
    named: '-st-named' as const,
    default: '-st-default' as const,
    root: '-st-root' as const,
    states: '-st-states' as const,
    extends: '-st-extends' as const,
    mixin: '-st-mixin' as const,
    partialMixin: '-st-partial-mixin' as const,
    global: '-st-global' as const,
};

export const paramMapping = {
    global: 'st-global' as const,
};

export const mixinDeclRegExp = new RegExp(`(${valueMapping.mixin})|(${valueMapping.partialMixin})`);

export type stKeys = keyof typeof valueMapping;

export const stValues: string[] = Object.keys(valueMapping).map(
    (key) => valueMapping[key as stKeys]
);

export const animationPropRegExp = /animation$|animation-name$/;

export const globalValueRegExp = new RegExp(`^${paramMapping.global}\\((.*?)\\)$`);

export const stValuesMap: Record<string, boolean> = Object.keys(valueMapping).reduce((acc, key) => {
    acc[valueMapping[key as stKeys]] = true;
    return acc;
}, {} as Record<string, boolean>);

export const STYLABLE_VALUE_MATCHER = /^-st-/;
export const STYLABLE_NAMED_MATCHER = new RegExp(`^${valueMapping.named}-(.+)`);

export const SBTypesParsers = {
    '-st-root'(value: string) {
        return value === 'false' ? false : true;
    },
    '-st-global'(decl: postcss.Declaration, _diagnostics: Diagnostics) {
        // Experimental
        const selector = parseSelectorWithCache(
            decl.value.replace(/^['"]/, '').replace(/['"]$/, ''),
            { clone: true }
        );
        // ToDo: handle or warn on multiple selectors
        return selector[0].nodes;
    },
    '-st-states'(value: string, decl: postcss.Declaration, diagnostics: Diagnostics) {
        if (!value) {
            return {};
        }

        return processPseudoStates(value, decl, diagnostics);
    },
    '-st-extends'(value: string) {
        const ast = postcssValueParser(value);
        const types: ExtendsValue[] = [];

        ast.walk((node: any) => {
            if (node.type === 'function') {
                const args = getNamedArgs(node);

                types.push({
                    symbolName: node.value,
                    args,
                });

                return false;
            } else if (node.type === 'word') {
                types.push({
                    symbolName: node.value,
                    args: null,
                });
            }
            return undefined;
        }, false);

        return {
            ast,
            types,
        };
    },
    '-st-named'(
        value: string,
        node: postcss.Declaration | postcss.AtRule,
        diagnostics: Diagnostics
    ) {
        const namedMap: Record<string, string> = {};
        const keyframesMap: Record<string, string> = {};
        if (value) {
            handleNamedTokens(
                postcssValueParser(value),
                { namedMap, keyframesMap },
                'namedMap',
                node,
                diagnostics
            );
        }
        return { namedMap, keyframesMap };
    },
    '-st-mixin'(
        mixinNode: postcss.Declaration,
        strategy: (type: string) => 'named' | 'args',
        diagnostics?: Diagnostics,
        emitStrategyDiagnostics = true
    ) {
        const ast = postcssValueParser(mixinNode.value);
        const mixins: Array<MixinValue> = [];

        function reportWarning(message: string, options?: { word: string }) {
            if (emitStrategyDiagnostics) {
                diagnostics?.warn(mixinNode, message, options);
            }
        }

        ast.nodes.forEach((node) => {
            if (node.type === 'function') {
                mixins.push({
                    type: node.value,
                    options: strategies[strategy(node.value)](node, reportWarning),
                    valueNode: node,
                    originDecl: mixinNode,
                });
            } else if (node.type === 'word') {
                mixins.push({
                    type: node.value,
                    options: strategy(node.value) === 'named' ? {} : [],
                    valueNode: node,
                    originDecl: mixinNode,
                });
            } else if (node.type === 'string') {
                diagnostics?.error(mixinNode, valueParserWarnings.VALUE_CANNOT_BE_STRING(), {
                    word: mixinNode.value,
                });
            }
        });

        return mixins;
    },
    '-st-partial-mixin'(
        mixinNode: postcss.Declaration,
        strategy: (type: string) => 'named' | 'args',
        diagnostics?: Diagnostics
    ) {
        return SBTypesParsers['-st-mixin'](mixinNode, strategy, diagnostics).map((mixin) => {
            mixin.partial = true;
            return mixin;
        });
    },
};

function handleNamedTokens(
    tokens: PostCSSParsedValue | FunctionNode,
    buckets: { namedMap: Record<string, string>; keyframesMap: Record<string, string> },
    key: keyof typeof buckets = 'namedMap',
    node: postcss.Declaration | postcss.AtRule,
    diagnostics: Diagnostics
) {
    const { nodes } = tokens;
    for (let i = 0; i < nodes.length; i++) {
        const token = nodes[i];
        if (token.type === 'word') {
            const space = nodes[i + 1];
            const as = nodes[i + 2];
            const spaceAfter = nodes[i + 3];
            const asName = nodes[i + 4];
            if (isImportAs(space, as)) {
                if (spaceAfter?.type === 'space' && asName?.type === 'word') {
                    buckets[key][asName.value] = token.value;
                    i += 4; //ignore next 4 tokens
                } else {
                    i += !asName ? 3 : 2;
                    diagnostics.warn(
                        node,
                        valueParserWarnings.INVALID_NAMED_IMPORT_AS(token.value)
                    );
                    continue;
                }
            } else {
                buckets[key][token.value] = token.value;
            }
        } else if (token.type === 'function' && token.value === 'keyframes') {
            if (key === 'keyframesMap') {
                diagnostics.warn(
                    node,
                    valueParserWarnings.INVALID_NESTED_KEYFRAMES(
                        postcssValueParser.stringify(token)
                    )
                );
            }
            handleNamedTokens(token, buckets, 'keyframesMap', node, diagnostics);
        }
    }
}

function isImportAs(space: ParsedValue, as: ParsedValue) {
    return space?.type === 'space' && as?.type === 'word' && as?.value === 'as';
}

export function getNamedArgs(node: ParsedValue) {
    const args: ParsedValue[][] = [];
    if (node.nodes.length) {
        args.push([]);
        node.nodes.forEach((node: any) => {
            if (node.type === 'div') {
                args.push([]);
            } else {
                const { sourceIndex: _sourceIndex, ...clone } = node;
                args[args.length - 1].push(clone);
            }
        });
    }

    // handle trailing comma
    return args.length && args[args.length - 1].length === 0 ? args.slice(0, -1) : args;
}

export function getFormatterArgs(
    node: ParsedValue,
    allowComments = false,
    reportWarning?: ReportWarning,
    preserveQuotes = false
) {
    const argsResult = [];
    let currentArg = '';
    let argIndex = 0;
    for (const currentNode of node.nodes) {
        if (currentNode.type === 'div' && currentNode.value === ',') {
            checkEmptyArg();
            argIndex++;
            argsResult.push(currentArg.trim());
            currentArg = '';
        } else if (currentNode.type === 'comment') {
            if (allowComments) {
                currentArg +=
                    currentNode.resolvedValue || postcssValueParser.stringify(currentNode);
            }
        } else if (currentNode.type === 'string') {
            currentArg += preserveQuotes
                ? postcssValueParser.stringify(currentNode)
                : currentNode.value;
        } else {
            currentArg += currentNode.resolvedValue || postcssValueParser.stringify(currentNode);
        }
    }
    checkEmptyArg();
    argsResult.push(currentArg.trim());

    let i = argsResult.length;
    while (i--) {
        if (argsResult[i] === '') {
            argsResult.pop();
        } else {
            return argsResult;
        }
    }
    return argsResult;

    function checkEmptyArg() {
        if (reportWarning && currentArg.trim() === '') {
            reportWarning(
                `${postcssValueParser.stringify(
                    node as postcssValueParser.Node
                )}: argument at index ${argIndex} is empty`
            );
        }
    }
}

export function getStringValue(nodes: ParsedValue | ParsedValue[]): string {
    return postcssValueParser.stringify(nodes as postcssValueParser.Node, (node) => {
        if ((node as ParsedValue).resolvedValue !== undefined) {
            return (node as ParsedValue).resolvedValue as string | undefined;
        } else {
            // TODO: warn
            return undefined;
        }
    });
}

export function groupValues(nodes: ValueNode[], divType = 'div') {
    const grouped: ValueNode[][] = [];
    let current: ValueNode[] = [];

    nodes.forEach((n: any) => {
        if (n.type === divType) {
            grouped.push(current);
            current = [];
        } else {
            current.push(n);
        }
    });

    const last = grouped[grouped.length - 1];

    if ((last && last !== current && current.length) || (!last && current.length)) {
        grouped.push(current);
    }
    return grouped;
}

export const strategies = {
    named: (node: any, reportWarning?: ReportWarning) => {
        const named: Record<string, string> = {};
        getNamedArgs(node).forEach((mixinArgsGroup) => {
            const argsDivider = mixinArgsGroup[1];
            if (mixinArgsGroup.length < 3 || (argsDivider && argsDivider.type !== 'space')) {
                if (reportWarning) {
                    const argValue = mixinArgsGroup[0];
                    reportWarning(valueParserWarnings.CSS_MIXIN_FORCE_NAMED_PARAMS(), {
                        word: argValue.value,
                    });
                }
                return;
            }
            named[mixinArgsGroup[0].value] = stringifyParam(mixinArgsGroup.slice(2));
        });
        return named;
    },
    args: (node: any, reportWarning?: ReportWarning) => {
        return getFormatterArgs(node, true, reportWarning).map((value) => ({ value }));
    },
};

function stringifyParam(nodes: any) {
    return postcssValueParser.stringify(nodes, (n: any) => {
        if (n.type === 'function') {
            return postcssValueParser.stringify(n);
        } else if (n.type === 'div') {
            return null;
        } else if (n.type === 'string') {
            return n.value;
        } else {
            return undefined;
        }
    });
}

export function listOptions(node: any) {
    return groupValues(node.nodes)
        .map((nodes: any) =>
            postcssValueParser.stringify(nodes, (n: any) => {
                if (n.type === 'div') {
                    return null;
                } else if (n.type === 'string') {
                    return n.value;
                } else {
                    return undefined;
                }
            })
        )
        .filter((x: string) => typeof x === 'string');
}

export function validateAllowedNodesUntil(
    node: ParsedValue,
    i: number,
    untilType = 'div',
    allowed = ['comment']
) {
    i = 1;
    let current = node.nodes[i];
    while (current && current.type !== untilType) {
        if (!allowed.includes(current.type)) {
            return false;
        }
        i++;
        current = node.nodes[i];
    }

    return true;
}
