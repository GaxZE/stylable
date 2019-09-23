// MDN reference: https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
export const nativePseudoClasses = [
    'active',
    'any',
    'any-link',
    'checked',
    'default',
    'defined',
    'dir',
    'disabled',
    'empty',
    'enabled',
    'first',
    'first-child',
    'first-of-type',
    'fullscreen',
    'focus',
    'focus-within',
    'focus-visible',
    'hover',
    'indeterminate',
    'in-range',
    'invalid',
    'lang',
    'last-child',
    'last-of-type',
    'left',
    'link',
    'not',
    'nth-child',
    'nth-last-child',
    'nth-last-of-type',
    'nth-of-type',
    'only-child',
    'only-of-type',
    'optional',
    'out-of-range',
    'placeholder-shown',
    'read-only',
    'read-write',
    'required',
    'right',
    'root',
    'scope',
    'target',
    'valid',
    'visited'
];

export const nativePseudoElements = [
    'after',
    'before',
    'cue',
    'first-letter',
    'first-line',
    'selection',
    'backdrop',
    'placeholder',
    'marker',
    'spelling-error',
    'grammar-error'
];

export const reservedKeyFrames = [
    'none',
    'inherited',
    'initial',
    'unset',
    /* single-timing-function */
    'linear',
    'ease',
    'ease-in',
    'ease-in-out',
    'ease-out',
    'step-start',
    'step-end',
    'start',
    'end',
    /* single-animation-iteration-count */
    'infinite',
    /* single-animation-direction */
    'normal',
    'reverse',
    'alternate',
    'alternate-reverse',
    /* single-animation-fill-mode */
    'forwards',
    'backwards',
    'both',
    /* single-animation-play-state */
    'running',
    'paused'
];

export const nativeFunctionsDic = {
    attr: true,
    blur: true,
    brightness: true,
    calc: true,
    circle: true,
    contrast: true,
    counter: true,
    counters: true,
    'cubic-bezier': true,
    'drop-shadow': true,
    ellipse: true,
    format: true,
    grayscale: true,
    hsl: true,
    hsla: true,
    'hue-rotate': true,
    hwb: true,
    image: true,
    inset: true,
    invert: true,
    'linear-gradient': true,
    matrix: true,
    matrix3d: true,
    minmax: true,
    opacity: true,
    paint: true,
    path: true,
    perspective: true,
    polygon: true,
    'radial-gradient': true,
    rect: true,
    repeat: true,
    'repeating-linear-gradient': true,
    'repeating-radial-gradient': true,
    rgb: true,
    rgba: true,
    rotate: true,
    rotate3d: true,
    rotateX: true,
    rotateY: true,
    rotateZ: true,
    saturate: true,
    sepia: true,
    scale: true,
    scale3d: true,
    scaleX: true,
    scaleY: true,
    scaleZ: true,
    skew: true,
    skewX: true,
    skewY: true,
    symbols: true,
    translate: true,
    translate3d: true,
    translateX: true,
    translateY: true,
    translateZ: true,
    url: true,
    var: true
};

export type nativeFunctions = keyof typeof nativeFunctionsDic;
export function isCssNativeFunction(name: string): name is nativeFunctions {
    return nativeFunctionsDic[name as nativeFunctions];
}
