
import { Store } from 'react-redux';
import { ImageEditorTool, ImageEditorStore, TilemapState, AnimationState } from './store/imageReducer';
import { dispatchChangeZoom, dispatchUndoImageEdit, dispatchRedoImageEdit, dispatchChangeImageTool, dispatchSwapBackgroundForeground, dispatchChangeSelectedColor, dispatchImageEdit} from './actions/dispatch';
import { mainStore } from './store/imageStore';
import { EditState, flipEdit, getEditState, rotateEdit } from './toolDefinitions';
let store = mainStore;

let lockRefs: number[] = [];

export function addKeyListener() {
    lockRefs = [];
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleUndoRedo, true);
    document.addEventListener("keydown", overrideBlocklyShortcuts, true);
}

export function removeKeyListener() {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keydown", handleUndoRedo, true);
    document.removeEventListener("keydown", overrideBlocklyShortcuts, true);
}

// Disables shortcuts and returns a ref. Enable by passing the ref to release shortcut lock
export function obtainShortcutLock(): number {
    let ref = 0;
    while (!ref) ref = Math.random() * Number.MAX_SAFE_INTEGER
    lockRefs.push(ref);
    return ref;
}

// Enables shortcuts using the ref obtained from obtainShortcutLock
export function releaseShortcutLock(ref: number) {
    const index = lockRefs.indexOf(ref)
    if (index !== -1) {
        lockRefs.splice(index, 1);
    }
}

export function areShortcutsEnabled() {
    return !lockRefs.length;
}

export function setStore(newStore?: Store<ImageEditorStore>) {
    store = newStore || mainStore;
}

function handleUndoRedo(event: KeyboardEvent) {
    const controlOrMeta = event.ctrlKey || event.metaKey; // ctrl on windows, meta on mac
    if (event.key === "Undo" || (controlOrMeta && event.key === "z")) {
        undo();
        event.preventDefault();
        event.stopPropagation();
    } else if (event.key === "Redo" || (controlOrMeta && event.key === "y")) {
        redo();
        event.preventDefault();
        event.stopPropagation();
    }
}

function overrideBlocklyShortcuts(event: KeyboardEvent) {
    if (event.key === "Backspace" || event.key === "Delete") {
        event.stopPropagation();
    }
}

function handleKeyDown(event: KeyboardEvent) {
    if (!areShortcutsEnabled()) return;
    // Mostly copied from the photoshop shortcuts
    switch (event.key) {
        case "e":
            setTool(ImageEditorTool.Erase);
            break;
        case "h":
            setTool(ImageEditorTool.Pan);
            break;
        case "b":
        case "p":
            setTool(ImageEditorTool.Paint);
            break;
        case "g":
            setTool(ImageEditorTool.Fill);
            break;
        case "m":
            setTool(ImageEditorTool.Marquee);
            break;
        case "u":
            setTool(ImageEditorTool.Rect);
            break;
        case "-":
        case "_":
            zoom(-1);
            break;
        case "=":
        case "+":
            zoom(1);
            break;
        case "x":
            swapForegroundBackground();
            break;
        case "H":
            flip(false);
            break;
        case "V":
            flip(true);
            break;
        case "[":
            rotate(false);
            break;
        case "]":
            rotate(true);
            break;
    }

    const editorState = store.getState().editor;

    if (!editorState.isTilemap && /^Digit\d$/.test(event.code)) {
        const keyAsNum = +event.code.slice(-1);
        const color = keyAsNum + (event.shiftKey ? 9 : 0);
        // TODO: if we need to generalize for different numbers of colors,
        // will need to fix the magic 16 here
        if (color >= 0 && color < 16)
            setColor(color);
    }
}

function currentEditState(): [EditState, "tilemap" | "animation" | "image"] {
    const state = store.getState();

    if (state.editor.isTilemap) {
        const tilemapState = state.store.present as TilemapState;
        return [getEditState(tilemapState.tilemap, true, state.editor.drawingMode), "tilemap"]
    }
    else {
        const animationState = state.store.present as AnimationState;
        return [getEditState(animationState.frames[animationState.currentFrame], false, state.editor.drawingMode), animationState.frames.length > 1 ? "animation" : "image" ]
    }
}

function undo() {
    dispatchAction(dispatchUndoImageEdit());
}

function redo() {
    dispatchAction(dispatchRedoImageEdit());
}

function setTool(tool: ImageEditorTool) {
    dispatchAction(dispatchChangeImageTool(tool));
}

function setColor(selectedColor: number) {
    dispatchAction(dispatchChangeSelectedColor(selectedColor))
}

function zoom(delta: number) {
    dispatchAction(dispatchChangeZoom(delta));
}

function swapForegroundBackground() {
    dispatchAction(dispatchSwapBackgroundForeground());
}

function dispatchAction(action: any) {
    store.dispatch(action);
}

export function flip(vertical: boolean) {
    const [ editState, type ] = currentEditState();
    const flipped = flipEdit(editState, vertical, type === "tilemap");
    dispatchAction(dispatchImageEdit(flipped.toImageState()));
}

export function rotate(clockwise: boolean) {
    const [ editState, type ] = currentEditState();
    const rotated = rotateEdit(editState, clockwise, type === "tilemap", type === "animation");
    dispatchAction(dispatchImageEdit(rotated.toImageState()));
}
